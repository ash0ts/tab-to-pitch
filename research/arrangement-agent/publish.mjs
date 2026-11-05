import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreArrangement } from './contract.ts';
import { createWeavePublisher, verifyDataset, verifyEvaluation } from '../forge/weave-client.mjs';
import { ForgeTransport } from '../forge/transport.mjs';
import { ensurePrivateProject, PROJECT, ENTITY, PROJECT_NAME } from '../forge/project.mjs';
import { publishLens } from '../forge/publish-lens.mjs';
import { readRun } from '../forge/models.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = process.env.ARRANGEMENT_EVIDENCE_DIR
  ? resolve(process.env.ARRANGEMENT_EVIDENCE_DIR)
  : resolve(root, '../tabtopitch-real-data/arrangement-agent-v1');
const publication = join(directory, 'publication');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, value]) => [k, canonical(value)]),
        )
      : v;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const json = (v) => JSON.stringify(v, null, 2) + '\n';
async function save(path, v) {
  await writeFile(path + '.tmp', json(v));
  await rename(path + '.tmp', path);
}
const raw = Object.fromEntries(
  await Promise.all(
    ['manifest', 'cases', 'campaign', 'summary'].map(async (name) => [
      name,
      await readFile(join(directory, name + '.json')),
    ]),
  ),
);
const data = Object.fromEntries(
  Object.entries(raw).map(([name, value]) => [name, JSON.parse(value)]),
);
const hashes = Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, sha(value)]));
if (
  data.campaign.status !== 'complete' ||
  data.manifest.project !== PROJECT ||
  data.campaign.datasetHash !== sha(raw.cases) ||
  data.campaign.sourceHash !== data.manifest.sourceHash
)
  throw new Error('Campaign is not complete or frozen membership changed');
const scorerSource = data.manifest.sourceHashes.find(
  (f) => f.path === 'research/arrangement-agent/contract.ts',
);
if (scorerSource.sha256 !== sha(await readFile(join(root, scorerSource.path))))
  throw new Error('Scorer source changed');
const cases = new Map(data.cases.map((c) => [c.id, c]));
const arms = [
  ...new Set(
    data.campaign.rows.filter((r) => r.phase === 'test').map((r) => `${r.arm}::trial-${r.trial}`),
  ),
].map((name) => ({
  name,
  rows: data.campaign.rows.filter(
    (r) => r.phase === 'test' && `${r.arm}::trial-${r.trial}` === name,
  ),
}));
for (const arm of arms) {
  if (
    arm.rows.length !== data.cases.length ||
    new Set(arm.rows.map((r) => r.taskId)).size !== data.cases.length
  )
    throw new Error('Incomplete arm');
  for (const row of arm.rows)
    if (!equal(row.scores, scoreArrangement(cases.get(row.taskId), row.output)))
      throw new Error('Score no longer reproduces');
}
const recorded = (row) => ({
  taskId: row.taskId,
  arm: row.arm,
  trial: row.trial,
  response: row.output,
  elapsedMs: row.elapsedMs,
  providerSucceeded: row.providerSucceeded,
  failure: row.failure ?? null,
});
const scorerName = process.env.ARRANGEMENT_SCORER_NAME ?? 'arrangement-request-and-music-v1';
await mkdir(publication, { recursive: true });
async function verifyWeave(publisher, receipt) {
  if (!equal(receipt.inputHashes, hashes)) throw new Error('Publication inputs changed');
  const dataset = await verifyDataset(publisher.transport, {
    datasetRef: receipt.refs.dataset,
    expectedRows: data.cases,
  });
  const verified = [];
  for (const arm of arms) {
    const published = receipt.arms.find((a) => a.name === arm.name);
    if (!published) throw new Error('Missing arm');
    await verifyEvaluation(publisher.transport, {
      callId: published.callId,
      evaluationRef: receipt.refs.evaluation,
      datasetRef: receipt.refs.dataset,
      scorerRefs: [receipt.refs.scorer],
    });
    const calls = await publisher.transport.post(
      'trace',
      '/calls/stream_query',
      {
        project_id: PROJECT,
        filter: { trace_ids: [published.traceId] },
        limit: 2 + 3 * data.cases.length,
      },
      { responseFormat: 'jsonl' },
    );
    if (calls.length !== 1 + 3 * data.cases.length || calls.some((c) => !c.ended_at || c.exception))
      throw new Error('Incomplete replay call tree');
    const root = calls.find((c) => c.id === published.callId),
      predictions = calls.filter((c) => c.parent_id === published.callId),
      seen = new Set();
    for (const prediction of predictions) {
      const children = calls.filter((c) => c.parent_id === prediction.id),
        model = children.find((c) => c.op_name === published.modelRef),
        scorer = children.find((c) => c.op_name === receipt.refs.scorer),
        source = arm.rows.find((r) => r.taskId === model?.output?.taskId);
      if (children.length !== 2 || !source || !scorer || seen.has(source.taskId))
        throw new Error('Invalid prediction membership');
      const ref = `${receipt.refs.dataset}/attr/rows/id/${dataset.rowDigests[source.taskId]}`;
      if (
        model.inputs.datasetRow !== ref ||
        scorer.inputs.datasetRow !== ref ||
        prediction.inputs.example !== ref ||
        !equal(model.output, recorded(source)) ||
        !equal(scorer.inputs.modelOutput, recorded(source)) ||
        !equal(scorer.output, source.scores)
      )
        throw new Error('Replay evidence mismatch');
      seen.add(source.taskId);
    }
    const expected = Object.fromEntries(
      Object.keys(arm.rows[0].scores).map((key) => {
        const true_count = arm.rows.filter((r) => r.scores[key]).length;
        return [key, { true_count, true_fraction: true_count / data.cases.length }];
      }),
    );
    if (!equal(root.output[scorerName], expected) || !equal(root.output, published.summary))
      throw new Error('Aggregate mismatch');
    verified.push({
      arm: arm.name,
      calls: calls.length,
      tasks: seen.size,
      criteria: seen.size * Object.keys(expected).length,
    });
  }
  return { at: new Date().toISOString(), dataset, arms: verified };
}
async function weavePublish() {
  const path = join(publication, 'weave.json'),
    verifyOnly = process.argv.includes('--verify');
  const receipt = verifyOnly
    ? JSON.parse(await readFile(path, 'utf8'))
    : {
        status: 'pending',
        inputHashes: hashes,
        refs: {},
        arms: [],
        inferenceCallsDuringReplay: 0,
        createdAt: new Date().toISOString(),
      };
  if (!verifyOnly) await writeFile(path, json(receipt), { flag: 'wx' });
  let publisher;
  try {
    publisher = await createWeavePublisher({
      directory: join(publication, 'weave'),
      mode: process.env.FORGE_TRANSPORT ?? 'native',
      qualificationReadAttempts: 5,
    });
    if (!verifyOnly) {
      const weave = await import('weave');
      const dataset = new weave.Dataset({
        name: `arrangement-synthetic${data.cases.length}-${data.manifest.datasetHash.slice(0, 12)}`,
        rows: structuredClone(data.cases),
        description:
          `${data.cases.length} authored requests across ${data.summary.contexts} musical contexts. Synthetic context, no learner records. Expected constraints fixed before inference.`,
      });
      const scorer = weave.op(
        ({ datasetRow, modelOutput }) => scoreArrangement(datasetRow, modelOutput.response),
        { name: scorerName, parameterNames: 'useParam0Object' },
      );
      const evaluation = new weave.Evaluation({
        name: `arrangement-${data.manifest.sourceHash.slice(0, 12)}`,
        dataset,
        scorers: [scorer],
        description:
          'Actual arrangement API outputs replayed against independent requested controls and musical invariants. No inference during replay. Not teaching efficacy.',
      });
      const pending = dataset.save();
      const [ref] = await Promise.all([pending, ...dataset.rows.rows.map((r) => r.__savedRef)]);
      receipt.refs.dataset = ref.uri();
      await save(path, receipt);
      receipt.refs.scorer = (await publisher.client.publish(scorer)).uri();
      await save(path, receipt);
      receipt.refs.evaluation = (await publisher.client.publish(evaluation)).uri();
      await save(path, receipt);
      for (const arm of arms) {
        const index = new Map(arm.rows.map((r) => [r.taskId, r])),
          published = { name: arm.name };
        receipt.arms.push(published);
        const model = weave.op(
          ({ datasetRow }) => {
            const current = publisher.client
              .getCallStack()
              .findLastByOpName(['Evaluation.evaluate']);
            if (!current || (published.callId && published.callId !== current.callId))
              throw new Error('Invalid evaluation identity');
            published.callId = current.callId;
            published.traceId = current.traceId;
            return structuredClone(recorded(index.get(datasetRow.id)));
          },
          {
            name: `arrangement-recorded-${arm.name.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`,
            parameterNames: 'useParam0Object',
          },
        );
        published.modelRef = (await publisher.client.publish(model)).uri();
        await save(path, receipt);
        published.summary = await evaluation.evaluate({ model, maxConcurrency: 1, nTrials: 1 });
        await save(path, receipt);
        await publisher.flush();
      }
      receipt.status = 'awaiting-readback';
      await save(path, receipt);
    }
    receipt.verification = await verifyWeave(publisher, receipt);
    receipt.status = 'verified';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error.message;
    throw error;
  } finally {
    receipt.checkedAt = new Date().toISOString();
    await save(path, receipt);
    publisher?.close();
  }
  console.info(
    json({ status: receipt.status, refs: receipt.refs, verification: receipt.verification }),
  );
}
async function modelsPublish() {
  const path = join(publication, 'models.json'),
    runName = process.env.ARRANGEMENT_RUN_NAME ?? 'arrangement-agent-v1',
    verifyOnly = process.argv.includes('--verify');
  const metrics = {
    synthetic: true,
    real_learners: 0,
    contexts: data.summary.contexts,
    unique_requests: data.cases.length,
    requests: data.summary.calls,
    accounted_tokens: data.summary.tokens,
    known_tokens: data.summary.knownTokens,
    estimated_dollars: data.summary.dollars,
    unknown_usage: data.summary.unknownUsage,
  };
  for (const arm of data.summary.arms) {
    const label =
      arm.arm === 'deterministic-parser' ? 'parser' : arm.arm.includes('120') ? '120b' : '20b';
    metrics[`${label}/completed`] = arm.completed;
    if (arm.requestAccuracy !== null) metrics[`${label}/request_accuracy`] = arm.requestAccuracy;
    metrics[`${label}/qualified`] = arm.qualified;
    metrics[`${label}/qualified_for_cloud`] = arm.qualifiedForCloudPreview;
    for (const [key, value] of Object.entries(arm.criteria)) metrics[`${label}/${key}`] = value;
  }
  const receipt = verifyOnly
    ? JSON.parse(await readFile(path, 'utf8'))
    : { status: 'pending', inputHashes: hashes, runName, createdAt: new Date().toISOString() };
  if (!verifyOnly) await writeFile(path, json(receipt), { flag: 'wx' });
  if (!equal(hashes, receipt.inputHashes)) throw new Error('Models inputs changed');
  const transport = new ForgeTransport({
    directory: join(publication, 'models'),
    deadlineMs: 30000,
    mode: process.env.FORGE_TRANSPORT ?? 'native',
  });
  try {
    for (let n = 1; n <= 5; n++) {
      try {
        receipt.project = await ensurePrivateProject(transport, { createIfMissing: false });
        break;
      } catch (e) {
        if (n === 5 || e.receipt?.httpStatus) throw e;
      }
    }
    if (!verifyOnly) {
      if (await readRun(transport, runName))
        throw new Error('Run already exists; readback required');
      const created = await transport.graphql(
        'mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name} inserted}}',
        {
          input: {
            entityName: ENTITY,
            modelName: PROJECT_NAME,
            name: runName,
            displayName: `Arrangement agent: real API / ${data.cases.length} authored requests`,
            state: 'running',
            jobType: 'arrangement-agent-evaluation',
            config: JSON.stringify({
              sourceHash: { value: data.manifest.sourceHash },
              datasetHash: { value: data.manifest.datasetHash },
              synthetic: { value: true },
              realLearners: { value: 0 },
              modelIds: { value: data.manifest.models },
              integration: {
                value: 'POST /api/arrangements/propose; same schema, planner, agent and validator',
              },
            }),
          },
        },
        { write: true, key: 'arrangement-create' },
      );
      receipt.runId = created.upsertBucket.bucket.id;
      await save(path, receipt);
      await transport.post(
        'api',
        `/files/${ENTITY}/${PROJECT_NAME}/${runName}/file_stream`,
        {
          files: {
            'wandb-history.jsonl': {
              offset: 0,
              content: [
                JSON.stringify({
                  ...metrics,
                  _step: 0,
                  _timestamp: Date.now() / 1000,
                  _runtime: 0,
                }),
              ],
            },
            'wandb-summary.json': { offset: 0, content: [JSON.stringify(metrics)] },
          },
          complete: true,
          exitcode: 0,
        },
        { write: true, key: 'arrangement-history' },
      );
    }
    if (!verifyOnly)
      await transport.graphql(
        'mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name}}}',
        {
          input: {
            entityName: ENTITY,
            modelName: PROJECT_NAME,
            name: runName,
            summaryMetrics: JSON.stringify(metrics),
          },
        },
        { write: true, key: 'arrangement-summary' },
      );
    const observed = await readRun(transport, runName),
      summary = JSON.parse(observed?.summaryMetrics ?? '{}'),
      history = (observed?.history ?? []).map((v) => JSON.parse(v));
    const match = (r) => Object.entries(metrics).every(([k, v]) => r[k] === v);
    receipt.readback = observed;
    receipt.summaryMatches = match(summary);
    receipt.historyMatches = history.some(match);
    receipt.status =
      receipt.summaryMatches && receipt.historyMatches && observed.state === 'finished'
        ? 'verified'
        : 'awaiting-readback';
    receipt.url = `https://forge.coreweave.com/wandb/${ENTITY}/${PROJECT_NAME}/runs/${runName}`;
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error.message;
    throw error;
  } finally {
    receipt.checkedAt = new Date().toISOString();
    await save(path, receipt);
    transport.close();
  }
  console.info(json({ status: receipt.status, url: receipt.url }));
}
if (process.argv.includes('--lens'))
  console.info(
    json(
      await publishLens({
        directory: join(publication, 'lens'),
        coachDirectory: directory,
        verifyOnly: process.argv.includes('--verify'),
        deadlineMs: 30000,
      }),
    ),
  );
else if (process.argv.includes('--weave')) await weavePublish();
else if (process.argv.includes('--models')) await modelsPublish();
else console.info(json({ ready: true, arms: arms.map((a) => a.name), tasks: data.cases.length }));
