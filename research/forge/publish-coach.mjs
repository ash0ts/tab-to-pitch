import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { campaignCaseSchema, scoreProposal } from '../coach-benchmark/contracts.ts';
import { coachResponseSchema, localCoach } from '../../src/shared/coach.ts';
import { createWeavePublisher, verifyDataset, verifyEvaluation } from './weave-client.mjs';
import { ForgeTransport } from './transport.mjs';
import { ensurePrivateProject, PROJECT } from './project.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
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
const scoreSchema = z
  .object({
    versionedContract: z.boolean(),
    eligible: z.boolean(),
    settingsUnchanged: z.boolean(),
    groundedExplanation: z.boolean(),
    noInventedHistory: z.boolean(),
    policyAgreement: z.boolean(),
  })
  .strict();
const rowSchema = z
  .object({
    taskId: z.string(),
    arm: z.string(),
    phase: z.enum(['qualification', 'test']),
    output: coachResponseSchema,
    scores: scoreSchema,
    providerSucceeded: z.boolean().nullable(),
    elapsedMs: z.number().finite().nonnegative(),
    traceId: z.string().optional(),
    failureReason: z.string().optional(),
    requestSequences: z.array(z.number().int().positive()),
  })
  .strict();
export const SCORER_NAME = 'guitarset-coach-contract-v1';

export function prepareReplay({ tasks, manifest, baseline, campaign, datasetHash, scorerSha256 }) {
  tasks = z.array(campaignCaseSchema).length(20).parse(tasks);
  if (
    manifest.project !== PROJECT ||
    manifest.datasetHash !== datasetHash ||
    !equal(
      manifest.taskIds,
      tasks.map((task) => task.id),
    )
  )
    throw new Error('Frozen manifest and source dataset differ');
  const scorerVersion = manifest.sourceHashes?.find(
    (entry) => entry.path === 'research/coach-benchmark/contracts.ts',
  );
  if (scorerVersion?.sha256 !== scorerSha256)
    throw new Error('Scorer source changed since the campaign was frozen');
  if (
    new Set(tasks.map((task) => task.id)).size !== 20 ||
    new Set(tasks.map((task) => task.recordingId)).size !== 20 ||
    tasks.some((task) => task.split !== 'test' || task.context.evidence.length)
  )
    throw new Error('Expected20 distinct held-out source recordings without learner history');
  const taskIndex = new Map(tasks.map((task) => [task.id, task]));
  baseline = z.array(rowSchema).parse(baseline);
  const validateRows = (rows, arm, requests = []) => {
    const seen = new Set();
    for (const row of rows) {
      const task = taskIndex.get(row.taskId);
      if (!task || seen.has(row.taskId) || row.arm !== arm || row.phase !== 'test')
        throw new Error(`Unexpected or duplicate recorded row in ${arm}`);
      seen.add(row.taskId);
      if (!equal(row.scores, scoreProposal(task, row.output)))
        throw new Error(`Recorded scores differ from frozen scorer: ${row.taskId}`);
      if (arm === 'deterministic-baseline') {
        if (
          row.providerSucceeded !== null ||
          row.requestSequences.length ||
          !equal(row.output, localCoach(task.context))
        )
          throw new Error(
            'Baseline contains hosted evidence or differs from the deterministic policy',
          );
      } else {
        if (row.providerSucceeded !== (row.output.source === 'forge'))
          throw new Error('Hosted success flag contradicts the recorded output');
        const expected = requests
          .filter(
            (request) =>
              request.taskId === row.taskId && request.arm === arm && request.phase === 'test',
          )
          .map((request) => request.sequence);
        if (!equal(row.requestSequences, expected))
          throw new Error('Hosted row is not linked to its actual request receipts');
      }
    }
    return rows.length === tasks.length;
  };
  if (!validateRows(baseline, 'deterministic-baseline'))
    throw new Error('Baseline must contain all20 source tasks');
  const arms = [{ name: 'deterministic-baseline', rows: baseline }];
  const unavailableArms = [];
  const modelNames = z.array(z.string()).length(2).parse(manifest.models);
  if (new Set(modelNames).size !== modelNames.length) throw new Error('Duplicate planned model');
  if (campaign) {
    if (
      campaign.project !== PROJECT ||
      campaign.datasetHash !== datasetHash ||
      campaign.sourceHash !== manifest.sourceHash ||
      !equal(campaign.taskIds, manifest.taskIds) ||
      !equal(campaign.models, modelNames)
    )
      throw new Error('Campaign receipt belongs to different frozen inputs');
    const rows = z.array(rowSchema).parse(campaign.rows);
    if (
      !equal(
        rows.filter((row) => row.arm === 'deterministic-baseline'),
        baseline,
      )
    )
      throw new Error('Campaign baseline differs from the original baseline receipt');
    const sequences = campaign.requests.map((request) => request.sequence);
    if (new Set(sequences).size !== sequences.length)
      throw new Error('Duplicate campaign request sequence');
    for (const name of modelNames) {
      const recorded = rows.filter((row) => row.arm === name && row.phase === 'test');
      const complete = validateRows(recorded, name, campaign.requests);
      if (complete && !(campaign.activeAttempt?.arm === name)) arms.push({ name, rows: recorded });
      else
        unavailableArms.push({
          name,
          reason:
            campaign.activeAttempt?.arm === name
              ? 'outcome-unknown-active-attempt'
              : 'incomplete-recorded-arm',
          recordedTasks: recorded.length,
          requiredTasks: 20,
        });
    }
  } else {
    for (const name of modelNames)
      unavailableArms.push({
        name,
        reason: 'campaign-receipt-absent',
        recordedTasks: 0,
        requiredTasks: 20,
      });
  }
  const qualificationMetadata = {
    scope: 'qualification-outside-heldout-evaluation',
    campaignStatus: campaign?.status ?? 'receipt-absent',
    attempts: (campaign?.rows ?? [])
      .filter((row) => row.phase === 'qualification')
      .map((row) => ({
        taskId: row.taskId,
        arm: row.arm,
        providerSucceeded: row.providerSucceeded,
        elapsedMs: row.elapsedMs,
        failureReason: row.failureReason ?? null,
        requestSequences: row.requestSequences,
      })),
    requests: (campaign?.requests ?? [])
      .filter((request) => request.phase === 'qualification')
      .map((request) => ({
        sequence: request.sequence,
        taskId: request.taskId,
        arm: request.arm,
        status: request.status,
        elapsedMs: request.elapsedMs ?? null,
        httpStatus: request.httpStatus ?? null,
        usage: request.usage ?? null,
        reservedTokens: request.reservedTokens,
      })),
    unavailableArms,
  };
  return {
    tasks,
    arms,
    unavailableArms,
    datasetHash,
    scorerSha256,
    sourceHash: manifest.sourceHash,
    plannedModels: modelNames,
    qualificationMetadata,
  };
}

export async function loadReplay(paths) {
  const [caseBytes, manifestBytes, baselineBytes, scorerBytes] = await Promise.all([
    readFile(paths.cases),
    readFile(paths.manifest),
    readFile(paths.baseline),
    readFile(join(appRoot, 'research/coach-benchmark/contracts.ts')),
  ]);
  let campaignBytes;
  try {
    campaignBytes = await readFile(paths.campaign);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const plan = prepareReplay({
    tasks: JSON.parse(caseBytes),
    manifest: JSON.parse(manifestBytes),
    baseline: JSON.parse(baselineBytes),
    campaign: campaignBytes && JSON.parse(campaignBytes),
    datasetHash: sha256(caseBytes),
    scorerSha256: sha256(scorerBytes),
  });
  plan.inputHashes = {
    cases: sha256(caseBytes),
    manifest: sha256(manifestBytes),
    baseline: sha256(baselineBytes),
    campaign: campaignBytes ? sha256(campaignBytes) : null,
  };
  plan.sourceBytes = {
    cases: caseBytes,
    manifest: manifestBytes,
    baseline: baselineBytes,
    campaign: campaignBytes,
  };
  return plan;
}

export function recordedOutput(row) {
  return {
    taskId: row.taskId,
    arm: row.arm,
    response: row.output,
    recorded: {
      elapsedMs: row.elapsedMs,
      providerSucceeded: row.providerSucceeded,
      requestSequences: row.requestSequences,
      ...(row.traceId ? { agentLensConversationId: row.traceId } : {}),
      ...(row.failureReason ? { failureReason: row.failureReason } : {}),
    },
  };
}

export function verifyCallTree(
  calls,
  {
    arm,
    callId,
    traceId,
    datasetRef,
    rowDigests,
    evaluationRef,
    modelRef,
    scorerRef,
    predictRef,
    evaluateRef,
    expectedSummary,
  },
) {
  const expectedCount = 1 + arm.rows.length * 3;
  if (
    calls.length !== expectedCount ||
    new Set(calls.map((call) => call.id)).size !== expectedCount
  )
    throw new Error('Evaluation call count is incomplete or duplicated');
  if (calls.some((call) => call.trace_id !== traceId || !call.ended_at || call.exception))
    throw new Error('Evaluation contains unfinished, failed, or unrelated calls');
  const root = calls.find((call) => call.id === callId);
  if (
    !root ||
    root.parent_id ||
    root.op_name !== evaluateRef ||
    root.inputs?.self !== evaluationRef ||
    root.inputs.model !== modelRef ||
    !equal(root.output, expectedSummary)
  )
    throw new Error('Root evaluation or summary does not match the recorded replay');
  const predictions = calls.filter((call) => call.parent_id === callId);
  if (
    predictions.length !== arm.rows.length ||
    predictions.some((call) => call.op_name !== predictRef)
  )
    throw new Error('Expected exactly one prediction/score call per task');
  const sourceRows = new Map(arm.rows.map((row) => [row.taskId, row]));
  const seen = new Set();
  for (const prediction of predictions) {
    const children = calls.filter((call) => call.parent_id === prediction.id);
    const model = children.find((call) => call.op_name === modelRef);
    const scorer = children.find((call) => call.op_name === scorerRef);
    if (children.length !== 2 || !model || !scorer)
      throw new Error('Prediction is missing its model or shared scorer call');
    const row = sourceRows.get(model.output?.taskId);
    if (!row || seen.has(row.taskId))
      throw new Error('Unknown or repeated task in published model outputs');
    seen.add(row.taskId);
    const output = recordedOutput(row);
    if (
      !equal(model.output, output) ||
      !equal(scorer.inputs?.modelOutput, output) ||
      !equal(scorer.output, row.scores)
    )
      throw new Error(`Published output or criterion scores differ: ${row.taskId}`);
    const rowRef = model.inputs?.datasetRow;
    if (
      !rowDigests[row.taskId] ||
      rowRef !== `${datasetRef}/attr/rows/id/${rowDigests[row.taskId]}` ||
      scorer.inputs.datasetRow !== rowRef ||
      prediction.inputs.example !== rowRef
    )
      throw new Error('Call does not reference the matching shared source dataset row');
    if (
      !equal(prediction.output?.model_output, output) ||
      prediction.output.model_success !== true ||
      !equal(prediction.output.scores, { [SCORER_NAME]: row.scores })
    )
      throw new Error('Prediction summary differs from its child model/scorer calls');
  }
  const expectedScores = Object.fromEntries(
    Object.keys(arm.rows[0].scores).map((key) => {
      const true_count = arm.rows.filter((row) => row.scores[key]).length;
      return [key, { true_count, true_fraction: true_count / arm.rows.length }];
    }),
  );
  if (!equal(root.output[SCORER_NAME], expectedScores))
    throw new Error('Evaluation criterion aggregates do not reconcile to individual scores');
  return {
    callCount: calls.length,
    rowsVerified: seen.size,
    criteriaVerified: seen.size * Object.keys(expectedScores).length,
    providerSucceeded: arm.rows.filter((row) => row.providerSucceeded === true).length,
    providerAttempted: arm.name === 'deterministic-baseline' ? null : arm.rows.length,
  };
}

async function saveReceipt(path, receipt) {
  await writeFile(`${path}.tmp`, `${JSON.stringify(receipt, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}

export async function verifyPublishedReplay(transport, plan, receipt) {
  if (!equal(plan.inputHashes, receipt.inputHashes))
    throw new Error('Readback inputs differ from the published replay inputs');
  const dataset = await verifyDataset(transport, {
    datasetRef: receipt.refs.dataset,
    expectedRows: plan.tasks,
  });
  const qualificationRef = receipt.refs.qualification?.match(
    /^weave:\/\/\/wandb\/tab-to-pitch-public-data-research\/object\/([^:]+):([^/]+)$/,
  );
  if (!qualificationRef)
    throw new Error('Missing qualification evidence object outside the held-out dataset');
  const qualification = await transport.post('trace', '/obj/read', {
    project_id: PROJECT,
    object_id: qualificationRef[1],
    digest: qualificationRef[2],
  });
  if (!equal(qualification.obj.val, plan.qualificationMetadata))
    throw new Error('Published qualification evidence differs from its source receipt');
  const arms = [];
  for (const arm of plan.arms) {
    const published = receipt.arms.find((value) => value.name === arm.name);
    if (!published?.callId) throw new Error(`Missing evaluation call identity: ${arm.name}`);
    await verifyEvaluation(transport, {
      callId: published.callId,
      evaluationRef: receipt.refs.evaluation,
      datasetRef: receipt.refs.dataset,
      scorerRefs: [receipt.refs.scorer],
    });
    if (!published.traceId) throw new Error('Missing distinct evaluation trace identity');
    const filter = { trace_ids: [published.traceId] };
    const stats = await transport.post('trace', '/calls/query_stats', {
      project_id: PROJECT,
      filter,
    });
    const expectedCount = 1 + plan.tasks.length * 3;
    if (stats.count !== expectedCount)
      throw new Error(
        `Expected${expectedCount} persisted calls for ${arm.name}; found${stats.count}`,
      );
    const calls = await transport.post(
      'trace',
      '/calls/stream_query',
      { project_id: PROJECT, filter, limit: expectedCount + 1 },
      { responseFormat: 'jsonl' },
    );
    const proof = verifyCallTree(calls, {
      arm,
      callId: published.callId,
      traceId: published.traceId,
      datasetRef: receipt.refs.dataset,
      rowDigests: dataset.rowDigests,
      evaluationRef: receipt.refs.evaluation,
      modelRef: published.modelRef,
      scorerRef: receipt.refs.scorer,
      predictRef: receipt.refs.predictAndScore,
      evaluateRef: receipt.refs.evaluate,
      expectedSummary: published.summary,
    });
    arms.push({ name: arm.name, ...proof });
  }
  return {
    verifiedAt: new Date().toISOString(),
    dataset,
    qualificationRef: receipt.refs.qualification,
    qualificationAttempts: plan.qualificationMetadata.attempts.length,
    arms,
  };
}

export async function publishReplay(
  plan,
  { directory, receiptPath, publisher: suppliedPublisher },
) {
  await mkdir(dirname(receiptPath), { recursive: true });
  const receipt = {
    schemaVersion: 1,
    kind: 'public-guitarset-recorded-coach-replay-v1',
    project: PROJECT,
    status: 'pending',
    createdAt: new Date().toISOString(),
    inputHashes: plan.inputHashes,
    datasetHash: plan.datasetHash,
    scorerSha256: plan.scorerSha256,
    sourceHash: plan.sourceHash,
    unavailableArms: plan.unavailableArms,
    inferenceRequestsDuringReplay: 0,
    sourceOnlyDataset: true,
    taskCount: plan.tasks.length,
    latencyMeaning:
      'Weave model_latency and call durations measure replay. Original execution latency is model_output.recorded.elapsedMs. Provider success is independent of replay success.',
    arms: [],
    refs: {},
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  let publisher = suppliedPublisher;
  try {
    receipt.sources = {};
    await mkdir(join(directory, 'frozen-coach-inputs'), { recursive: true });
    for (const [name, bytes] of Object.entries(plan.sourceBytes)) {
      if (!bytes) continue;
      const path = join(directory, 'frozen-coach-inputs', `${name}-${plan.inputHashes[name]}.json`);
      try {
        await writeFile(path, bytes, { flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST' || sha256(await readFile(path)) !== plan.inputHashes[name])
          throw error;
      }
      receipt.sources[name] = relative(dirname(receiptPath), path);
    }
    await saveReceipt(receiptPath, receipt);
    publisher ??= await createWeavePublisher({ directory });
    receipt.projectVerification = publisher.project;
    const weave = await import('weave');
    const dataset = new weave.Dataset({
      name: `guitarset-heldout-20-${plan.datasetHash.slice(0, 12)}`,
      rows: structuredClone(plan.tasks),
      description:
        '20 held-out GuitarSet source passages. No recorded outputs or learner histories are dataset columns.',
    });
    const scorer = weave.op(
      ({ datasetRow, modelOutput }) => scoreProposal(datasetRow, modelOutput.response),
      { name: SCORER_NAME, parameterNames: 'useParam0Object' },
    );
    const evaluation = new weave.Evaluation({
      name: `guitarset-contract-${plan.sourceHash.slice(0, 12)}`,
      dataset,
      scorers: [scorer],
      description: `Recorded-output replay. Shared contract scorer SHA256 ${plan.scorerSha256}. No inference or teaching-quality claim.`,
    });
    const pendingDataset = dataset.save();
    // The pinned SDK populates row refs through an asynchronous read after table creation.
    // Observe every promise before starting an evaluation so a failed read cannot escape as
    // an unhandled rejection or leave a root evaluation with no recorded row identity.
    const [datasetRef] = await Promise.all([
      pendingDataset,
      ...dataset.rows.rows.map((row) => row.__savedRef),
    ]);
    receipt.refs.dataset = datasetRef.uri();
    receipt.refs.scorer = (await publisher.client.publish(scorer)).uri();
    receipt.refs.evaluation = (await publisher.client.publish(evaluation)).uri();
    receipt.refs.evaluate = (await publisher.client.publish(evaluation.evaluate)).uri();
    receipt.refs.predictAndScore = (
      await publisher.client.publish(evaluation.predictAndScore)
    ).uri();
    receipt.refs.qualification = (
      await publisher.client.publish(
        plan.qualificationMetadata,
        `guitarset-qualification-${(plan.inputHashes.campaign ?? plan.inputHashes.manifest).slice(0, 12)}`,
      )
    ).uri();
    await saveReceipt(receiptPath, receipt);
    for (const arm of plan.arms) {
      const index = new Map(arm.rows.map((row) => [row.taskId, row]));
      const published = {
        name: arm.name,
        callId: undefined,
        traceId: undefined,
        modelRef: undefined,
        summary: undefined,
      };
      receipt.arms.push(published);
      const model = weave.op(
        ({ datasetRow }) => {
          const current = publisher.client.getCallStack().findLastByOpName(['Evaluation.evaluate']);
          if (!current) throw new Error('Missing replay trace identity');
          if (published.callId && published.callId !== current.callId)
            throw new Error('Arm escaped its evaluation call');
          published.callId = current.callId;
          published.traceId = current.traceId;
          const row = index.get(datasetRow.id);
          if (!row) throw new Error('No recorded output for this source task');
          return structuredClone(recordedOutput(row));
        },
        {
          name: `recorded-${arm.name.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}-${(plan.inputHashes.campaign ?? plan.inputHashes.baseline).slice(0, 12)}`,
          parameterNames: 'useParam0Object',
        },
      );
      published.modelRef = (await publisher.client.publish(model)).uri();
      await saveReceipt(receiptPath, receipt);
      published.summary = await evaluation.evaluate({ model, maxConcurrency: 1, nTrials: 1 });
      await saveReceipt(receiptPath, receipt);
      await publisher.flush();
    }
    receipt.status = 'awaiting-readback';
    await saveReceipt(receiptPath, receipt);
    receipt.verification = await verifyPublishedReplay(publisher.transport, plan, receipt);
    receipt.status = 'verified';
    return receipt;
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error.message;
    throw error;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    await saveReceipt(receiptPath, receipt);
    if (!suppliedPublisher) publisher?.close();
  }
}

export async function main(args) {
  const { values } = parseArgs({
    args,
    options: Object.fromEntries([
      ...['check', 'publish', 'verify'].map((name) => [name, { type: 'boolean' }]),
      ...['cases', 'manifest', 'baseline', 'campaign', 'directory', 'receipt'].map((name) => [
        name,
        { type: 'string' },
      ]),
    ]),
  });
  if (['check', 'publish', 'verify'].filter((name) => values[name]).length > 1)
    throw new Error('Select exactly one execution mode');
  const dataRoot = resolve(appRoot, '../tabtopitch-real-data');
  const paths = {
    cases: values.cases ?? join(dataRoot, 'guitarset/campaign-test-cases.json'),
    manifest: values.manifest ?? join(dataRoot, 'coach/manifest.json'),
    baseline: values.baseline ?? join(dataRoot, 'coach/baseline.json'),
    campaign: values.campaign ?? join(dataRoot, 'coach/campaign.json'),
  };
  const directory = resolve(values.directory ?? join(dataRoot, 'forge'));
  const receiptPath = resolve(values.receipt ?? join(directory, 'coach-replay-public-v1.json'));
  if (values.verify) {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (!receipt.sources) throw new Error('Publication receipt has no frozen source snapshot');
    const frozenPaths = Object.fromEntries(
      Object.keys(paths).map((name) => [
        name,
        receipt.sources[name]
          ? resolve(dirname(receiptPath), receipt.sources[name])
          : join(directory, 'absent-campaign-receipt.json'),
      ]),
    );
    const plan = await loadReplay(frozenPaths);
    const transport = new ForgeTransport({
      directory: join(directory, 'requests'),
      mode: process.env.FORGE_TRANSPORT ?? 'curl',
    });
    try {
      await ensurePrivateProject(transport, { createIfMissing: false });
      const verification = await verifyPublishedReplay(transport, plan, receipt);
      await writeFile(
        `${receiptPath}.verification-${Date.now()}.json`,
        `${JSON.stringify(verification, null, 2)}\n`,
        { flag: 'wx' },
      );
      return { status: 'verified', verification };
    } finally {
      transport.close();
    }
  }
  const plan = await loadReplay(paths);
  if (values.publish) return publishReplay(plan, { directory, receiptPath });
  return {
    status: 'offline-check-passed',
    tasks: plan.tasks.length,
    availableArms: plan.arms.map((arm) => arm.name),
    unavailableArms: plan.unavailableArms,
    inputHashes: plan.inputHashes,
    inferenceRequests: 0,
    cloudWrites: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await main(process.argv.slice(2));
  console.info(JSON.stringify(result, null, 2));
}
