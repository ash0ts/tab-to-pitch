import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreIntent } from './contract.ts';
import { createWeavePublisher, verifyDataset, verifyEvaluation } from '../forge/weave-client.mjs';
import { ForgeTransport } from '../forge/transport.mjs';
import { ensurePrivateProject, PROJECT, ENTITY, PROJECT_NAME } from '../forge/project.mjs';
import { publishLens } from '../forge/publish-lens.mjs';
import { readRun } from '../forge/models.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = resolve(root, '../tabtopitch-real-data/practice-intent-v2');
const publication = join(directory, 'publication');
const scorerName = 'fretboard-intent-semantic-v2';
const recovery = process.argv.includes('--recover');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const json = (value) => JSON.stringify(value, null, 2) + '\n';
async function save(path, value) {
  await writeFile(`${path}.tmp`, json(value));
  await rename(`${path}.tmp`, path);
}
async function inputs() {
  const names = ['manifest', 'cases', 'campaign', 'summary'];
  const raw = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [name, await readFile(join(directory, `${name}.json`))]),
    ),
  );
  const data = Object.fromEntries(names.map((name) => [name, JSON.parse(raw[name])]));
  if (
    data.manifest.project !== PROJECT ||
    data.campaign.project !== PROJECT ||
    data.campaign.datasetHash !== sha(raw.cases) ||
    data.campaign.sourceHash !== data.manifest.sourceHash ||
    data.campaign.activeAttempt
  )
    throw new Error(
      'Campaign does not match frozen inputs or contains an unresolved active attempt',
    );
  const scorerSource = data.manifest.sourceHashes.find(
    (item) => item.path === 'research/practice-intent/contract.ts',
  );
  if (scorerSource?.sha256 !== sha(await readFile(join(root, scorerSource.path))))
    throw new Error('Frozen scorer changed');
  const taskIndex = new Map(data.cases.map((task) => [task.id, task]));
  const arms = ['deterministic-parser', data.manifest.model].map((name) => ({
    name,
    rows: data.campaign.rows.filter((row) => row.phase === 'test' && row.arm === name),
  }));
  for (const arm of arms) {
    if (
      arm.rows.length !== data.cases.length ||
      new Set(arm.rows.map((row) => row.taskId)).size !== data.cases.length
    )
      throw new Error(
        `Arm ${arm.name} is incomplete; no filled-in fallback or comparison publication`,
      );
    for (const row of arm.rows)
      if (!equal(row.scores, scoreIntent(taskIndex.get(row.taskId), row.output)))
        throw new Error('Recorded criterion differs from frozen checker');
  }
  return { ...data, arms, hashes: Object.fromEntries(names.map((name) => [name, sha(raw[name])])) };
}
const recorded = (row) => ({
  taskId: row.taskId,
  arm: row.arm,
  response: row.output,
  providerSucceeded: row.providerSucceeded,
  recordedElapsedMs: row.elapsedMs,
  resultCount: row.execution?.resultCount ?? null,
  failure: row.failure ?? null,
});
async function verify(publisher, data, receipt) {
  if (!equal(receipt.inputHashes, data.hashes)) throw new Error('Publication input hashes changed');
  const dataset = await verifyDataset(publisher.transport, {
    datasetRef: receipt.refs.dataset,
    expectedRows: data.cases,
  });
  const verifiedArms = [];
  for (const arm of data.arms) {
    const published = receipt.arms.find((value) => value.name === arm.name);
    await verifyEvaluation(publisher.transport, {
      callId: published.callId,
      evaluationRef: receipt.refs.evaluation,
      datasetRef: receipt.refs.dataset,
      scorerRefs: [receipt.refs.scorer],
    });
    const count = 1 + data.cases.length * 3;
    const calls = await publisher.transport.post(
      'trace',
      '/calls/stream_query',
      { project_id: PROJECT, filter: { trace_ids: [published.traceId] }, limit: count + 1 },
      { responseFormat: 'jsonl' },
    );
    if (calls.length !== count || calls.some((call) => !call.ended_at || call.exception))
      throw new Error('Replay call tree is incomplete');
    const rootCall = calls.find((call) => call.id === published.callId);
    if (!rootCall || !equal(rootCall.output, published.summary))
      throw new Error('Evaluation root summary changed');
    const predictions = calls.filter((call) => call.parent_id === rootCall.id);
    if (predictions.length !== arm.rows.length)
      throw new Error('Replay has wrong prediction membership');
    const seen = new Set();
    for (const prediction of predictions) {
      const children = calls.filter((call) => call.parent_id === prediction.id);
      const model = children.find((call) => call.op_name === published.modelRef);
      const scorer = children.find((call) => call.op_name === receipt.refs.scorer);
      const source = arm.rows.find((row) => row.taskId === model?.output?.taskId);
      if (children.length !== 2 || !source || !scorer || seen.has(source.taskId))
        throw new Error('Missing or duplicate replay task');
      const rowRef = `${receipt.refs.dataset}/attr/rows/id/${dataset.rowDigests[source.taskId]}`;
      if (
        model.inputs.datasetRow !== rowRef ||
        scorer.inputs.datasetRow !== rowRef ||
        prediction.inputs.example !== rowRef ||
        !equal(model.output, recorded(source)) ||
        !equal(scorer.inputs.modelOutput, recorded(source)) ||
        !equal(scorer.output, source.scores)
      )
        throw new Error('Published evidence or score does not match original row');
      seen.add(source.taskId);
    }
    const expected = Object.fromEntries(
      Object.keys(arm.rows[0].scores).map((key) => {
        const true_count = arm.rows.filter((row) => row.scores[key]).length;
        return [key, { true_count, true_fraction: true_count / arm.rows.length }];
      }),
    );
    if (!equal(rootCall.output[scorerName], expected))
      throw new Error('Published score aggregate does not reconcile');
    verifiedArms.push({
      name: arm.name,
      calls: calls.length,
      tasks: seen.size,
      criteria: seen.size * Object.keys(expected).length,
    });
  }
  return { at: new Date().toISOString(), dataset, arms: verifiedArms };
}
async function publishWeave(data, verifyOnly) {
  const receiptPath = join(publication, recovery ? 'weave-recovery.json' : 'weave.json');
  const receipt = verifyOnly
    ? JSON.parse(await readFile(receiptPath, 'utf8'))
    : {
        version: 'fretboard-intent-v2',
        synthetic: true,
        status: 'pending',
        inputHashes: data.hashes,
        refs: {},
        arms: [],
        inferenceCallsDuringReplay: 0,
        createdAt: new Date().toISOString(),
      };
  if (!verifyOnly) await writeFile(receiptPath, json(receipt), { flag: 'wx' });
  let publisher;
  try {
    publisher = await createWeavePublisher({
      directory: join(publication, recovery ? 'weave-recovery' : 'weave'),
      qualificationReadAttempts: 5,
      mode: process.env.FORGE_TRANSPORT ?? 'native',
    });
    if (!verifyOnly) {
      const weave = await import('weave');
      const dataset = new weave.Dataset({
        name: `fretboard-intent-synthetic24-${data.manifest.datasetHash.slice(0, 12)}`,
        rows: structuredClone(data.cases),
        description:
          '24 developer-authored synthetic requests and expected controls. Not learner observations. Model outputs remain outside the dataset.',
      });
      const scorer = weave.op(
        ({ datasetRow, modelOutput }) => scoreIntent(datasetRow, modelOutput.response),
        { name: scorerName, parameterNames: 'useParam0Object' },
      );
      const evaluation = new weave.Evaluation({
        name: `fretboard-intent-${data.manifest.sourceHash.slice(0, 12)}`,
        dataset,
        scorers: [scorer],
        description:
          'Exact request-to-controls agreement and separate actual engine safety. Recorded output replay, no inference. Not learning efficacy.',
      });
      if (recovery) {
        const previous = JSON.parse(await readFile(join(publication, 'weave.json'), 'utf8'));
        const readback = JSON.parse(
          await readFile(join(publication, 'recovery-readback/source-file.json'), 'utf8'),
        );
        if (
          previous.arms.length ||
          Object.keys(previous.refs).some((key) => key !== 'dataset') ||
          readback.fileState !== 'absent' ||
          readback.attempts.at(-1).httpStatus !== 404
        )
          throw new Error(
            'Recovery requires verified absent source file and no prior evaluation calls',
          );
        const verified = await verifyDataset(publisher.transport, {
          datasetRef: previous.refs.dataset,
          expectedRows: data.cases,
        });
        const { getOpWrappedFunction } = await import('../../node_modules/weave/dist/opType.mjs');
        const { computeDigest } = await import('../../node_modules/weave/dist/digest.mjs');
        if (
          readback.expectedDigest !==
          computeDigest(Buffer.from(getOpWrappedFunction(scorer).toString()))
        )
          throw new Error('Recovery readback does not describe the exact scorer source');
        const { ObjectRef } = await import('../../node_modules/weave/dist/weaveObject.mjs');
        const { TableRef, TableRowRef } = await import('../../node_modules/weave/dist/table.mjs');
        dataset.__savedRef = Promise.resolve(ObjectRef.fromUri(previous.refs.dataset));
        dataset.rows.__savedRef = Promise.resolve(new TableRef(PROJECT, verified.tableDigest));
        for (const row of dataset.rows.rows)
          row.__savedRef = Promise.resolve(
            new TableRowRef(PROJECT, verified.tableDigest, verified.rowDigests[row.id]),
          );
        receipt.recovery = {
          priorReceipt: 'weave.json',
          sourceFileReadback: readback,
          reusedDataset: verified,
          previousEvaluationCalls: 0,
        };
      }
      const pending = dataset.save();
      const [datasetRef] = await Promise.all([
        pending,
        ...dataset.rows.rows.map((row) => row.__savedRef),
      ]);
      receipt.refs.dataset = datasetRef.uri();
      receipt.refs.scorer = (await publisher.client.publish(scorer)).uri();
      receipt.refs.evaluation = (await publisher.client.publish(evaluation)).uri();
      await save(receiptPath, receipt);
      for (const arm of data.arms) {
        const index = new Map(arm.rows.map((row) => [row.taskId, row]));
        const published = { name: arm.name };
        receipt.arms.push(published);
        const model = weave.op(
          ({ datasetRow }) => {
            const current = publisher.client
              .getCallStack()
              .findLastByOpName(['Evaluation.evaluate']);
            if (!current || (published.callId && published.callId !== current.callId))
              throw new Error('Missing or inconsistent evaluation identity');
            published.callId = current.callId;
            published.traceId = current.traceId;
            const row = index.get(datasetRow.id);
            if (!row) throw new Error('No recorded task output');
            return structuredClone(recorded(row));
          },
          {
            name: `fretboard-recorded-${arm.name.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}-${data.hashes.campaign.slice(0, 8)}`,
            parameterNames: 'useParam0Object',
          },
        );
        published.modelRef = (await publisher.client.publish(model)).uri();
        await save(receiptPath, receipt);
        published.summary = await evaluation.evaluate({ model, maxConcurrency: 1, nTrials: 1 });
        await save(receiptPath, receipt);
        await publisher.flush();
      }
      receipt.status = 'awaiting-readback';
      await save(receiptPath, receipt);
    }
    receipt.verification = await verify(publisher, data, receipt);
    receipt.status = 'verified';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error =
      error instanceof Error ? error.message : 'Publication failed; inspect transport receipts';
    throw error;
  } finally {
    receipt.checkedAt = new Date().toISOString();
    await save(receiptPath, receipt);
    publisher?.close();
  }
  return receipt;
}
async function publishModels(data, verifyOnly) {
  const runName = 'fretboard-intent-v2';
  const receiptPath = join(publication, recovery ? 'models-recovery.json' : 'models.json');
  const metrics = {
    synthetic: true,
    real_learners: 0,
    promotion_eligible: false,
    planned_tasks: data.cases.length,
    requests: data.summary.requests,
    accounted_tokens: data.summary.accountedTokens,
    known_tokens: data.summary.knownTokens,
    unknown_usage_requests: data.summary.unknownUsageRequests,
    model_only_exact: data.summary.paired.modelOnly,
    parser_only_exact: data.summary.paired.parserOnly,
    shared_exact: data.summary.paired.both,
    shared_failures: data.summary.paired.neither,
  };
  for (const arm of data.summary.summaries) {
    const name = arm.arm === 'deterministic-parser' ? 'parser' : 'hosted';
    for (const field of [
      'completed',
      'exactIntent',
      'schemaValid',
      'engineValid',
      'usableExplorations',
      'expectedExplorations',
    ])
      metrics[`${name}/${field}`] = arm[field];
    metrics[`${name}/exactIntentRate`] = arm.exactIntent / arm.planned;
    for (const [category, value] of Object.entries(arm.categories)) {
      metrics[`${name}/${category}/exact`] = value.passed;
      metrics[`${name}/${category}/total`] = value.total;
    }
  }
  const receipt = verifyOnly
    ? JSON.parse(await readFile(receiptPath, 'utf8'))
    : {
        version: 'fretboard-intent-v2',
        runName,
        inputHashes: data.hashes,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
  if (!verifyOnly) await writeFile(receiptPath, json(receipt), { flag: 'wx' });
  if (!equal(receipt.inputHashes, data.hashes)) throw new Error('Models input hashes changed');
  const transport = new ForgeTransport({
    directory: join(publication, recovery ? 'models-recovery' : 'models'),
    mode: process.env.FORGE_TRANSPORT ?? 'native',
  });
  try {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        receipt.project = await ensurePrivateProject(transport, { createIfMissing: false });
        break;
      } catch (error) {
        if (
          attempt === 5 ||
          error.receipt?.write !== false ||
          error.receipt.httpStatus !== undefined
        )
          throw error;
      }
    }
    if (!verifyOnly) {
      if (await readRun(transport, runName))
        throw new Error('Run already exists; read back before any recovery');
      const created = await transport.graphql(
        'mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name} inserted}}',
        {
          input: {
            entityName: ENTITY,
            modelName: PROJECT_NAME,
            name: runName,
            displayName: 'Fretboard intent: synthetic requests to actual explorer controls',
            state: 'running',
            jobType: 'synthetic-intent-evaluation',
            config: JSON.stringify({
              synthetic: { value: true },
              realLearners: { value: 0 },
              promotionEligible: { value: false },
              model: { value: data.manifest.model },
              sourceHash: { value: data.manifest.sourceHash },
              datasetHash: { value: data.manifest.datasetHash },
              integration: {
                value: 'research-only; actual engine, no application cloud-intent endpoint',
              },
            }),
          },
        },
        { write: true, key: 'intent-models-create' },
      );
      receipt.runId = created.upsertBucket.bucket.id;
      await save(receiptPath, receipt);
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
        { write: true, key: 'intent-models-history-finish' },
      );
    }
    const observed = await readRun(transport, runName);
    const summary = JSON.parse(observed?.summaryMetrics || '{}');
    const history = (observed?.history ?? []).map((row) => JSON.parse(row));
    const matches = (row) => Object.entries(metrics).every(([key, value]) => row[key] === value);
    receipt.readback = observed;
    receipt.summaryMatches = matches(summary);
    receipt.historyMatches = history.some(matches);
    receipt.status =
      receipt.summaryMatches && receipt.historyMatches && observed.state === 'finished'
        ? 'verified'
        : 'awaiting-readback';
    receipt.url = `https://forge.coreweave.com/wandb/${ENTITY}/${PROJECT_NAME}/runs/${runName}`;
  } catch (error) {
    receipt.status = 'failed';
    receipt.error =
      error instanceof Error ? error.message : 'Publication failed; inspect transport receipts';
    throw error;
  } finally {
    receipt.checkedAt = new Date().toISOString();
    await save(receiptPath, receipt);
    transport.close();
  }
  return receipt;
}
const data = await inputs();
await mkdir(publication, { recursive: true });
if (process.argv.includes('--lens')) {
  const receipt = await publishLens({
    directory: join(publication, 'lens'),
    coachDirectory: directory,
    verifyOnly: process.argv.includes('--verify'),
  });
  console.info(JSON.stringify(receipt));
  if (!receipt.verified) process.exitCode = 2;
} else if (process.argv.includes('--models')) {
  const receipt = await publishModels(data, process.argv.includes('--verify'));
  console.info(JSON.stringify({ status: receipt.status, url: receipt.url }));
} else if (process.argv.includes('--weave')) {
  const receipt = await publishWeave(data, process.argv.includes('--verify'));
  console.info(
    JSON.stringify({
      status: receipt.status,
      refs: receipt.refs,
      verification: receipt.verification,
    }),
  );
} else
  console.info(
    JSON.stringify({
      ready: true,
      tasks: data.cases.length,
      arms: data.arms.map((arm) => arm.name),
      hashes: data.hashes,
    }),
  );
