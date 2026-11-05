/** Read-only reconciliation of stored experiment evidence, without rescoring or inference. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ForgeTransport, jsonHash } from '../forge/transport.mjs';
import { PROJECT, ensurePrivateProject } from '../forge/project.mjs';
import { verifyDataset, verifyEvaluation } from '../forge/weave-client.mjs';
const argument = (name) => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw Error(`Required: ${name}`);
  return resolve(process.argv[i + 1]);
};
const archive = argument('--archive'),
  output = argument('--output');
if (output.startsWith(archive + '/') || output === archive)
  throw Error('Keep the archive immutable');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
const same = (a, b) => jsonHash(canonical(a)) === jsonHash(canonical(b));
const check = (value, message) => {
  if (!value) throw Error(message);
};
class ReadOnlyTransport extends ForgeTransport {
  post(service, path, value, options = {}) {
    const reads = ['/call/read', '/obj/read', '/table/query', '/calls/stream_query'];
    check(
      !options.write &&
        ((service === 'trace' && reads.includes(path)) ||
          (service === 'api' && path === '/graphql' && /^query\b/.test(value.query))),
      'Audit permits reads only',
    );
    return super.post(service, path, value, options);
  }
}
const transport = new ReadOnlyTransport({
  directory: join(output, 'requests'),
  mode: 'curl',
  deadlineMs: 20000,
});
const report = {
  version: 1,
  checkedAt: new Date().toISOString(),
  method: 'Compare hosted membership, recorded outputs and stored scores; no scorer rerun.',
  newInferenceCalls: 0,
  remoteWrites: 0,
  campaigns: [],
};
try {
  await mkdir(output, { recursive: true });
  const p = await ensurePrivateProject(transport, { createIfMissing: false });
  report.project = { id: p.projectId, access: p.access };
  for (const name of ['arrangement-agent-v2/confirmation', 'listening-agent-003']) {
    const path = join(archive, name),
      campaign = await read(join(path, 'campaign.json'));
    const cases = await read(join(path, 'cases.json')),
      saved = await read(join(path, 'publication/weave.json'));
    check(saved.status === 'verified', 'The original publication must have verified');
    for (const [file, expected] of Object.entries(saved.inputHashes)) {
      const { createHash } = await import('node:crypto');
      check(
        createHash('sha256')
          .update(await readFile(join(path, `${file}.json`)))
          .digest('hex') === expected,
        'Frozen input changed',
      );
    }
    const arrangement = name.startsWith('arrangement');
    const groups = arrangement
      ? saved.arms.map((a) => ({
          ...a,
          datasetRef: saved.refs.dataset,
          evaluationRef: saved.refs.evaluation,
          scorerRef: saved.refs.scorer,
        }))
      : saved.groups;
    let rowCount = 0,
      callCount = 0,
      criterionCount = 0;
    for (const g of groups) {
      const selected = campaign.rows.filter((r) =>
        arrangement
          ? r.phase === 'test' && `${r.arm}::trial-${r.trial}` === g.name
          : `${r.arm}::${r.suite}::${r.trial}` === g.name,
      );
      check(selected.length > 0, 'Empty or unsupported group');
      const sources = arrangement
        ? cases
        : selected.map((r) => ({
            id: `${r.taskId}:${r.turn}`,
            taskId: r.taskId,
            contextId: r.contextId,
            suite: r.suite,
            turn: r.turn,
            source:
              cases.checkpointCases.find((c) => c.id === r.taskId) ??
              cases.developmentCases.find((c) => c.id === r.taskId) ??
              cases.boundaryCases.find((c) => c.id === r.taskId) ??
              cases.episodes.find((c) => c.id === r.taskId),
          }));
      const dataset = await verifyDataset(transport, {
        datasetRef: g.datasetRef,
        expectedRows: sources,
      });
      await verifyEvaluation(transport, {
        callId: g.callId,
        evaluationRef: g.evaluationRef,
        datasetRef: g.datasetRef,
        scorerRefs: [g.scorerRef],
      });
      const calls = await transport.post(
        'trace',
        '/calls/stream_query',
        { project_id: PROJECT, filter: { trace_ids: [g.traceId] }, limit: 2 + 3 * selected.length },
        { responseFormat: 'jsonl' },
      );
      check(
        calls.length === 1 + 3 * selected.length && calls.every((c) => c.ended_at && !c.exception),
        'Incomplete replay call tree',
      );
      check(
        same(calls.find((c) => c.id === g.callId)?.output, g.summary),
        'Published aggregate changed',
      );
      const seen = new Set();
      for (const parent of calls.filter((c) => c.parent_id === g.callId)) {
        const children = calls.filter((c) => c.parent_id === parent.id),
          model = children.find((c) => c.op_name === g.modelRef),
          scorer = children.find((c) => c.op_name === g.scorerRef);
        const row = selected.find((r) =>
          arrangement
            ? r.taskId === model?.output?.taskId
            : `${r.taskId}:${r.turn}` === model?.output?.id,
        );
        check(row && children.length === 2 && scorer, 'Unexpected row membership');
        const id = arrangement ? row.taskId : `${row.taskId}:${row.turn}`;
        check(!seen.has(id), 'Duplicate row');
        seen.add(id);
        const recorded = arrangement
          ? {
              taskId: row.taskId,
              arm: row.arm,
              trial: row.trial,
              response: row.output,
              elapsedMs: row.elapsedMs,
              providerSucceeded: row.providerSucceeded,
              failure: row.failure ?? null,
            }
          : {
              id,
              request: row.request,
              response: row.output,
              execution: {
                elapsedMs: row.elapsedMs,
                providerSucceeded: row.scores.providerSuccess,
                failure: row.failure ?? null,
                traceId: row.traceId ?? null,
              },
              structural: row.scores,
              judgeReviews: row.judges,
              automatedAcceptable:
                row.judges.length &&
                row.judges.some((j) => j.qualified && j.result?.overall === 'acceptable')
                  ? true
                  : null,
            };
        const expectedScores = arrangement
          ? row.scores
          : {
              ...row.scores,
              providerSucceeded: row.scores.providerSuccess,
              automatedAcceptable: recorded.automatedAcceptable,
            };
        const ref = `${g.datasetRef}/attr/rows/id/${dataset.rowDigests[id]}`;
        check(
          parent.inputs.example === ref &&
            model.inputs.datasetRow === ref &&
            scorer.inputs.datasetRow === ref,
          'Dataset reference changed',
        );
        check(
          same(model.output, recorded) &&
            same(scorer.inputs.modelOutput, recorded) &&
            same(scorer.output, expectedScores),
          'Recorded output or criteria changed',
        );
        criterionCount += Object.keys(expectedScores).length;
      }
      check(seen.size === selected.length, 'Missing row');
      rowCount += seen.size;
      callCount += calls.length;
    }
    report.campaigns.push({
      campaign: name,
      status: 'verified',
      groups: groups.length,
      rows: rowCount,
      calls: callCount,
      criteria: criterionCount,
    });
    console.info(JSON.stringify(report.campaigns.at(-1)));
  }
  report.status = 'verified';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  process.exitCode = 2;
} finally {
  transport.close();
  await writeFile(join(output, 'readback.json'), JSON.stringify(report, null, 2) + '\n');
  console.info(JSON.stringify({ status: report.status, error: report.error }));
}
