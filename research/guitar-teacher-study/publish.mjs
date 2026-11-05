import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createWeavePublisher, verifyDataset, verifyEvaluation } from '../forge/weave-client.mjs';
import { publishStudyLens } from './publish-lens.mjs';
import { score } from './scorer.ts';
import { verifyStudyLens } from './verify-lens.mjs';
import { studyWeaveTransport } from './weave-transport.mjs';
const directory = resolve(process.argv[2]);
const name = directory.split('/').at(-1);
const verify = process.argv.includes('--verify');
const campaign = JSON.parse(await readFile(join(directory, 'campaign.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
if (
  campaign.status !== 'execution-complete' ||
  campaign.requests.some((r) => r.status === 'started')
)
  throw new Error('Unfinished execution');
for (const s of manifest.hashes)
  if (
    sha(await readFile(join(directory, 'source', s.path))) !== s.sha256 ||
    (s.path === 'research/guitar-teacher-study/scorer.ts' &&
      sha(await readFile(s.path)) !== s.sha256)
  )
    throw new Error(`Replay source drift: ${s.path}`);
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
const out = join(directory, 'publication');
await mkdir(out, { recursive: true });
const projection = join(out, 'lens-source');
await mkdir(projection, { recursive: true });
await writeFile(
  join(projection, 'campaign.json'),
  JSON.stringify({ ...campaign, rows: [...campaign.rows, ...campaign.criticRows] }),
);
await cp(join(directory, 'lens-capture'), join(projection, 'lens-capture'), {
  recursive: true,
  errorOnExist: false,
});
const lens = await publishStudyLens({
  directory: join(out, 'lens'),
  coachDirectory: directory,
  verifyOnly: verify || process.argv.includes('--lens-readback'),
  deadlineMs: 30000,
});
if (!lens.verified) throw new Error('Lens membership differs');
await verifyStudyLens(directory);
const groups = ['local', 'current', 'evidence-first', 'critic'];
for (const group of groups) {
  const source =
    group === 'critic' ? campaign.criticRows : campaign.rows.filter((r) => r.arm === group);
  const rows = source.map((r) => ({
    id: r.id,
    arm: group,
    fixture:
      group === 'critic'
        ? manifest.criticFixtures.find((f) => f.id === r.fixtureId)
        : manifest.cases.find((t) => t.id === r.taskId),
  }));
  const recorded = (r) =>
    group === 'critic'
      ? {
          id: r.id,
          output: r.output,
          failure: r.failure,
          executionLatencyMs: r.elapsedMs,
          traceId: r.traceId,
        }
      : {
          id: r.id,
          output: r.output,
          resolved: r.resolved,
          sourceUnchanged: r.sourceUnchanged,
          arm: r.arm,
          tools: r.tools.map((t) => ({ name: t.name })),
          executionLatencyMs: r.elapsedMs,
          calls: r.calls,
          failure: r.failure,
          traceId: r.traceId ?? null,
        };
  const fullScores = (row, output) =>
    group === 'critic'
      ? {
          reviewAvailable: output.output !== null,
          correct: output.output !== null && output.output.approved === row.fixture.approved,
          falseAcceptance:
            output.output !== null && output.output.approved && !row.fixture.approved,
          falseRejection: output.output !== null && !output.output.approved && row.fixture.approved,
        }
      : score(row.fixture, output);
  const scalarScores = (row, output) =>
    Object.fromEntries(
      Object.entries(fullScores(row, output)).filter(
        ([, v]) => typeof v === 'boolean' || typeof v === 'number',
      ),
    );
  if (group !== 'critic')
    for (const row of rows) {
      const r = source.find((r) => r.id === row.id);
      if (!equal(fullScores(row, recorded(r)), r.scores))
        throw new Error('Score does not reproduce');
    }
  const path = join(out, `weave-${group}.json`);
  let existing;
  try {
    existing = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (verify && !existing) throw new Error('No publication receipt to verify');
  const replay = !existing;
  const receipt = existing ?? {
    status: 'pending',
    group,
    campaignSha256: sha(await readFile(join(directory, 'campaign.json'))),
    inferenceCallsDuringReplay: 0,
    publisherSha256: sha(await readFile(new URL(import.meta.url))),
    createdAt: new Date().toISOString(),
  };
  if (replay) await writeFile(path, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  const save = () => writeFile(path, JSON.stringify(receipt, null, 2));
  const publisher = await createWeavePublisher({
    directory: join(out, `weave-${group}`),
    transport: studyWeaveTransport(join(out, `weave-${group}`, 'requests')),
  });
  try {
    if (replay) {
      const weave = await import('weave');
      const dataset = new weave.Dataset({
        name: `${name}-${group}-dataset`,
        rows: JSON.parse(JSON.stringify(rows)),
        description:
          'GuitarSet annotation-derived musical contexts; authored learner requests. No observed learner outcomes. Raw excerpts and pretraining overlap are not evaluated.',
      });
      const scorer = weave.op(
        ({ datasetRow, modelOutput }) => scalarScores(datasetRow, modelOutput),
        {
          name: `guitar-teacher-grounding-v1-${group === 'critic' ? 'critic' : 'artifact'}-checks`,
          parameterNames: 'useParam0Object',
        },
      );
      const evaluation = new weave.Evaluation({
        name: `${name}-${group}`,
        dataset,
        scorers: [scorer],
        description:
          'Recorded outputs only: no actor inference on replay. Criteria inspect executable musical artifacts, not teaching quality. executionLatencyMs is original execution; replay duration is not inference latency. Native means are checkpoint means; paired recording aggregation is in the report.',
      });
      const [ref] = await Promise.all([
        dataset.save(),
        ...dataset.rows.rows.map((r) => r.__savedRef),
      ]);
      receipt.datasetRef = ref.uri();
      receipt.scorerRef = (await publisher.client.publish(scorer)).uri();
      receipt.evaluationRef = (await publisher.client.publish(evaluation)).uri();
      await save();
      const model = weave.op(
        ({ datasetRow }) => {
          const current = publisher.client.getCallStack().findLastByOpName(['Evaluation.evaluate']);
          receipt.callId = current.callId;
          receipt.traceId = current.traceId;
          return structuredClone(recorded(source.find((r) => r.id === datasetRow.id)));
        },
        { name: `${name}-${group}-recorded-output`, parameterNames: 'useParam0Object' },
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
      const row = rows.find((r) => r.id === model?.output?.id),
        original = source.find((r) => r.id === row?.id);
      if (!row || !original || !scorer || children.length !== 2 || seen.has(row.id))
        throw new Error('Replay membership mismatch');
      const reference = `${receipt.datasetRef}/attr/rows/id/${dataset.rowDigests[row.id]}`;
      if (
        model.inputs.datasetRow !== reference ||
        scorer.inputs.datasetRow !== reference ||
        parent.inputs.example !== reference ||
        !equal(model.output, recorded(original)) ||
        !equal(scorer.output, scalarScores(row, recorded(original))) ||
        !equal(scorer.inputs.modelOutput, recorded(original))
      )
        throw new Error('Replay output or criterion mismatch');
      seen.add(row.id);
    }
    if (!equal(calls.find((c) => c.id === receipt.callId).output, receipt.summary))
      throw new Error('Aggregate mismatch');
    receipt.verification = {
      rows: seen.size,
      calls: calls.length,
      sourceOutputAndScoresMatch: true,
      lensVerified: lens.verified,
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
    JSON.stringify({
      group,
      status: receipt.status,
      url: receipt.url,
      verification: receipt.verification,
    }),
  );
}
