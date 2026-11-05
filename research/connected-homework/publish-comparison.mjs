import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ForgeTransport } from '../forge/transport.mjs';
import { ensurePrivateProject, ENTITY, PROJECT_NAME } from '../forge/project.mjs';
import { readRun } from '../forge/models.mjs';
const verify = process.argv.includes('--verify');
const roots = process.argv
  .slice(2)
  .filter((arg) => arg !== '--verify')
  .map((path) => resolve(path));
if (!roots.length) throw new Error('Supply completed demo campaign directories');
const name = 'connected-homework-development-v1',
  runName = name + '-comparison';
const dir = roots.at(-1),
  out = join(dir, 'publication', 'comparison');
await mkdir(out, { recursive: true });
const sha = (value) => createHash('sha256').update(value).digest('hex');
const columns = [
  'Run',
  'Turn',
  'Prompt',
  'Harmony',
  'Response',
  'Actions',
  'Runtime outcome',
  'Inspected outcome',
  'Failure',
  'Actor calls',
  'Critic calls',
  'Execution ms',
  'Accounted USD',
  'Agent Lens',
  'Weave replay',
];
const rows = [],
  sourceHashes = [];
let observedRows = 0,
  unexecutedRows = 0,
  acceptedCriticalErrors = 0;
for (const root of roots) {
  const bytes = await readFile(join(root, 'campaign.json')),
    campaign = JSON.parse(bytes);
  if (campaign.status !== 'execution-complete') throw new Error('Incomplete campaign');
  sourceHashes.push({ run: root.split('/').at(-1), sha256: sha(bytes) });
  let publication;
  for (const p of ['publication/weave.json', 'publication-recovery/weave.json']) {
    try {
      const value = JSON.parse(await readFile(join(root, p), 'utf8'));
      if (value.status === 'verified') {
        publication = value;
        break;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  if (!publication) throw new Error('Missing verified replay');
  let inspection;
  try {
    inspection = JSON.parse(await readFile(join(root, 'inspection.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const run = root.split('/').at(-1);
  for (let turn = 0; turn < 3; turn++) {
    const r = campaign.rows.find((r) => r.turn === turn);
    if (!r) {
      rows.push([
        run,
        turn,
        null,
        null,
        null,
        null,
        'unexecuted',
        'not inspected',
        null,
        0,
        0,
        null,
        0,
        null,
        publication.url,
      ]);
      unexecutedRows++;
      continue;
    }
    observedRows++;
    const bad =
      inspection?.status === 'critical-accepted-error' &&
      inspection.claims?.length > 0 &&
      inspection.claims.every((claim) => r.output.message.includes(claim.quoted));
    if (bad) acceptedCriticalErrors++;
    rows.push([
      run,
      turn,
      r.request.request,
      r.request.context.music.spans.map((s) => s.symbol).join(' → '),
      r.output.message,
      JSON.stringify(r.output.actions),
      r.failure ? 'fallback' : 'critic accepted',
      bad ? 'critical error: two incorrect coordinates' : 'not a qualified quality assessment',
      r.failure ?? null,
      r.calls.filter((c) => c.role === 'actor').length,
      r.calls.filter((c) => c.role === 'critic').length,
      r.elapsedMs,
      campaign.requests
        .filter((x) => x.identity === r.id)
        .reduce((n, x) => n + (x.costDollars ?? x.reservedDollars ?? 0), 0),
      `https://forge.coreweave.com/agent-lens/${ENTITY}/${PROJECT_NAME}/conversations/${r.traceId}`,
      publication.url,
    ]);
  }
}
const bytes = Buffer.from(JSON.stringify({ columns, data: rows })),
  fileName = 'media/table/connected-homework.table.json',
  path = join(out, 'connected-homework.table.json');
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
          displayName: `${name}: connected homework development runs`,
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
      observedTeacherTurns: observedRows,
      unexecutedTeacherTurns: unexecutedRows,
      acceptedCriticalErrors,
      synthetic: true,
      qualified: false,
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
