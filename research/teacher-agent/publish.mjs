import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { atomicJson, digest, json } from './budget.ts';
import { createWeavePublisher, verifyDataset, verifyEvaluation } from '../forge/weave-client.mjs';
import { publishLens } from '../forge/publish-lens.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const index = process.argv.indexOf('--dir');
const directory = resolve(
  index < 0 ? join(root, '../tabtopitch-real-data/teacher-agent-v1') : process.argv[index + 1],
);
const raw = Object.fromEntries(
  await Promise.all(
    ['manifest', 'cases', 'campaign'].map(async (name) => [
      name,
      await readFile(join(directory, `${name}.json`), 'utf8'),
    ]),
  ),
);
const data = Object.fromEntries(
  Object.entries(raw).map(([key, value]) => [key, JSON.parse(value)]),
);
const hashes = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, digest(value)]));
for (const source of data.manifest.sourceHashes)
  if (digest(await readFile(join(directory, 'source', source.path))) !== source.sha256)
    throw new Error('Frozen scorer source changed');
if (
  digest(await readFile(join(root, 'package-lock.json'))) !==
  data.manifest.sourceHashes.find((s) => s.path === 'package-lock.json')?.sha256
)
  throw new Error('Replay dependencies differ from the frozen lockfile');
// These resolution files are outside the source manifest and contain no experimental code.
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
const { scoreStructural, judgedAcceptable } = await import(
  pathToFileURL(join(directory, 'source/research/teacher-agent/contract.ts')).href
);
const { scoreClaimFixture, scoreDialogueFixture } = await import(
  pathToFileURL(join(directory, 'source/research/teacher-agent/judge.ts')).href
);
if (
  data.manifest.datasetHash !== digest(raw.cases) ||
  data.manifest.sourceHash !== data.campaign.sourceHash
)
  throw new Error('Campaign source or fixture mismatch');
if (data.campaign.requests.some((r) => r.status === 'started'))
  throw new Error('Unresolved inference attempt');
for (const row of data.campaign.rows) {
  const score = scoreStructural(row.request, row.output, row.scores.sourceUnchanged, 0, 0);
  for (const key of ['schemaValid', 'contextMatches', 'musicalActionsValid', 'noGradeMutation'])
    if (score[key] !== row.scores[key]) throw new Error('Structural score does not reproduce');
}
const publicationIndex = process.argv.indexOf('--publication-name');
const publicationName = publicationIndex < 0 ? 'publication' : process.argv[publicationIndex + 1];
if (!/^publication(?:-[a-zA-Z0-9_-]+)?$/.test(publicationName))
  throw new Error('Invalid publication name');
const publication = join(directory, publicationName);
const publisherSources = await Promise.all(
  [
    'research/teacher-agent/publish.mjs',
    'research/teacher-agent/contract.ts',
    'research/teacher-agent/judge.ts',
    'src/engine/teacher.ts',
    'src/shared/teacher.ts',
  ].map(async (path) => ({ path, sha256: digest(await readFile(join(root, path))) })),
);
const campaignName = directory.split('/').at(-1);
const verifyOnly = process.argv.includes('--verify');
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const groups = [];
for (const key of [...new Set(data.campaign.rows.map((r) => `${r.arm}::${r.suite}::${r.trial}`))]) {
  const rows = data.campaign.rows.filter((r) => `${r.arm}::${r.suite}::${r.trial}` === key);
  groups.push({
    name: key,
    type: 'actor',
    rows,
    sources: rows.map((r) => ({
      id: `${r.taskId}:${r.turn}`,
      taskId: r.taskId,
      contextId: r.contextId,
      suite: r.suite,
      turn: r.turn,
      source:
        data.cases.fixedCases.find((c) => c.id === r.taskId) ??
        data.cases.developmentCases.find((c) => c.id === r.taskId) ??
        data.cases.boundaryCases.find((c) => c.id === r.taskId) ??
        data.cases.episodes.find((c) => c.id === r.taskId),
    })),
  });
}
for (const key of [...new Set(data.campaign.judgeRows.map((r) => `${r.model}::${r.phase}`))]) {
  const rows = data.campaign.judgeRows.filter((r) => `${r.model}::${r.phase}` === key);
  groups.push({
    name: `judge::${key}`,
    type: 'judge',
    rows,
    sources: rows.map((r) => ({
      id: r.id,
      source:
        data.cases.claimFixtures.find((c) => c.id === r.id) ??
        data.cases.dialogueFixtures.find((c) => c.id === r.id),
    })),
  });
}
function recorded(group, row) {
  return group.type === 'actor'
    ? {
        id: `${row.taskId}:${row.turn}`,
        request: row.request,
        response: row.output,
        execution: {
          elapsedMs: row.elapsedMs,
          providerSucceeded: row.providerSucceeded,
          failure: row.failure ?? null,
          traceId: row.traceId ?? null,
        },
        structural: row.scores,
        judgeReviews: row.judges,
        automatedAcceptable: judgedAcceptable(row),
      }
    : {
        id: row.id,
        response: row.result,
        failure: row.failure ?? null,
        traceId: row.traceId ?? null,
      };
}
function scores(group, source, output) {
  if (group.type === 'judge') {
    if (source.source?.expected) return scoreClaimFixture(source.source, output.response);
    return scoreDialogueFixture(source.source, output.response);
  }
  return {
    ...scoreStructural(output.request, output.response, output.structural.sourceUnchanged),
    providerSucceeded: output.execution.providerSucceeded,
    automatedAcceptable: output.automatedAcceptable,
  };
}
async function verifyGroup(publisher, receipt, group, saved) {
  const dataset = await verifyDataset(publisher.transport, {
    datasetRef: saved.datasetRef,
    expectedRows: group.sources,
  });
  await verifyEvaluation(publisher.transport, {
    callId: saved.callId,
    evaluationRef: saved.evaluationRef,
    datasetRef: saved.datasetRef,
    scorerRefs: [saved.scorerRef],
  });
  const calls = await publisher.transport.post(
    'trace',
    '/calls/stream_query',
    {
      project_id: data.manifest.project,
      filter: { trace_ids: [saved.traceId] },
      limit: 2 + 3 * group.rows.length,
    },
    { responseFormat: 'jsonl' },
  );
  if (calls.length !== 1 + 3 * group.rows.length || calls.some((c) => !c.ended_at || c.exception))
    throw new Error('Incomplete evaluation call tree');
  const rootCall = calls.find((c) => c.id === saved.callId),
    seen = new Set();
  for (const parent of calls.filter((c) => c.parent_id === saved.callId)) {
    const children = calls.filter((c) => c.parent_id === parent.id),
      model = children.find((c) => c.op_name === saved.modelRef),
      scorer = children.find((c) => c.op_name === saved.scorerRef);
    const source = group.sources.find((s) => s.id === model?.output?.id),
      row = group.rows.find(
        (r) => (group.type === 'actor' ? `${r.taskId}:${r.turn}` : r.id) === source?.id,
      );
    if (!source || !row || !scorer || children.length !== 2 || seen.has(source.id))
      throw new Error('Unexpected replay membership');
    const reference = `${saved.datasetRef}/attr/rows/id/${dataset.rowDigests[source.id]}`;
    if (
      model.inputs.datasetRow !== reference ||
      scorer.inputs.datasetRow !== reference ||
      parent.inputs.example !== reference ||
      !equal(model.output, recorded(group, row)) ||
      !equal(scorer.inputs.modelOutput, recorded(group, row)) ||
      !equal(scorer.output, scores(group, source, recorded(group, row)))
    )
      throw new Error('Replayed source/output/criterion mismatch');
    seen.add(source.id);
  }
  if (!equal(rootCall.output, saved.summary))
    throw new Error('Evaluation aggregate differs from acknowledged result');
  return {
    group: group.name,
    rows: seen.size,
    calls: calls.length,
    verified: true,
    callId: saved.callId,
  };
}
async function weavePublish() {
  await mkdir(publication, { recursive: true });
  const path = join(publication, 'weave.json');
  const receipt = verifyOnly
    ? JSON.parse(await readFile(path, 'utf8'))
    : {
        status: 'pending',
        inputHashes: hashes,
        publisherSources,
        createdAt: new Date().toISOString(),
        inferenceCallsDuringReplay: 0,
        groups: [],
      };
  if (!equal(receipt.inputHashes, hashes)) throw new Error('Publication inputs changed');
  if (!verifyOnly) await writeFile(path, json(receipt), { flag: 'wx', mode: 0o600 });
  let publisher;
  try {
    publisher = await createWeavePublisher({
      directory: join(publication, 'weave'),
      mode: process.env.FORGE_TRANSPORT ?? 'native',
      qualificationReadAttempts: 3,
    });
    if (!verifyOnly) {
      const weave = await import('weave');
      for (const group of groups) {
        const short = digest(json(group.sources)).slice(0, 12);
        const dataset = new weave.Dataset({
          name: `${campaignName}-${group.type}-${short}`,
          // The SDK treats repeated object identity as circular; copy JSON values, not aliases.
          rows: JSON.parse(JSON.stringify(group.sources)),
          description:
            'Original synthetic music-teaching fixtures. No real learner outcomes. Correlated trials are distinct from independent contexts.',
        });
        const scorer = weave.op(
          ({ datasetRow, modelOutput }) => scores(group, datasetRow, modelOutput),
          { name: `teacher-${group.type}-evidence-v1`, parameterNames: 'useParam0Object' },
        );
        const evaluation = new weave.Evaluation({
          name: `${campaignName}-${group.name.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`,
          dataset,
          scorers: [scorer],
          description:
            'Recorded output replay. Structural checks and automated judgments are separate; no inference during replay and no human pedagogical validation.',
        });
        const saved = { name: group.name };
        receipt.groups.push(saved);
        const pending = dataset.save();
        const [ref] = await Promise.all([pending, ...dataset.rows.rows.map((r) => r.__savedRef)]);
        saved.datasetRef = ref.uri();
        await atomicJson(path, receipt);
        await verifyDataset(publisher.transport, {
          datasetRef: saved.datasetRef,
          expectedRows: group.sources,
        });
        saved.scorerRef = (await publisher.client.publish(scorer)).uri();
        await atomicJson(path, receipt);
        saved.evaluationRef = (await publisher.client.publish(evaluation)).uri();
        await atomicJson(path, receipt);
        const model = weave.op(
          ({ datasetRow }) => {
            const current = publisher.client
              .getCallStack()
              .findLastByOpName(['Evaluation.evaluate']);
            if (!current || (saved.callId && saved.callId !== current.callId))
              throw new Error('Unexpected replay identity');
            saved.callId = current.callId;
            saved.traceId = current.traceId;
            const row = group.rows.find(
              (r) => (group.type === 'actor' ? `${r.taskId}:${r.turn}` : r.id) === datasetRow.id,
            );
            if (!row) throw new Error('Missing recorded output');
            return structuredClone(recorded(group, row));
          },
          {
            name: `teacher-recorded-${digest(group.name).slice(0, 12)}`,
            parameterNames: 'useParam0Object',
          },
        );
        saved.modelRef = (await publisher.client.publish(model)).uri();
        await atomicJson(path, receipt);
        saved.summary = await evaluation.evaluate({ model, maxConcurrency: 1, nTrials: 1 });
        await atomicJson(path, receipt);
        await publisher.flush();
      }
    }
    receipt.verification = [];
    for (const group of groups) {
      const saved = receipt.groups.find((g) => g.name === group.name);
      if (!saved) throw new Error('Missing published group');
      receipt.verification.push(await verifyGroup(publisher, receipt, group, saved));
    }
    receipt.status = 'verified';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error.message;
    throw error;
  } finally {
    receipt.checkedAt = new Date().toISOString();
    await atomicJson(path, receipt);
    publisher?.close();
  }
  console.info(json({ status: receipt.status, groups: receipt.verification }));
}
if (process.argv.includes('--lens')) {
  await mkdir(publication, { recursive: true });
  // The shared publisher derives conversation membership from rows. Include judge conversations
  // in a separate immutable publication view; preserve the authoritative campaign unchanged.
  const view = join(publication, 'lens-input-v2');
  await mkdir(view, { recursive: true });
  const rows = [
    ...data.campaign.rows,
    ...data.campaign.judgeRows,
    ...data.campaign.rows.flatMap((r) => r.judges),
  ];
  const fs = await import('node:fs/promises');
  const captured = join(directory, 'lens-capture'),
    target = join(view, 'lens-capture');
  try {
    await fs.symlink(captured, target, 'dir');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const body = json({ project: data.manifest.project, rows, sourceHash: data.campaign.sourceHash });
  try {
    await writeFile(join(view, 'campaign.json'), body, { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST' || (await readFile(join(view, 'campaign.json'), 'utf8')) !== body)
      throw e;
  }
  console.info(
    json(
      await publishLens({
        directory: join(publication, 'lens'),
        coachDirectory: view,
        verifyOnly,
        deadlineMs: 30000,
      }),
    ),
  );
} else if (process.argv.includes('--weave')) await weavePublish();
else
  console.info(
    json({
      ready: true,
      groups: groups.map((g) => ({ name: g.name, rows: g.rows.length })),
      inferenceCallsDuringReplay: 0,
    }),
  );
