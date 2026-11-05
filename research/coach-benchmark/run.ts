import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { readConfig } from '../../server/config.js';
import {
  COACH_DEADLINE_MS,
  ForgeCoachAgent,
  ForgeFailure,
  MAX_COMPLETION_TOKENS,
} from '../../server/forge-agent.js';
import { createTraceRunner, type TraceRunner } from '../../server/tracing.js';
import {
  forgeCoachVersions,
  localCoach,
  proposalForCandidate,
  type CoachResponse,
} from '../../src/shared/coach.js';
import {
  accountedTokens,
  campaignCaseSchema,
  requireAllowance,
  scoreProposal,
  validUsage,
  type CampaignCase,
  type Usage,
} from './contracts.js';
import { inferenceFetch } from './https-fetch.js';
import { createLensCapture } from './lens-capture.js';
import { createNativeInferenceFetch } from './native-fetch.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const recovery = process.argv.includes('--recovery');
const destination = resolve(
  root,
  recovery ? '../tabtopitch-real-data/coach-recovery' : '../tabtopitch-real-data/coach',
);
const previous = recovery
  ? JSON.parse(await readFile(resolve(root, '../tabtopitch-real-data/coach/campaign.json'), 'utf8'))
  : undefined;
if (
  previous &&
  (previous.activeAttempt || previous.rows.some((row: ResultRow) => row.providerSucceeded))
)
  throw new Error(
    'Transport recovery is restricted to the original campaign with no successful provider response',
  );
const native = recovery ? createNativeInferenceFetch() : undefined;
const send = native?.fetch ?? inferenceFetch;
const project = 'wandb/tab-to-pitch-public-data-research';
const models = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
const maxCalls = 88 - (previous?.requests.length ?? 0);
const maxTokens = 200_000 - (previous ? accountedTokens(previous.requests) : 0);
const sha = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
const casesFile = resolve(root, '../tabtopitch-real-data/guitarset/campaign-test-cases.json');
const receiptFile = resolve(destination, 'campaign.json');
const catalogFile = resolve(destination, 'catalog.json');
type RequestReceipt = {
  sequence: number;
  taskId: string;
  arm: string;
  phase: 'qualification' | 'test';
  startedAt: string;
  reservedTokens: number;
  status: 'started' | 'responded' | 'transport-failure';
  elapsedMs?: number;
  httpStatus?: number;
  usage?: Usage;
  returnedModel?: string;
  responseId?: string;
  finishReasons?: unknown[];
  toolCalls?: unknown[];
};
type ResultRow = {
  taskId: string;
  arm: string;
  phase: 'qualification' | 'test';
  output: CoachResponse;
  scores: ReturnType<typeof scoreProposal>;
  providerSucceeded: boolean | null;
  elapsedMs: number;
  traceId?: string;
  failureReason?: string;
  requestSequences: number[];
};
type Receipt = {
  schemaVersion: number;
  project: string;
  createdAt: string;
  status: string;
  sourceHash: string;
  datasetHash: string;
  models: string[];
  taskIds: string[];
  maxCalls: number;
  maxTokens: number;
  requests: RequestReceipt[];
  rows: ResultRow[];
  qualifiedModels: string[];
  qualificationFinished: boolean;
  traceFlush?: string;
  activeAttempt?: { taskId: string; arm: string; phase: 'qualification' | 'test' };
  failure?: string;
  completedAt?: string;
};
async function atomicJson(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n');
  await rename(`${path}.tmp`, path);
}
await mkdir(destination, { recursive: true });
const rawCases = await readFile(casesFile);
const tasks = z.array(campaignCaseSchema).length(20).parse(JSON.parse(rawCases.toString()));
if (tasks.some((task) => task.split !== 'test' || task.context.evidence.length !== 0))
  throw new Error('Expected frozen test recordings without learner history');
if (new Set(tasks.map((task) => task.recordingId)).size !== tasks.length)
  throw new Error('Test recording identities must be distinct');
const datasetHash = sha(rawCases);
const all = z
  .array(campaignCaseSchema)
  .parse(
    JSON.parse(
      await readFile(resolve(root, '../tabtopitch-real-data/guitarset/coach-cases.json'), 'utf8'),
    ),
  );
const smoke = all
  .filter((task) => task.split === 'train')
  .sort((a, b) => a.id.localeCompare(b.id))
  .slice(0, 2);
if (smoke.length !== 2) throw new Error('Missing non-test qualification recordings');
const qualificationHash = sha(JSON.stringify(smoke));
const sourcePaths = [
  'server/forge-agent.ts',
  'server/tracing.ts',
  'src/shared/coach.ts',
  'package-lock.json',
  'research/research-contract.md',
  'research/coach-benchmark/run.ts',
  'research/coach-benchmark/contracts.ts',
  'research/coach-benchmark/https-fetch.ts',
  'research/coach-benchmark/lens-capture.ts',
  'research/coach-benchmark/native-fetch.ts',
  ...(recovery ? ['research/coach-benchmark/recovery-contract.md'] : []),
];
const sourceHashes = await Promise.all(
  sourcePaths.map(async (path) => ({ path, sha256: sha(await readFile(resolve(root, path))) })),
);
const sourceHash = sha(JSON.stringify(sourceHashes));

if (process.argv.includes('--prepare')) {
  const manifest = {
    schemaVersion: 1,
    project,
    createdAt: new Date().toISOString(),
    datasetHash,
    sourceHash,
    sourceHashes,
    models,
    maxCalls,
    maxTokens,
    taskIds: tasks.map((task) => task.id),
    qualificationHash,
    qualificationTaskIds: smoke.map((task) => task.id),
    priorCampaignHash: previous
      ? sha(await readFile(resolve(root, '../tabtopitch-real-data/coach/campaign.json')))
      : undefined,
    transport: recovery ? 'native-persistent-connection' : 'curl-per-request',
    sourceDataset: 'GuitarSet 1.1.0',
    dataOrigin: 'public-recorded-music',
    learnerHistory: 'absent',
    sourceLicense: 'CC-BY-4.0',
    protocol: '../../tab-to-pitch/research/research-contract.md',
    productionDeadlineMs: COACH_DEADLINE_MS,
    maxCompletionTokens: MAX_COMPLETION_TOKENS,
    estimand:
      'Application-contract conformance and hosted-agent execution reliability; not teaching quality',
    pricingSource: 'https://www.coreweave.com/products/coreweave-forge/serverless-inference',
    pricingAccessed: '2026-10-29',
    priceUsdPerMillion: {
      'openai/gpt-oss-20b': { input: 0.03, output: 0.13 },
      'openai/gpt-oss-120b': { input: 0.03, output: 0.17 },
    },
  };
  await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
    flag: 'wx',
  });
  const baseline = tasks.map((task) => {
    const started = performance.now();
    const output = localCoach(task.context);
    const elapsedMs = performance.now() - started;
    return {
      taskId: task.id,
      arm: 'deterministic-baseline',
      phase: 'test',
      output,
      scores: scoreProposal(task, output),
      providerSucceeded: null,
      elapsedMs,
      requestSequences: [],
    };
  });
  await writeFile(resolve(destination, 'baseline.json'), JSON.stringify(baseline, null, 2) + '\n', {
    flag: 'wx',
  });
  console.info(JSON.stringify({ prepared: true, datasetHash, sourceHash, tasks: tasks.length }));
} else if (process.argv.includes('--catalog')) {
  if (!process.env.WANDB_API_KEY) throw new Error('Missing inference credential');
  const started = performance.now();
  const receipt: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    endpoint: 'https://api.inference.wandb.ai/v1/models',
  };
  try {
    const response = await send(String(receipt.endpoint), {
      headers: { Authorization: `Bearer ${process.env.WANDB_API_KEY}` },
      signal: AbortSignal.timeout(20_000),
    });
    receipt.httpStatus = response.status;
    if (!response.ok) throw new Error('Catalog returned an unsuccessful status');
    const parsed = z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .parse(await response.json());
    receipt.modelIds = parsed.data.map((item) => item.id);
    receipt.available = models.every((model) => parsed.data.some((item) => item.id === model));
  } catch (error) {
    receipt.available = false;
    receipt.error = error instanceof Error ? error.message : 'catalog-failure';
  }
  receipt.elapsedMs = Math.round(performance.now() - started);
  // Each discovery attempt has its own evidence; the latest pointer never replaces the attempt.
  await atomicJson(resolve(destination, `catalog-${Date.now()}.json`), receipt);
  await atomicJson(catalogFile, receipt);
  console.info(JSON.stringify(receipt));
} else if (process.argv.includes('--run')) {
  const manifest = JSON.parse(await readFile(resolve(destination, 'manifest.json'), 'utf8'));
  if (
    manifest.datasetHash !== datasetHash ||
    manifest.sourceHash !== sourceHash ||
    manifest.qualificationHash !== qualificationHash
  )
    throw new Error('Source or dataset drift: freeze a new version before running');
  const privateReceipt = JSON.parse(
    await readFile(resolve(root, '../tabtopitch-real-data/forge/project.json'), 'utf8'),
  );
  if (
    privateReceipt.access !== 'PRIVATE' ||
    privateReceipt.entity !== 'wandb' ||
    privateReceipt.project !== 'tab-to-pitch-public-data-research'
  )
    throw new Error('Private project is not verified');
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  if (catalog.available !== true || Date.now() - Date.parse(catalog.checkedAt) > 15 * 60_000)
    throw new Error('A fresh successful model discovery is required');
  const config = readConfig({
    ...process.env,
    CLOUD_COACH_ENABLED: 'true',
    FORGE_TRACING_ENABLED: 'true',
    FORGE_PROJECT: project,
    DATABASE_URL: 'research-no-database-used',
    SESSION_SECRET: 'research-only-not-a-session-secret-32',
  });
  if (!config.cloudEnabled) throw new Error('Missing hosted inference configuration');
  if (recovery) {
    // Establish the reusable connection with bounded read-only requests. No completion retry.
    let connected = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const evidence: Record<string, unknown> = { attempt, checkedAt: new Date().toISOString() };
      try {
        const response = await send('https://api.inference.wandb.ai/v1/models', {
          headers: { Authorization: `Bearer ${config.forgeApiKey}` },
          signal: AbortSignal.timeout(20_000),
        });
        evidence.httpStatus = response.status;
        const data = z
          .object({ data: z.array(z.object({ id: z.string() })) })
          .parse(await response.json());
        connected =
          response.ok && models.every((model) => data.data.some((row) => row.id === model));
        evidence.available = connected;
      } catch {
        evidence.available = false;
      }
      await atomicJson(
        resolve(destination, `connection-preflight-${Date.now()}-${attempt}.json`),
        evidence,
      );
      console.info(JSON.stringify(evidence));
      if (connected) break;
    }
    if (!connected) throw new Error('Persistent inference connection did not qualify');
  }
  let artifact: Receipt;
  if (process.argv.includes('--resume')) {
    artifact = JSON.parse(await readFile(receiptFile, 'utf8'));
    if (
      artifact.sourceHash !== sourceHash ||
      artifact.datasetHash !== datasetHash ||
      artifact.activeAttempt
    )
      throw new Error('Cannot resume changed inputs or an outcome-unknown active attempt');
    if (artifact.status === 'complete') throw new Error('Campaign already completed');
  } else {
    artifact = {
      schemaVersion: 1,
      project,
      createdAt: new Date().toISOString(),
      status: 'running',
      sourceHash,
      datasetHash,
      models,
      taskIds: tasks.map((task) => task.id),
      maxCalls,
      maxTokens,
      requests: [],
      rows: JSON.parse(await readFile(resolve(destination, 'baseline.json'), 'utf8')),
      qualifiedModels: [],
      qualificationFinished: false,
    };
    await writeFile(receiptFile, JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx' });
  }
  const save = () => atomicJson(receiptFile, artifact);
  let activeTraceId: string | undefined;
  const capture = createLensCapture(resolve(destination, 'lens-capture'));
  const productionTracer = createTraceRunner(config, { spanProcessor: capture.spanProcessor });
  const tracer: TraceRunner = {
    run: (work) =>
      productionTracer.run((trace) => {
        if (!trace.id) throw new Error('Agent Lens initialization did not qualify');
        activeTraceId = trace.id;
        return work(trace);
      }),
    close: () => productionTracer.close(),
  };
  const budgetedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!new URL(request.url).pathname.endsWith('/chat/completions')) return send(request);
    if (!artifact.activeAttempt) throw new Error('Missing active attempt identity');
    const body = await request.clone().text();
    const reservedTokens = Buffer.byteLength(body) + MAX_COMPLETION_TOKENS + 128;
    requireAllowance(artifact.requests, reservedTokens, maxCalls, maxTokens);
    const receipt: RequestReceipt = {
      sequence: artifact.requests.length + 1,
      ...artifact.activeAttempt,
      startedAt: new Date().toISOString(),
      reservedTokens,
      status: 'started',
    };
    artifact.requests.push(receipt);
    await save();
    const started = performance.now();
    try {
      const response = await send(request);
      receipt.httpStatus = response.status;
      receipt.status = 'responded';
      const payload: unknown = await response
        .clone()
        .json()
        .catch(() => undefined);
      const parsed =
        payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      receipt.usage = validUsage(parsed.usage);
      if (typeof parsed.model === 'string') receipt.returnedModel = parsed.model;
      if (typeof parsed.id === 'string') receipt.responseId = parsed.id;
      if (Array.isArray(parsed.choices)) {
        const choices = parsed.choices.filter(
          (choice): choice is Record<string, unknown> =>
            choice !== null && typeof choice === 'object',
        );
        receipt.finishReasons = choices.flatMap((choice) =>
          typeof choice.finish_reason === 'string' ? [choice.finish_reason] : [],
        );
        receipt.toolCalls = choices.flatMap((choice) => {
          const message = choice.message;
          return message !== null &&
            typeof message === 'object' &&
            'tool_calls' in message &&
            Array.isArray(message.tool_calls)
            ? message.tool_calls
            : [];
        });
      }
      return response;
    } catch (error) {
      receipt.status = 'transport-failure';
      throw error;
    } finally {
      receipt.elapsedMs = Math.round(performance.now() - started);
      await save();
    }
  };
  const agents = new Map(
    models.map((model) => [
      model,
      new ForgeCoachAgent({ ...config, forgeModel: model }, budgetedFetch, tracer),
    ]),
  );
  async function attempt(task: CampaignCase, arm: string, phase: 'qualification' | 'test') {
    if (
      artifact.rows.some((row) => row.taskId === task.id && row.arm === arm && row.phase === phase)
    )
      return;
    artifact.activeAttempt = { taskId: task.id, arm, phase };
    activeTraceId = undefined;
    await save();
    const firstSequence = artifact.requests.length + 1;
    const started = performance.now();
    let output: CoachResponse;
    let failureReason: string | undefined;
    try {
      const result = await agents
        .get(arm)!
        .run(task.context, AbortSignal.timeout(COACH_DEADLINE_MS));
      output = {
        source: 'forge',
        versions: forgeCoachVersions(arm),
        proposal: proposalForCandidate(task.context, result.candidateId),
        traceId: result.traceId,
      };
    } catch (error) {
      failureReason = error instanceof ForgeFailure ? error.reason : 'unavailable';
      output = localCoach(task.context, failureReason as 'unavailable' | 'invalid-response');
    }
    artifact.rows.push({
      taskId: task.id,
      arm,
      phase,
      output,
      scores: scoreProposal(task, output),
      providerSucceeded: output.source === 'forge',
      elapsedMs: Math.round(performance.now() - started),
      traceId: activeTraceId,
      failureReason,
      requestSequences: artifact.requests
        .filter((row) => row.sequence >= firstSequence)
        .map((row) => row.sequence),
    });
    await capture.checkpoint();
    delete artifact.activeAttempt;
    await save();
    console.info(
      JSON.stringify({
        task: task.id,
        arm,
        phase,
        providerSucceeded: output.source === 'forge',
        failureReason,
        traceId: activeTraceId,
        completionRequests: artifact.requests.length,
        accountedTokens: accountedTokens(artifact.requests),
      }),
    );
  }
  try {
    if (!artifact.qualificationFinished) {
      for (const arm of models) {
        for (const task of smoke) {
          await attempt(task, arm, 'qualification');
          if (
            artifact.rows.some(
              (row) => row.arm === arm && row.phase === 'qualification' && row.providerSucceeded,
            )
          ) {
            if (!artifact.qualifiedModels.includes(arm)) artifact.qualifiedModels.push(arm);
            break;
          }
        }
      }
      artifact.qualificationFinished = true;
      await save();
    }
    if (!artifact.qualifiedModels.length)
      throw new Error('No hosted model qualified; test campaign was not started');
    for (const task of tasks)
      for (const arm of artifact.qualifiedModels) {
        requireAllowance(
          artifact.requests,
          2 * (8192 + MAX_COMPLETION_TOKENS + 128),
          maxCalls - 1,
          maxTokens,
        );
        await attempt(task, arm, 'test');
      }
    artifact.status =
      artifact.qualifiedModels.length === models.length
        ? 'complete'
        : 'partial-model-qualification';
    artifact.completedAt = new Date().toISOString();
  } catch (error) {
    artifact.status = 'stopped';
    artifact.failure = error instanceof Error ? error.message : 'campaign-failure';
  } finally {
    await save();
    try {
      await tracer.close();
      artifact.traceFlush = 'durably-captured-requires-publication-and-readback';
    } catch {
      artifact.traceFlush = 'failed';
    }
    await save();
  }
  console.info(
    JSON.stringify({
      status: artifact.status,
      requests: artifact.requests.length,
      accountedTokens: accountedTokens(artifact.requests),
      receiptFile,
    }),
  );
} else throw new Error('Use --prepare, --catalog or --run [--resume]');
native?.close();
