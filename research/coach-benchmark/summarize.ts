/** Read-only reconciliation of frozen campaign evidence. Makes no network calls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelContext } from '../../server/forge-agent.js';
import { validateCoachResponse } from '../../src/shared/coach.js';
import { campaignCaseSchema, scoreProposal } from './contracts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = resolve(root, '../tabtopitch-real-data/coach-recovery');
const music = resolve(root, '../tabtopitch-real-data/guitarset');
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const load = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const [manifest, campaign, baseline, original, rawCases, allCases, catalog] = await Promise.all([
  load(resolve(directory, 'manifest.json')),
  load(resolve(directory, 'campaign.json')),
  load(resolve(directory, 'baseline.json')),
  load(resolve(directory, '../coach/campaign.json')),
  readFile(resolve(music, 'campaign-test-cases.json')),
  load(resolve(music, 'coach-cases.json')),
  load(resolve(directory, 'catalog.json')),
]);
const tasks = JSON.parse(rawCases.toString()).map((row: unknown) => campaignCaseSchema.parse(row));
const qualification = allCases
  .map((row: unknown) => campaignCaseSchema.parse(row))
  .filter((row: any) => row.split === 'train')
  .sort((a: any, b: any) => a.id.localeCompare(b.id))
  .slice(0, 2);
const indexed = new Map([...tasks, ...qualification].map((row: any) => [row.id, row]));
assert.equal(sha(rawCases), manifest.datasetHash);
assert.equal(sha(JSON.stringify(qualification)), manifest.qualificationHash);
assert.equal(
  sha(await readFile(resolve(directory, '../coach/campaign.json'))),
  manifest.priorCampaignHash,
);
for (const source of manifest.sourceHashes) {
  assert.equal(sha(await readFile(resolve(root, source.path))), source.sha256, source.path);
}
assert.equal(sha(JSON.stringify(manifest.sourceHashes)), manifest.sourceHash);
assert.equal(campaign.sourceHash, manifest.sourceHash);
assert.equal(campaign.datasetHash, manifest.datasetHash);
assert.deepEqual(
  tasks.map((row: any) => row.id),
  manifest.taskIds,
);
assert.deepEqual(campaign.taskIds, manifest.taskIds);
assert.deepEqual(
  qualification.map((row: any) => row.id),
  manifest.qualificationTaskIds,
);
assert.equal(new Set(tasks.map((row: any) => row.recordingId)).size, 20);
assert.equal(new Set(tasks.map((row: any) => row.performerId)).size, 1);
assert.equal(new Set(tasks.map((row: any) => row.progressionFamily)).size, 1);
for (const task of [...tasks, ...qualification]) {
  assert.equal(task.context.evidence.length, 0);
  assert.equal(
    sha(await readFile(resolve(music, 'raw', `${task.recordingId}.jams`))),
    task.sourceSha256,
  );
}
assert(tasks.every((task: any) => task.split === 'test'));
assert(qualification.every((task: any) => !manifest.taskIds.includes(task.id)));
assert.equal(catalog.available, true);
const catalogAgeMs = Date.parse(campaign.createdAt) - Date.parse(catalog.checkedAt);
assert(catalogAgeMs >= 0 && catalogAgeMs < 15 * 60_000);
assert(!campaign.activeAttempt && !original.activeAttempt);
assert.equal(campaign.status, 'partial-model-qualification');
assert.equal(campaign.qualificationFinished, true);
assert.deepEqual(campaign.qualifiedModels, ['openai/gpt-oss-20b']);
assert.equal(original.status, 'stopped');
assert(original.rows.every((row: any) => row.providerSucceeded !== true));

function usage(requests: any[]) {
  let input = 0,
    output = 0,
    known = 0,
    unknown = 0;
  for (const request of requests) {
    if (request.usage) {
      const u = request.usage;
      assert(
        [u.prompt_tokens, u.completion_tokens, u.total_tokens].every(
          (v) => Number.isInteger(v) && v >= 0,
        ),
      );
      assert(u.total_tokens >= u.prompt_tokens + u.completion_tokens);
      assert(u.completion_tokens <= manifest.maxCompletionTokens);
      assert(u.total_tokens <= request.reservedTokens);
      input += u.prompt_tokens;
      output += u.completion_tokens;
      known += u.total_tokens;
    } else unknown += request.reservedTokens;
  }
  return {
    requests: requests.length,
    promptTokens: input,
    completionTokens: output,
    knownTokens: known,
    unknownUsageReservedTokens: unknown,
    accountedTokens: known + unknown,
  };
}
const originalUsage = usage(original.requests);
const recoveryUsage = usage(campaign.requests);
assert.equal(manifest.maxCalls, 88 - originalUsage.requests);
assert.equal(manifest.maxTokens, 200_000 - originalUsage.accountedTokens);
let spent = 0;
for (const [index, request] of campaign.requests.entries()) {
  assert.equal(request.sequence, index + 1);
  assert(index < manifest.maxCalls);
  assert(spent + request.reservedTokens <= manifest.maxTokens);
  assert.equal(request.status, 'responded');
  assert.equal(request.httpStatus, 200);
  assert.equal(request.returnedModel, request.arm);
  assert(request.responseId && request.usage);
  spent += request.usage.total_tokens;
}
assert.equal(
  new Set(campaign.requests.map((row: any) => row.responseId)).size,
  campaign.requests.length,
);
const seenRows = new Set(),
  assignedRequests = new Set();
const failures: any[] = [];
for (const row of campaign.rows) {
  const key = [row.phase, row.arm, row.taskId].join('|');
  assert(!seenRows.has(key));
  seenRows.add(key);
  const task: any = indexed.get(row.taskId);
  assert(task);
  assert.equal(row.phase === 'test' ? 'test' : 'train', task.split);
  validateCoachResponse(row.output, task.context);
  assert.deepEqual(scoreProposal(task, row.output), row.scores);
  assert(Object.values(row.scores).every((value) => value === true));
  if (row.arm === 'deterministic-baseline') {
    assert.equal(row.providerSucceeded, null);
    assert.equal(row.requestSequences.length, 0);
    continue;
  }
  assert(row.traceId);
  assert.equal(row.providerSucceeded, row.output.source === 'forge');
  const requests = row.requestSequences.map((sequence: number) => {
    assert(!assignedRequests.has(sequence));
    assignedRequests.add(sequence);
    const request = campaign.requests[sequence - 1];
    assert.equal(request.taskId, row.taskId);
    assert.equal(request.arm, row.arm);
    assert.equal(request.phase, row.phase);
    return request;
  });
  assert(requests.length >= 1 && requests.length <= 2);
  assert(row.elapsedMs <= manifest.productionDeadlineMs);
  assert(
    row.elapsedMs + 3 >=
      requests.reduce((total: number, request: any) => total + request.elapsedMs, 0),
  );
  let violation: string | undefined;
  for (const [index, request] of requests.entries()) {
    const expected = index === 0 ? 'inspect_practice' : 'choose_drill';
    if (request.finishReasons.includes('length')) violation = 'completion-cap-reached';
    else if (request.toolCalls.length !== 1) violation = 'missing-single-required-tool';
    else if (request.toolCalls[0].function.name !== expected) violation = 'wrong-tool-name';
    else {
      const args = JSON.parse(request.toolCalls[0].function.arguments);
      if (index === 0 && JSON.stringify(args) !== '{}')
        violation = 'unexpected-inspection-arguments';
      if (index === 1) {
        assert.deepEqual(Object.keys(args), ['candidate']);
        assert.match(args.candidate, /^c\d{1,2}$/);
        assert(task.context.candidates[Number(args.candidate.slice(1))]);
        assert.equal(
          row.output.proposal.candidateId,
          task.context.candidates[Number(args.candidate.slice(1))].id,
        );
      }
    }
  }
  if (row.providerSucceeded) {
    assert.equal(requests.length, 2);
    assert.equal(violation, undefined);
  } else {
    assert(violation);
    assert.equal(row.failureReason, 'invalid-response');
    assert.equal(row.output.fallbackReason, row.failureReason);
    failures.push({
      phase: row.phase,
      model: row.arm,
      taskId: row.taskId,
      requestSequences: row.requestSequences,
      observedViolation: violation,
    });
  }
}
assert.equal(assignedRequests.size, campaign.requests.length);
assert.deepEqual(
  campaign.rows.filter((row: any) => row.arm === 'deterministic-baseline'),
  baseline,
);
const hosted = campaign.rows.filter((row: any) => row.arm !== 'deterministic-baseline');
assert.equal(hosted.length, 23);
assert.equal(new Set(hosted.map((row: any) => row.traceId)).size, hosted.length);
const test = hosted.filter((row: any) => row.phase === 'test');
assert.deepEqual(
  test.map((row: any) => row.taskId),
  manifest.taskIds,
);
assert(test.every((row: any) => row.arm === 'openai/gpt-oss-20b'));

const captureFiles = (await readdir(resolve(directory, 'lens-capture'))).filter((file) =>
  file.endsWith('.json'),
);
let spanCount = 0;
const spanIds = new Set(),
  traceIds = new Set();
for (const filename of captureFiles) {
  const batch = await load(resolve(directory, 'lens-capture', filename));
  const bytes = await readFile(resolve(directory, 'lens-capture', batch.filename));
  assert.equal(sha(bytes), batch.sha256);
  assert.equal(bytes.length, batch.bytes);
  assert.equal(batch.spans.length, batch.spanCount);
  for (const span of batch.spans) {
    assert(!spanIds.has(span.spanId));
    spanIds.add(span.spanId);
    traceIds.add(span.traceId);
  }
  spanCount += batch.spanCount;
}

function latency(rows: any[]) {
  const values = rows.map((row) => row.elapsedMs).sort((a, b) => a - b);
  const q = (p: number) => {
    const index = (values.length - 1) * p;
    const low = Math.floor(index),
      high = Math.ceil(index);
    return values[low] + (values[high] - values[low]) * (index - low);
  };
  return {
    n: values.length,
    minMs: values[0],
    medianMs: q(0.5),
    p95Ms: q(0.95),
    maxMs: values.at(-1),
    method:
      'Linear interpolation of measured per-attempt wall time; includes rejected attempts and local fallback.',
  };
}
function summarize(arm: string, phase: string) {
  const rows = campaign.rows.filter((row: any) => row.arm === arm && row.phase === phase);
  if (!rows.length) return { attempts: 0, status: 'unstarted-model-did-not-qualify' };
  return {
    attempts: rows.length,
    providerSucceeded:
      arm === 'deterministic-baseline'
        ? null
        : rows.filter((row: any) => row.providerSucceeded).length,
    fallbacks:
      arm === 'deterministic-baseline'
        ? null
        : rows.filter((row: any) => !row.providerSucceeded).length,
    applicationContracts: Object.fromEntries(
      Object.keys(rows[0].scores).map((key) => [
        key,
        { passed: rows.filter((row: any) => row.scores[key]).length, denominator: rows.length },
      ]),
    ),
    latency: latency(rows),
    usage:
      arm === 'deterministic-baseline'
        ? null
        : usage(campaign.requests.filter((row: any) => row.arm === arm && row.phase === phase)),
  };
}
const report = {
  schemaVersion: 1,
  status: 'independent-local-audit-pass',
  campaignStatus: campaign.status,
  evidence: {
    manifestSha256: sha(await readFile(resolve(directory, 'manifest.json'))),
    campaignSha256: sha(await readFile(resolve(directory, 'campaign.json'))),
    baselineSha256: sha(await readFile(resolve(directory, 'baseline.json'))),
    sourceHash: manifest.sourceHash,
    datasetHash: manifest.datasetHash,
    checkedSourceFiles: manifest.sourceHashes.length,
    checkedRawAnnotations: tasks.length + qualification.length,
    qualificationHash: manifest.qualificationHash,
    priorCampaignHash: manifest.priorCampaignHash,
  },
  cohort: {
    recordings: tasks.length,
    distinctNumericContexts: new Set(
      tasks.map((task: any) => JSON.stringify(modelContext(task.context))),
    ).size,
    performers: 1,
    progressionFamilies: 1,
    learnerHistoryPresent: false,
    independentLearners: 0,
  },
  recovery: {
    usage: recoveryUsage,
    baselineTest: summarize('deterministic-baseline', 'test'),
    model20bQualification: summarize('openai/gpt-oss-20b', 'qualification'),
    model20bTest: summarize('openai/gpt-oss-20b', 'test'),
    model120bQualification: summarize('openai/gpt-oss-120b', 'qualification'),
    model120bTest: summarize('openai/gpt-oss-120b', 'test'),
  },
  original: {
    status: original.status,
    qualificationAttempts: original.rows.filter((row: any) => row.phase === 'qualification').length,
    successfulProviderAttempts: 0,
    testAttempts: 0,
    usage: originalUsage,
    allCompletionRequestsTransportFailed: original.requests.every(
      (row: any) => row.status === 'transport-failure',
    ),
  },
  combinedBudget: {
    completionRequests: originalUsage.requests + recoveryUsage.requests,
    knownTokens: recoveryUsage.knownTokens + originalUsage.knownTokens,
    unknownUsageReservedTokens:
      originalUsage.unknownUsageReservedTokens + recoveryUsage.unknownUsageReservedTokens,
    accountedTokens: originalUsage.accountedTokens + recoveryUsage.accountedTokens,
    maxCompletionRequests: 88,
    maxAccountedTokens: 200_000,
    billingVerified: false,
  },
  traceCapture: {
    batches: captureFiles.length,
    spans: spanCount,
    uniqueSpanIds: spanIds.size,
    otelTraceIds: traceIds.size,
    campaignConversationIds: hosted.length,
    protobufHashesVerified: true,
    hostedIngestionAudited: false,
  },
  failures,
  limitations: [
    'Recovery reliability is conditional on a qualified persistent connection; preserve the original availability failures.',
    'Application contracts include deterministic local fallbacks and app-generated explanations. They are not provider success rates.',
    'Policy agreement is deterministic tie-breaking conformance, not recommendation quality or guitar-learning benefit.',
    'The 120b model has no test-set observations; no head-to-head model comparison is supported.',
    'The finite 20-recording test cohort contains 16 numeric contexts from one performer and progression family.',
    'Receipts retain selected response fields rather than complete provider bodies. Failure classifications describe retained fields, not unobserved model reasoning.',
    'OTLP hashes and span identities establish local capture only. Hosted Lens and Weave ingestion require separate readback.',
    'The noInventedHistory checker validates empty evidence references and start-recall reason only; generic history wording is application template text.',
  ],
};
assert(report.combinedBudget.completionRequests <= 88);
assert(report.combinedBudget.accountedTokens <= 200_000);
await writeFile(
  resolve(directory, 'independent-audit.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.info(
  JSON.stringify(
    {
      status: report.status,
      usage: report.combinedBudget,
      test: report.recovery.model20bTest,
      traceCapture: report.traceCapture,
    },
    null,
    2,
  ),
);
