import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureContext } from '../../evals/fixtures.ts';
import { localCoach } from '../../src/shared/coach.ts';
import { scoreProposal } from '../coach-benchmark/contracts.ts';
import { prepareReplay, recordedOutput, verifyCallTree, SCORER_NAME } from './publish-coach.mjs';
import { PROJECT } from './project.mjs';
import { createWeavePublisher } from './weave-client.mjs';
import { createHash } from 'node:crypto';

// Authored unit fixtures only. These are never exported by the CLI.
function fixture() {
  const tasks = Array.from({ length: 20 }, (_, i) => ({
    id: `unit-${i}`,
    recordingId: `unit-recording-${i}`,
    performerId: 'unit-performer',
    progressionFamily: 'unit',
    sourceSha256: 'unit-source',
    split: 'test',
    evidenceBasis: 'real-recorded-music-with-no-learner-history',
    exerciseIds: ['note-drill', 'interval-drill'],
    context: structuredClone(fixtureContext),
    noteFacts: ['n1', 'n2', 'n3', 'n4'].map((id) => ({
      id,
      midi: 60,
      string: 1,
      inferredFret: 0,
      observedMidi: 60,
    })),
  }));
  const baseline = tasks.map((task) => {
    const output = localCoach(task.context);
    return {
      taskId: task.id,
      arm: 'deterministic-baseline',
      phase: 'test',
      output,
      scores: scoreProposal(task, output),
      providerSucceeded: null,
      elapsedMs: 2,
      requestSequences: [],
    };
  });
  const manifest = {
    project: PROJECT,
    datasetHash: 'dataset',
    sourceHash: 'source',
    taskIds: tasks.map((task) => task.id),
    models: ['model-a', 'model-b'],
    sourceHashes: [{ path: 'research/coach-benchmark/contracts.ts', sha256: 'scorer' }],
  };
  return { tasks, baseline, manifest, datasetHash: 'dataset', scorerSha256: 'scorer' };
}

test('absent or partial hosted evidence never becomes a baseline-filled arm', () => {
  const input = fixture();
  let plan = prepareReplay(input);
  assert.deepEqual(
    plan.arms.map((arm) => arm.name),
    ['deterministic-baseline'],
  );
  assert.ok(plan.unavailableArms.every((arm) => arm.reason === 'campaign-receipt-absent'));
  const campaign = {
    ...input.manifest,
    requests: [],
    rows: [...input.baseline, { ...input.baseline[0], arm: 'model-a', providerSucceeded: false }],
  };
  plan = prepareReplay({ ...input, campaign });
  assert.equal(plan.arms.length, 1);
  assert.equal(plan.unavailableArms[0].recordedTasks, 1);
  assert.ok(!JSON.stringify(plan.tasks).includes('providerSucceeded'));
});

test('forged scores, success claims, and source drift fail before network access', () => {
  const input = fixture();
  const wrong = structuredClone(input);
  wrong.baseline[0].scores.eligible = false;
  assert.throws(() => prepareReplay(wrong), /Recorded scores differ/);
  assert.throws(
    () => prepareReplay({ ...input, scorerSha256: 'changed' }),
    /Scorer source changed/,
  );
  const campaign = {
    ...input.manifest,
    requests: [],
    rows: [
      ...input.baseline,
      ...input.baseline.map((row) => ({ ...row, arm: 'model-a', providerSucceeded: true })),
    ],
  };
  assert.throws(() => prepareReplay({ ...input, campaign }), /success flag contradicts/);
});

function callTree() {
  const arm = prepareReplay(fixture()).arms[0];
  const callId = 'root';
  const refs = {
    datasetRef: 'weave:///source/dataset',
    evaluationRef: 'evaluation',
    modelRef: 'model',
    scorerRef: 'scorer',
    predictRef: 'predict',
    evaluateRef: 'evaluate',
  };
  const rowDigests = Object.fromEntries(
    arm.rows.map((row) => [row.taskId, `digest-${row.taskId}`]),
  );
  const expectedSummary = {
    [SCORER_NAME]: Object.fromEntries(
      Object.keys(arm.rows[0].scores).map((key) => [key, { true_count: 20, true_fraction: 1 }]),
    ),
  };
  const base = { trace_id: callId, ended_at: '2026-10-29T00:00:00Z', exception: null };
  const calls = [
    {
      ...base,
      id: callId,
      parent_id: null,
      op_name: refs.evaluateRef,
      inputs: { self: refs.evaluationRef, model: refs.modelRef },
      output: expectedSummary,
    },
  ];
  for (const [i, row] of arm.rows.entries()) {
    const rowRef = `${refs.datasetRef}/attr/rows/id/${rowDigests[row.taskId]}`;
    const output = recordedOutput(row);
    calls.push(
      {
        ...base,
        id: `prediction-${i}`,
        parent_id: callId,
        op_name: refs.predictRef,
        inputs: { example: rowRef },
        output: {
          model_output: output,
          model_success: true,
          scores: { [SCORER_NAME]: row.scores },
        },
      },
      {
        ...base,
        id: `model-${i}`,
        parent_id: `prediction-${i}`,
        op_name: refs.modelRef,
        inputs: { datasetRow: rowRef },
        output,
      },
      {
        ...base,
        id: `scorer-${i}`,
        parent_id: `prediction-${i}`,
        op_name: refs.scorerRef,
        inputs: { datasetRow: rowRef, modelOutput: output },
        output: row.scores,
      },
    );
  }
  return { calls, options: { arm, callId, traceId: callId, rowDigests, expectedSummary, ...refs } };
}

test('readback proves61 complete calls and120 criteria against actual source-row digests', () => {
  const { calls, options } = callTree();
  assert.deepEqual(verifyCallTree(calls, options), {
    callCount: 61,
    rowsVerified: 20,
    criteriaVerified: 120,
    providerSucceeded: 0,
    providerAttempted: null,
  });
  assert.throws(() => verifyCallTree(calls.slice(1), options), /call count/);
  const swapped = structuredClone(calls);
  for (const index of [1, 2, 3]) {
    const field = index === 1 ? 'example' : 'datasetRow';
    swapped[index].inputs[field] = `${options.datasetRef}/attr/rows/id/digest-unit-1`;
  }
  assert.throws(() => verifyCallTree(swapped, options), /matching shared source/);
  const wrong = structuredClone(calls);
  wrong[3].output.eligible = false;
  assert.throws(() => verifyCallTree(wrong, options), /criterion scores differ/);
});

test('pinned SDK serialization produces the61-call tree required by readback', async () => {
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const tables = new Map();
  const objects = new Map();
  const calls = new Map();
  const transport = {
    close() {},
    graphql: async () => ({
      project: {
        entityName: 'wandb',
        name: 'tab-to-pitch-public-data-research',
        access: 'PRIVATE',
      },
    }),
    async post(_service, path, value) {
      if (path === '/file/create') return { digest: 'unit-file-digest' };
      if (path === '/table/create') {
        const digest = hash(value.table.rows);
        const rows = value.table.rows.map((val) => ({ digest: hash(val), val }));
        tables.set(digest, rows);
        return { digest, row_digests: rows.map((row) => row.digest) };
      }
      if (path === '/table/query') return { rows: tables.get(value.digest) };
      if (path === '/obj/create') {
        const digest = hash(value.obj.val);
        objects.set(digest, value.obj.val);
        return { digest };
      }
      if (path.endsWith('/call/start')) {
        calls.set(value.start.id, value.start);
        return { id: value.start.id, trace_id: value.start.trace_id };
      }
      if (path.endsWith('/call/end')) {
        Object.assign(calls.get(value.end.id), value.end);
        return {};
      }
      if (path.endsWith('/calls/complete')) {
        for (const call of value.batch) calls.set(call.id, call);
        return {};
      }
      throw new Error(`Unexpected SDK endpoint: ${path}`);
    },
  };
  const previous = process.env.WANDB_API_KEY;
  process.env.WANDB_API_KEY = 'unit-fixture-only';
  const publisher = await createWeavePublisher({ directory: 'unused-unit-directory', transport });
  try {
    const weave = await import('weave');
    const plan = prepareReplay(fixture());
    const arm = plan.arms[0];
    const dataset = new weave.Dataset({
      name: 'unit-source-only',
      rows: structuredClone(plan.tasks),
    });
    const save = dataset.save();
    const [datasetRef] = await Promise.all([
      save,
      ...dataset.rows.rows.map((row) => row.__savedRef),
    ]);
    const scorer = weave.op(
      ({ datasetRow, modelOutput }) => scoreProposal(datasetRow, modelOutput.response),
      { name: SCORER_NAME, parameterNames: 'useParam0Object' },
    );
    const evaluation = new weave.Evaluation({
      name: 'unit-evaluation',
      dataset,
      scorers: [scorer],
    });
    const evaluationRef = (await publisher.client.publish(evaluation)).uri();
    let callId;
    let traceId;
    const model = weave.op(
      ({ datasetRow }) => {
        const root = publisher.client.getCallStack().findLastByOpName(['Evaluation.evaluate']);
        callId = root.callId;
        traceId = root.traceId;
        return recordedOutput(arm.rows.find((row) => row.taskId === datasetRow.id));
      },
      { name: 'unit-recorded-model', parameterNames: 'useParam0Object' },
    );
    const summary = await evaluation.evaluate({ model, maxConcurrency: 1 });
    await publisher.flush();
    const rowDigests = Object.fromEntries(
      [...tables.values()][0].map((row) => [row.val.id, row.digest]),
    );
    const proof = verifyCallTree([...calls.values()], {
      arm,
      callId,
      traceId,
      datasetRef: datasetRef.uri(),
      rowDigests,
      evaluationRef,
      modelRef: (await publisher.client.publish(model)).uri(),
      scorerRef: (await publisher.client.publish(scorer)).uri(),
      predictRef: (await publisher.client.publish(evaluation.predictAndScore)).uri(),
      evaluateRef: (await publisher.client.publish(evaluation.evaluate)).uri(),
      expectedSummary: summary,
    });
    assert.notEqual(callId, traceId);
    assert.equal(proof.rowsVerified, 20);
    assert.equal(objects.size > 0, true);
  } finally {
    publisher.close();
    if (previous === undefined) delete process.env.WANDB_API_KEY;
    else process.env.WANDB_API_KEY = previous;
  }
});
