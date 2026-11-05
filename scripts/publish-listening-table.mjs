import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ForgeTransport } from '../research/forge/transport.mjs';
import { ensurePrivateProject, ENTITY, PROJECT_NAME } from '../research/forge/project.mjs';
import { readRun } from '../research/forge/models.mjs';
const dir = resolve(process.argv[2]),
  campaign = JSON.parse(await readFile(join(dir, 'campaign.json'), 'utf8'));
const cases = JSON.parse(await readFile(join(dir, 'cases.json'), 'utf8'));
const name = dir.split('/').at(-1),
  runName = `${name}-comparison`,
  out = join(dir, 'publication', 'table');
await mkdir(out, { recursive: true });
const sha = (value) => createHash('sha256').update(value).digest('hex');
const columns = [
  'Case',
  'Suite',
  'Arm',
  'Trial',
  'Turn',
  'Learner question',
  'Verified context',
  'Teacher response',
  'Actions',
  'Status',
  'Criteria',
  'Execution ms',
  'Accounted USD',
  'Agent Lens',
];
const rows = campaign.rows.map((r) => [
  r.taskId,
  r.suite,
  r.arm,
  r.trial,
  r.turn,
  r.request.request,
  JSON.stringify(r.request.context),
  r.output.message,
  JSON.stringify(r.output.actions),
  r.arm === 'authored-local'
    ? 'authored baseline'
    : r.failure === 'assistance-required'
      ? 'assistance gate (no inference)'
      : r.scores.providerSuccess
        ? 'actor completed'
        : r.output.source === 'local'
          ? 'fallback after actor failure'
          : 'actor failure',
  JSON.stringify(r.scores),
  r.elapsedMs,
  campaign.requests
    .filter((x) => x.identity === r.id)
    .reduce((n, x) => n + (x.costDollars ?? x.reservedDollars ?? 0), 0),
  r.traceId
    ? `https://forge.coreweave.com/agent-lens/${ENTITY}/${PROJECT_NAME}/conversations/${r.traceId}`
    : null,
]);
for (const model of ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'])
  for (let trial = 0; trial < 2; trial++)
    for (const task of [...cases.checkpointCases, ...cases.boundaryCases, ...cases.episodes]) {
      const turns = task.followups ? 6 : 1;
      for (let turn = 0; turn < turns; turn++)
        if (
          !campaign.rows.some(
            (r) => r.arm === model && r.trial === trial && r.taskId === task.id && r.turn === turn,
          )
        )
          rows.push([
            task.id,
            task.followups ? 'episode' : task.suite,
            model,
            trial,
            turn,
            turn ? task.followups[turn - 1] : task.prompt,
            JSON.stringify(task.passage),
            null,
            null,
            'unexecuted',
            null,
            null,
            null,
            null,
          ]);
    }
for (const r of campaign.judgeRows)
  rows.push([
    r.id,
    `judge-${r.phase}`,
    r.model,
    0,
    0,
    null,
    null,
    JSON.stringify(r.result),
    null,
    r.result ? 'evaluator completed' : 'evaluator failure',
    JSON.stringify(r.scores),
    null,
    null,
    r.traceId
      ? `https://forge.coreweave.com/agent-lens/${ENTITY}/${PROJECT_NAME}/conversations/${r.traceId}`
      : null,
  ]);
const bytes = Buffer.from(JSON.stringify({ columns, data: rows })),
  fileName = 'media/table/listening-comparison.table.json',
  path = join(out, 'listening-comparison.table.json');
await writeFile(path, bytes);
const receipt = {
  status: 'pending',
  runName,
  sourceHash: sha(await readFile(join(dir, 'campaign.json'))),
  publisherHash: sha(await readFile(new URL(import.meta.url))),
  rows: rows.length,
  sha256: sha(bytes),
  url: `https://forge.coreweave.com/wandb/${ENTITY}/${PROJECT_NAME}/runs/${runName}`,
};
const receiptPath = join(out, 'receipt.json');
await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
const transport = new ForgeTransport({
  directory: join(out, 'requests'),
  mode: process.env.FORGE_TRANSPORT ?? 'curl',
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
  if (await readRun(transport, runName)) throw new Error('Run exists; do not overwrite');
  await transport.graphql(
    'mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name}}}',
    {
      input: {
        entityName: ENTITY,
        modelName: PROJECT_NAME,
        name: runName,
        displayName: `${name}: listening teacher case comparison`,
        jobType: 'recorded-agent-evaluation',
        state: 'running',
        config: JSON.stringify({
          synthetic: { value: true },
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
    unexecutedTeacherTurns: rows.filter((r) => r[9] === 'unexecuted').length,
    evaluatorFailures: campaign.judgeRows.filter((r) => !r.result).length,
    synthetic: true,
    qualified: Object.values(campaign.qualification).some(Boolean),
  };
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
  if (observed.comparison?.sha256 !== receipt.sha256 || observed.comparison.nrows !== rows.length)
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
