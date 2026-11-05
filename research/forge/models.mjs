import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ForgeTransport } from './transport.mjs';
import { ensurePrivateProject, ENTITY, PROJECT_NAME } from './project.mjs';

export const RECALL_FILES = Object.freeze([
  'report.json',
  'model.json',
  'dataset-manifest.json',
  'run-manifest.json',
  'metrics.json',
]);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function loadRecallBundle(directory) {
  const files = Object.fromEntries(
    await Promise.all(
      RECALL_FILES.map(async (name) => [name, await readFile(join(directory, name))]),
    ),
  );
  const values = Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [name, JSON.parse(bytes.toString('utf8'))]),
  );
  const manifest = values['run-manifest.json'];
  if (
    manifest.synthetic !== false ||
    manifest.promotionEligible !== false ||
    manifest.target !== 'Anki self-rated recall (review_rating > 1)'
  )
    throw new Error('Expected public self-rated recall proxy bundle');
  if (JSON.stringify(manifest.publicationAllowlist) !== JSON.stringify(RECALL_FILES))
    throw new Error('Publication allowlist changed');
  if (
    manifest.modelSha256 !== digest(files['model.json']) ||
    manifest.reportSha256 !== digest(files['report.json'])
  )
    throw new Error('Bundle does not match its frozen manifest');
  const metrics = values['metrics.json'];
  if (
    !Object.keys(metrics).length ||
    Object.values(metrics).some((value) => typeof value !== 'number' || !Number.isFinite(value))
  )
    throw new Error('Expected finite aggregate metrics');
  const forbidden = /(?:collection_id|card_id|user_id|\/Users\/|\.csv|\.parquet)/i;
  if (Object.values(files).some((value) => forbidden.test(value.toString('utf8'))))
    throw new Error('Bundle contains a private identifier field or source path');
  return {
    files,
    values,
    metrics,
    sha256: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, digest(bytes)])),
  };
}

export async function readRun(transport, runName) {
  const result = await transport.graphql(
    'query($entity:String!,$project:String!,$name:String!){project(entityName:$entity,name:$project){access run(name:$name){id name state summaryMetrics historyLineCount history(samples:10)}}}',
    { entity: ENTITY, project: PROJECT_NAME, name: runName },
  );
  if (result.project?.access !== 'PRIVATE') throw new Error('Project privacy changed');
  return result.project.run;
}

export async function publishRecallRun({
  directory,
  source,
  runName = 'recall-public-v1',
  mode = process.env.FORGE_TRANSPORT ?? 'curl',
}) {
  const bundle = await loadRecallBundle(source);
  const transport = new ForgeTransport({ directory: join(directory, 'requests'), mode });
  const receiptPath = join(directory, `${runName}.json`);
  const receipt = {
    schemaVersion: 1,
    kind: 'real-public-recall-proxy',
    runName,
    synthetic: false,
    sourceSha256: bundle.sha256,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await mkdir(directory, { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  try {
    receipt.project = await ensurePrivateProject(transport);
    await writeFile(
      join(directory, 'project.json'),
      `${JSON.stringify(receipt.project, null, 2)}\n`,
    );
    if (await readRun(transport, runName))
      throw new Error('Run already exists; inspect independent readback instead of overwriting');
    const created = await transport.graphql(
      'mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name} inserted}}',
      {
        input: {
          entityName: ENTITY,
          modelName: PROJECT_NAME,
          name: runName,
          displayName: 'Public Anki recall proxy: chronological and unseen collections',
          state: 'running',
          jobType: 'public-recall-proxy-evaluation',
          config: JSON.stringify({
            target: { value: bundle.values['run-manifest.json'].target },
            promotionEligible: { value: false },
            synthetic: { value: false },
            sourceRevision: { value: bundle.values['dataset-manifest.json'].revision },
            bundleSha256: { value: bundle.sha256 },
          }),
        },
      },
      { write: true, key: `${runName}-create` },
    );
    receipt.runId = created.upsertBucket.bucket.id;
    const summary = {
      ...bundle.metrics,
      synthetic: false,
      promotionEligible: false,
      target: bundle.values['run-manifest.json'].target,
      aggregateOnly: true,
    };
    const point = { ...bundle.metrics, _step: 0, _timestamp: Date.now() / 1000, _runtime: 0 };
    // One measured evaluation is one history point. No fabricated training curve.
    await transport.post(
      'api',
      `/files/${ENTITY}/${PROJECT_NAME}/${runName}/file_stream`,
      {
        files: {
          'wandb-history.jsonl': { offset: 0, content: [JSON.stringify(point)] },
          'wandb-summary.json': { offset: 0, content: [JSON.stringify(summary)] },
        },
        complete: true,
        exitcode: 0,
      },
      { write: true, key: `${runName}-history-finish` },
    );
    const after = await readRun(transport, runName);
    receipt.readback = after;
    const observedSummary = JSON.parse(after.summaryMetrics || '{}');
    const history = after.history.map((row) => JSON.parse(row));
    const matches = (row) =>
      Object.entries(bundle.metrics).every(([key, value]) => row[key] === value);
    receipt.summaryMatches = matches(observedSummary);
    receipt.historyMatches = history.some(matches);
    receipt.status =
      receipt.summaryMatches && receipt.historyMatches && after.state === 'finished'
        ? 'verified'
        : 'awaiting-readback';
    receipt.url = `https://forge.coreweave.com/wandb/${ENTITY}/${PROJECT_NAME}/runs/${runName}`;
    return receipt;
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error.message;
    throw error;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    transport.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const receipt = await publishRecallRun({
    directory: resolve(process.argv[2]),
    source: resolve(process.argv[3]),
    runName: process.argv[4],
  });
  console.info(
    JSON.stringify({
      status: receipt.status,
      runName: receipt.runName,
      summaryMatches: receipt.summaryMatches,
      historyMatches: receipt.historyMatches,
    }),
  );
  if (receipt.status !== 'verified') process.exitCode = 2;
}
