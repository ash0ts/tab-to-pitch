import { readFile, mkdir, writeFile, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { createWeavePublisher, verifyDataset, verifyEvaluation } from '../forge/weave-client.mjs';
import { digest, json, atomicJson } from '../teacher-agent/budget.ts';
let scorePractice;
import { publishLens } from '../forge/publish-lens.mjs';
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
const recorded = (row) => ({
  id: row.id,
  response: row.output,
  executionMs: row.executionMs,
  calls: row.calls.length,
  tools: row.tools.length,
  failure: row.failure ?? null,
  judge: row.judge ?? null,
  sourceUnchanged: row.scores.sourceUnchanged,
});
const score = (request, output) => ({
  ...scorePractice(request, output.response, output.sourceUnchanged, output.calls, output.tools),
  judge: output.judge,
});

const at = process.argv.indexOf('--dir');
if (at < 0) throw new Error('--dir is required');
const directory = resolve(process.argv[at + 1]);
const campaignRaw = await readFile(join(directory, 'campaign.json'), 'utf8');
const campaign = JSON.parse(campaignRaw);
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
if (campaign.protocol !== 'teaching-practice-v1') throw new Error('Wrong campaign protocol');
for (const source of manifest.sourceHashes)
  if (digest(await readFile(join(directory, 'source', source.path))) !== source.sha256)
    throw new Error('Frozen source changed');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
if (
  digest(await readFile(join(root, 'package-lock.json'))) !==
  manifest.sourceHashes.find((s) => s.path === 'package-lock.json')?.sha256
)
  throw new Error('Replay dependencies differ from the frozen lockfile');
if (digest(await readFile(join(directory, 'cases.json'))) !== manifest.casesHash)
  throw new Error('Frozen cases changed');
try {
  await symlink(join(root, 'node_modules'), join(directory, 'source', 'node_modules'), 'dir');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
try {
  await writeFile(join(directory, 'source', 'package.json'), '{"private":true,"type":"module"}\n', {
    flag: 'wx',
  });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
({ scorePractice } = await import(
  pathToFileURL(join(directory, 'source/research/teaching-practice/contract.ts')).href
));
for (const row of campaign.rows) {
  const reproduced = scorePractice(
    row.request,
    row.output,
    row.scores.sourceUnchanged,
    row.calls.length,
    row.tools.length,
  );
  if (json(reproduced) !== json(row.scores)) throw new Error(`Scorer mismatch: ${row.id}`);
}
if (process.argv.includes('--check')) {
  console.log(json({ rows: campaign.rows.length, inputsVerified: true, inferenceCalls: 0 }));
  process.exit(0);
}
if (process.argv.includes('--lens')) {
  const view = join(directory, 'publication', 'lens-input');
  await mkdir(view, { recursive: true });
  try {
    await symlink(join(directory, 'lens-capture'), join(view, 'lens-capture'), 'dir');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const input = json({
    project: campaign.project,
    rows: [...campaign.rows, ...(campaign.judges ?? [])],
  });
  const inputPath = join(view, 'campaign.json');
  try {
    await writeFile(inputPath, input, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST' || (await readFile(inputPath, 'utf8')) !== input) throw error;
  }
  console.log(
    json(
      await publishLens({
        directory: join(directory, 'publication', 'lens'),
        coachDirectory: view,
        verifyOnly: process.argv.includes('--verify'),
      }),
    ),
  );
  process.exit(0);
}
const publication = join(directory, 'publication');
await mkdir(publication, { recursive: true });
const path = join(publication, 'weave.json'),
  verifyOnly = process.argv.includes('--verify');
const receipt = verifyOnly
  ? JSON.parse(await readFile(path, 'utf8'))
  : { status: 'pending', campaignHash: digest(campaignRaw), inferenceCalls: 0, groups: [] };
if (receipt.campaignHash !== digest(campaignRaw)) throw new Error('Publication inputs changed');
if (!verifyOnly) await writeFile(path, json(receipt), { flag: 'wx', mode: 0o600 });
const publisher = await createWeavePublisher({
  directory: join(publication, 'requests'),
  mode: process.env.FORGE_TRANSPORT ?? 'curl',
});
const weave = await import('weave');
try {
  for (const arm of [...new Set(campaign.rows.map((r) => r.arm))]) {
    const rows = campaign.rows.filter((r) => r.arm === arm);
    const sources = rows.map((r) => ({
      id: r.id,
      contextId: r.contextId,
      question: r.request.request,
      request: r.request,
      executionMs: r.executionMs,
      traceId: r.traceId ?? null,
    }));
    let saved = receipt.groups.find((g) => g.arm === arm);
    if (!verifyOnly) {
      saved = { arm };
      receipt.groups.push(saved);
      const dataset = new weave.Dataset({
        name: `teaching-practice-v1-${arm}-${digest(json(sources)).slice(0, 10)}`,
        rows: JSON.parse(JSON.stringify(sources)),
        description:
          'Authored musical contexts and synthetic learning histories. Symbolic checks do not establish teaching quality or learner outcomes.',
      });
      saved.datasetRef = (await dataset.save()).uri();
      const scorer = weave.op(
        ({ datasetRow, modelOutput }) => score(datasetRow.request, modelOutput),
        { name: 'teaching-practice-structural-v1', parameterNames: 'useParam0Object' },
      );
      saved.scorerRef = (await publisher.client.publish(scorer)).uri();
      const evaluation = new weave.Evaluation({
        name: `teaching-practice-v1-${arm}`,
        dataset,
        scorers: [scorer],
        description:
          'Replay recorded outputs. No inference. Null conversational dimensions remain unmeasured. Execution latency is supplied in the dataset and differs from replay latency.',
      });
      saved.evaluationRef = (await publisher.client.publish(evaluation)).uri();
      const model = weave.op(
        ({ datasetRow }) => {
          const call = publisher.client.getCallStack().findLastByOpName(['Evaluation.evaluate']);
          if (!call) throw new Error('Missing replay parent');
          saved.callId = call.callId;
          saved.traceId = call.traceId;
          const row = rows.find((r) => r.id === datasetRow.id);
          if (!row) throw new Error('Missing recorded output');
          return structuredClone(recorded(row));
        },
        { name: `teaching-practice-recorded-${arm}`, parameterNames: 'useParam0Object' },
      );
      saved.modelRef = (await publisher.client.publish(model)).uri();
      await atomicJson(path, receipt);
      saved.summary = await evaluation.evaluate({ model, maxConcurrency: 1, nTrials: 1 });
      await publisher.flush();
      await atomicJson(path, receipt);
    }
    if (!saved) throw new Error('Missing published arm');
    saved.datasetReadback = await verifyDataset(publisher.transport, {
      datasetRef: saved.datasetRef,
      expectedRows: sources,
    });
    saved.evaluationReadback = await verifyEvaluation(publisher.transport, {
      callId: saved.callId,
      evaluationRef: saved.evaluationRef,
      datasetRef: saved.datasetRef,
      scorerRefs: [saved.scorerRef],
    });
    const tree = await publisher.transport.post(
      'trace',
      '/calls/stream_query',
      {
        project_id: manifest.project,
        filter: { trace_ids: [saved.evaluationReadback.call.trace_id] },
        limit: 2 + 3 * rows.length,
      },
      { responseFormat: 'jsonl' },
    );
    if (
      tree.length !== 1 + 3 * rows.length ||
      tree.some((call) => !call.ended_at || call.exception)
    )
      throw new Error('Incomplete evaluation tree');
    const seen = new Set();
    for (const parent of tree.filter((call) => call.parent_id === saved.callId)) {
      const children = tree.filter((call) => call.parent_id === parent.id),
        model = children.find((call) => call.op_name === saved.modelRef),
        scorer = children.find((call) => call.op_name === saved.scorerRef);
      const row = rows.find((row) => row.id === model?.output?.id);
      if (!row || !scorer || children.length !== 2 || seen.has(row.id))
        throw new Error('Unexpected output membership');
      const ref = `${saved.datasetRef}/attr/rows/id/${saved.datasetReadback.rowDigests[row.id]}`;
      if (
        model.inputs.datasetRow !== ref ||
        scorer.inputs.datasetRow !== ref ||
        canonical(model.output) !== canonical(recorded(row)) ||
        canonical(scorer.output) !== canonical(score(row.request, recorded(row)))
      )
        throw new Error('Remote output or score differs');
      seen.add(row.id);
    }
    if (seen.size !== rows.length) throw new Error('Missing evaluated rows');
    saved.outputReadback = {
      rows: seen.size,
      calls: tree.length,
      verifiedAt: new Date().toISOString(),
    };
    await atomicJson(path, receipt);
  }
  receipt.status = 'verified';
  await atomicJson(path, receipt);
  console.log(
    json({
      status: receipt.status,
      rows: campaign.rows.length,
      inferenceCalls: 0,
      groups: receipt.groups.map((g) => ({
        arm: g.arm,
        dataset: g.datasetRef,
        evaluation: g.evaluationRef,
        callId: g.callId,
      })),
    }),
  );
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = error.message;
  await atomicJson(path, receipt);
  throw error;
} finally {
  publisher.close();
}
