import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createWeavePublisher, verifyDataset, verifyEvaluation } from '../forge/weave-client.mjs';
import { publishLens } from '../forge/publish-lens.mjs';
import { scoreDemo } from './protocol.ts';
const directory = resolve(process.argv[2]);
const name = directory.split('/').at(-1);
const campaign = JSON.parse(await readFile(join(directory, 'campaign.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (
  campaign.status !== 'execution-complete' ||
  campaign.requests.some((r) => r.status === 'started')
)
  throw new Error('Unfinished execution');
for (const s of manifest.sourceHashes)
  if (
    sha(await readFile(join(directory, 'source', s.path))) !== s.sha256 ||
    sha(await readFile(s.path)) !== s.sha256
  )
    throw new Error(`Replay source drift: ${s.path}`);
const out = join(
  directory,
  process.argv.includes('--recovery') ? 'publication-recovery' : 'publication',
);
await mkdir(out, { recursive: true });
const lens = await publishLens({
  directory: join(out, 'lens'),
  coachDirectory: directory,
  verifyOnly: process.argv.includes('--verify') || process.argv.includes('--lens-readback'),
});
if (!lens.verified) throw new Error('Lens membership differs');
const rows = campaign.rows.map((r) => ({
  id: r.id,
  prompt: r.request.request,
  request: r.request,
}));
const recorded = (r) => ({
  id: r.id,
  response: r.output,
  execution: {
    elapsedMs: r.elapsedMs,
    calls: r.calls.length,
    tools: r.tools.length,
    sourceUnchanged: r.scores.sourceUnchanged,
    failure: r.failure,
    traceId: r.traceId,
  },
});
const scores = (source, output) => ({
  ...scoreDemo(source.request, output.response, output.execution.calls, output.execution.tools),
  sourceUnchanged: output.execution.sourceUnchanged,
});
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
for (const r of campaign.rows)
  if (
    !equal(
      scores(
        rows.find((s) => s.id === r.id),
        recorded(r),
      ),
      r.scores,
    )
  )
    throw new Error('Score does not reproduce');
const path = join(out, 'weave.json');
const verify = process.argv.includes('--verify');
const receipt = verify
  ? JSON.parse(await readFile(path, 'utf8'))
  : {
      status: 'pending',
      campaignSha256: sha(await readFile(join(directory, 'campaign.json'))),
      inferenceCallsDuringReplay: 0,
      createdAt: new Date().toISOString(),
    };
if (!verify) await writeFile(path, JSON.stringify(receipt, null, 2), { flag: 'wx' });
const save = () => writeFile(path, JSON.stringify(receipt, null, 2));
const publisher = await createWeavePublisher({ directory: join(out, 'weave'), mode: 'native' });
try {
  if (!verify) {
    const weave = await import('weave');
    const dataset = new weave.Dataset({
      name: `${name}-dataset-v2`,
      rows: JSON.parse(JSON.stringify(rows)),
      description:
        'Three original-study UI turns. Scripted learner, one trial, no learning outcomes. Keyword checks are narrow smoke checks, not qualified quality judgments.',
    });
    const scorer = weave.op(({ datasetRow, modelOutput }) => scores(datasetRow, modelOutput), {
      name: 'connected-homework-smoke-v1',
      parameterNames: 'useParam0Object',
    });
    const evaluation = new weave.Evaluation({
      name: `${name}-evaluation-v2`,
      dataset,
      scorers: [scorer],
      description:
        'Replay actual recorded teacher responses, including fallbacks. No actor inference during replay. Execution latency is separate from replay duration.',
    });
    const pending = dataset.save();
    const [ref] = await Promise.all([pending, ...dataset.rows.rows.map((r) => r.__savedRef)]);
    receipt.datasetRef = ref.uri();
    receipt.scorerRef = (await publisher.client.publish(scorer)).uri();
    receipt.evaluationRef = (await publisher.client.publish(evaluation)).uri();
    await save();
    const model = weave.op(
      ({ datasetRow }) => {
        const current = publisher.client.getCallStack().findLastByOpName(['Evaluation.evaluate']);
        receipt.callId = current.callId;
        receipt.traceId = current.traceId;
        return structuredClone(recorded(campaign.rows.find((r) => r.id === datasetRow.id)));
      },
      { name: `${name}-recorded-reply`, parameterNames: 'useParam0Object' },
    );
    receipt.modelRef = (await publisher.client.publish(model)).uri();
    await save();
    receipt.summary = await evaluation.evaluate({ model, maxConcurrency: 1, nTrials: 1 });
    await save();
    await publisher.flush();
  }
  const dataset = await verifyDataset(publisher.transport, {
    datasetRef: receipt.datasetRef,
    expectedRows: rows,
  });
  await verifyEvaluation(publisher.transport, { ...receipt, scorerRefs: [receipt.scorerRef] });
  const calls = await publisher.transport.post(
    'trace',
    '/calls/stream_query',
    {
      project_id: campaign.project,
      filter: { trace_ids: [receipt.traceId] },
      limit: 2 + 3 * rows.length,
    },
    { responseFormat: 'jsonl' },
  );
  if (calls.length !== 1 + 3 * rows.length || calls.some((c) => !c.ended_at || c.exception))
    throw new Error('Incomplete replay tree');
  const seen = new Set();
  for (const parent of calls.filter((c) => c.parent_id === receipt.callId)) {
    const children = calls.filter((c) => c.parent_id === parent.id),
      model = children.find((c) => c.op_name === receipt.modelRef),
      scorer = children.find((c) => c.op_name === receipt.scorerRef);
    const source = rows.find((r) => r.id === model?.output?.id),
      row = campaign.rows.find((r) => r.id === source?.id);
    if (!source || !row || !scorer || children.length !== 2 || seen.has(source.id))
      throw new Error('Replay membership mismatch');
    const reference = `${receipt.datasetRef}/attr/rows/id/${dataset.rowDigests[source.id]}`;
    if (
      model.inputs.datasetRow !== reference ||
      scorer.inputs.datasetRow !== reference ||
      parent.inputs.example !== reference ||
      !equal(model.output, recorded(row)) ||
      !equal(scorer.output, scores(source, recorded(row))) ||
      !equal(scorer.inputs.modelOutput, recorded(row))
    )
      throw new Error('Replay output or criterion mismatch');
    seen.add(source.id);
  }
  if (!equal(calls.find((c) => c.id === receipt.callId).output, receipt.summary))
    throw new Error('Aggregate mismatch');
  receipt.verification = {
    rows: seen.size,
    calls: calls.length,
    criteria: seen.size * Object.keys(campaign.rows[0].scores).length,
    sourceOutputAndScoresMatch: true,
    lens,
  };
  receipt.url = `https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/${receipt.callId}`;
  receipt.status = 'verified';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  throw error;
} finally {
  await save();
  publisher.close();
}
console.info(
  JSON.stringify({ status: receipt.status, url: receipt.url, verification: receipt.verification }),
);
