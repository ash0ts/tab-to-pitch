import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ForgeTransport } from '../forge/transport.mjs';
import { ensurePrivateProject, ENTITY, PROJECT_NAME } from '../forge/project.mjs';
import { readRun } from '../forge/models.mjs';
const verify = process.argv.includes('--verify');
const dir = resolve(process.argv[2]);
const campaign = JSON.parse(await readFile(join(dir, 'campaign.json'), 'utf8'));
const analysis = JSON.parse(await readFile(join(dir, 'analysis.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
if (campaign.status !== 'execution-complete') throw new Error('Incomplete campaign');
const name = dir.split('/').at(-1),
  runName = name + '-comparison',
  out = join(dir, 'publication', 'comparison');
await mkdir(out, { recursive: true });
const sha = (value) => createHash('sha256').update(value).digest('hex');
const publications = {};
for (const group of ['local', 'current', 'evidence-first', 'critic']) {
  const p = JSON.parse(await readFile(join(dir, 'publication', `weave-${group}.json`), 'utf8'));
  if (p.status !== 'verified') throw new Error('Missing verified replay');
  publications[group] = p.url;
}
const columns = [
  'Case',
  'Arm',
  'Trial',
  'Recording',
  'Task',
  'Learner request',
  'Harmony',
  'Response',
  'Actions',
  'Requested artifact delivered',
  'Accepted actor artifact',
  'Fallback',
  'Failure',
  'Actor calls',
  'Critic calls',
  'Tool calls',
  'Execution ms',
  'Accounted USD',
  'Agent Lens',
  'Weave replay',
  'Reviewer correct',
  'Expected approval',
  'Observed approval',
];
const rows = [
  ...campaign.rows.map((r) => {
    const task = manifest.cases.find((t) => t.id === r.taskId);
    return [
      r.id,
      r.arm,
      r.trial,
      r.recording,
      task.kind,
      r.request.request,
      r.request.context.music.spans.map((s) => s.symbol).join(' → '),
      r.output.message,
      JSON.stringify(r.output.actions),
      r.scores.requestedActionDelivered,
      r.scores.actorDelivered,
      r.scores.fallback,
      r.failure,
      r.calls.filter((c) => c.role === 'actor').length,
      r.calls.filter((c) => c.role === 'critic').length,
      r.tools.length,
      r.elapsedMs,
      campaign.requests
        .filter((c) => c.identity === r.id)
        .reduce((n, c) => n + (c.costDollars ?? c.reservedDollars), 0),
      r.traceId
        ? `https://forge.coreweave.com/agent-lens/${ENTITY}/${PROJECT_NAME}/conversations/${r.traceId}`
        : null,
      publications[r.arm],
      null,
      null,
      null,
    ];
  }),
  ...campaign.criticRows.map((r) => [
    r.id,
    'critic',
    0,
    null,
    r.kind,
    null,
    null,
    r.prose,
    null,
    null,
    null,
    null,
    r.failure,
    0,
    r.calls.length,
    0,
    r.elapsedMs,
    campaign.requests
      .filter((c) => c.identity === r.id)
      .reduce((n, c) => n + (c.costDollars ?? c.reservedDollars), 0),
    `https://forge.coreweave.com/agent-lens/${ENTITY}/${PROJECT_NAME}/conversations/${r.traceId}`,
    publications.critic,
    r.correct,
    r.expectedApproved,
    r.output?.approved ?? null,
  ]),
];
const sourceHashes = [
  { run: name, sha256: sha(await readFile(join(dir, 'campaign.json'))) },
  { analysis: sha(await readFile(join(dir, 'analysis.json'))) },
];
const bytes = Buffer.from(JSON.stringify({ columns, data: rows })),
  fileName = 'media/table/guitar-teacher-grounding.table.json',
  path = join(out, 'guitar-teacher-grounding.table.json');
await writeFile(path, bytes);
const receipt = {
  status: 'pending',
  runName,
  sourceHash: sha(Buffer.from(JSON.stringify(sourceHashes))),
  sourceHashes,
  publisherHash: sha(await readFile(new URL(import.meta.url))),
  rows: rows.length,
  sha256: sha(bytes),
  url: `https://forge.coreweave.com/wandb/${ENTITY}/${PROJECT_NAME}/runs/${runName}`,
};
const summary = {
  comparison: {
    _type: 'table-file',
    path: fileName,
    ncols: columns.length,
    nrows: rows.length,
    sha256: receipt.sha256,
    size: bytes.length,
  },
  observedTeacherTurns: campaign.rows.length,
  observedReviewerFixtures: campaign.criticRows.length,
  analysis,
  learnerRequestsAuthored: true,
  qualified: false,
};
const receiptPath = join(out, verify ? `readback-${Date.now()}.json` : 'receipt.json');
await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
const transport = new ForgeTransport({
  directory: join(out, 'requests'),
  mode: 'curl',
  deadlineMs: 30000,
});
async function transfer(url, path, method = 'GET', headers = []) {
  const u = new URL(url);
  if (
    u.protocol !== 'https:' ||
    !/(^|\.)(coreweave\.com|wandb\.ai|googleapis\.com|amazonaws\.com|windows\.net)$/.test(
      u.hostname,
    )
  )
    throw new Error('Unexpected storage URL');
  const config =
    `url = ${JSON.stringify(url)}\nrequest = ${JSON.stringify(method)}\n` +
    headers.map((h) => `header = ${JSON.stringify(h)}\n`).join('') +
    (method === 'PUT'
      ? `upload-file = ${JSON.stringify(path)}\noutput = "/dev/null"\n`
      : `output = ${JSON.stringify(path)}\n`);
  await new Promise((done, reject) => {
    const p = spawn(
      'curl',
      ['--silent', '--show-error', '--fail', '--max-time', '45', '--config', '-'],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    p.stderr.resume();
    p.on('error', reject);
    p.on('close', (n) =>
      n === 0
        ? done()
        : reject(new Error(`Storage transfer failed (${n}); read back before retry`)),
    );
    p.stdin.end(config);
  });
}
try {
  await ensurePrivateProject(transport, { createIfMissing: false });
  if (!verify) {
    if (await readRun(transport, runName)) throw new Error('Run exists; do not overwrite');
    await transport.graphql(
      'mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name}}}',
      {
        input: {
          entityName: ENTITY,
          modelName: PROJECT_NAME,
          name: runName,
          displayName: `${name}: recorded musical tasks and reviewer diagnostic`,
          jobType: 'recorded-agent-evaluation',
          state: 'running',
          config: JSON.stringify({
            learnerRequestsAuthored: { value: true },
            musicalContext: { value: 'GuitarSet 1.1.0 recorded-passage annotations' },
            sourceHash: { value: receipt.sourceHash },
            newTrainingRun: { value: false },
            interpretation: {
              value:
                'Agent behavior; no learner outcomes. Null results are unexecuted or unavailable.',
            },
          }),
        },
      },
      { write: true, key: 'create-run' },
    );
    const uploaded = await transport.graphql(
      'mutation($input:CreateRunFilesInput!){createRunFiles(input:$input){files{name uploadUrl} uploadHeaders}}',
      { input: { entityName: ENTITY, projectName: PROJECT_NAME, runName, files: [fileName] } },
      { write: true, key: 'create-table-file' },
    );
    await transfer(
      uploaded.createRunFiles.files[0].uploadUrl,
      path,
      'PUT',
      uploaded.createRunFiles.uploadHeaders,
    );
    await transport.graphql(
      'mutation($input:MarkRunFilesUploadedInput!){markRunFilesUploaded(input:$input){success}}',
      { input: { entityName: ENTITY, projectName: PROJECT_NAME, runName, files: [fileName] } },
      { write: true, key: 'table-uploaded' },
    );
    await transport.post(
      'api',
      `/files/${ENTITY}/${PROJECT_NAME}/${runName}/file_stream`,
      {
        files: {
          'wandb-summary.json': { offset: 0, content: [JSON.stringify(summary)] },
          'wandb-history.jsonl': { offset: 0, content: [JSON.stringify({ ...summary, _step: 0 })] },
        },
        complete: true,
        exitcode: 0,
      },
      { write: true, key: 'finish' },
    );
  }
  const remote = await transport.graphql(
    'query($e:String!,$p:String!,$r:String!,$names:[String]){project(entityName:$e,name:$p){access run(name:$r){state summaryMetrics files(names:$names){edges{node{name directUrl}}}}}}',
    { e: ENTITY, p: PROJECT_NAME, r: runName, names: [fileName] },
  );
  if (remote.project.access !== 'PRIVATE') throw new Error('Project privacy mismatch');
  const file = remote.project.run.files.edges.find((e) => e.node.name === fileName)?.node;
  if (!file) throw new Error('Missing remote table');
  const downloaded = join(out, 'downloaded.table.json');
  await transfer(file.directUrl, downloaded);
  if (sha(await readFile(downloaded)) !== receipt.sha256)
    throw new Error('Remote table bytes differ');
  const observed = JSON.parse(remote.project.run.summaryMetrics);
  receipt.observedSummary = observed;
  // The service flattens nested metrics and adds the recorded history step.
  // Compare every leaf, including structured table metadata, without relaxing numeric checks.
  const flatten = (value, prefix = '', result = {}) => {
    for (const [key, item] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, path, result);
      else result[path] = item;
    }
    return result;
  };
  if (!isDeepStrictEqual(flatten(observed), flatten({ ...summary, _step: 0 })))
    throw new Error('Remote summary differs');
  receipt.status = 'verified';
  receipt.readback = {
    rowCount: rows.length,
    columns,
    downloadHashMatches: true,
    summaryMatches: true,
    runState: remote.project.run.state,
  };
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  process.exitCode = 1;
} finally {
  transport.close();
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  console.info(JSON.stringify(receipt));
}
