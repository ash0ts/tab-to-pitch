import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { qualificationCases, testCases } from './cases.js';
import {
  caseSchema,
  executeIntent,
  INTENT_VERSION,
  intentSchema,
  scoreIntent,
  type IntentCase,
} from './contract.js';
import { parseIntent } from './parser.js';
import { MAX_COMPLETION_TOKENS, messagesFor, MODEL, SYSTEM_PROMPT, tool } from './prompt.js';
import {
  accountedTokens,
  requireAllowance,
  validUsage,
  type Usage,
} from '../coach-benchmark/contracts.js';
import { createLensCapture } from '../coach-benchmark/lens-capture.js';
import { createNativeInferenceFetch } from '../coach-benchmark/native-fetch.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const destination = resolve(root, '../tabtopitch-real-data/practice-intent-v2');
const project = 'wandb/tab-to-pitch-public-data-research';
const maxCalls = 26;
const maxTokens = 40_000;
const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const sourcePaths = [
  'research/practice-intent/contract.ts',
  'research/practice-intent/cases.ts',
  'research/practice-intent/parser.ts',
  'research/practice-intent/prompt.ts',
  'research/practice-intent/run.ts',
  'research/practice-intent/protocol.md',
  'research/coach-benchmark/contracts.ts',
  'research/coach-benchmark/lens-capture.ts',
  'research/coach-benchmark/native-fetch.ts',
  'src/engine/exploration.ts',
  'src/engine/theory.ts',
  'src/engine/types.ts',
  'package-lock.json',
];
export interface ResultRow {
  taskId: string;
  arm: string;
  phase: 'qualification' | 'test';
  output: unknown;
  scores: ReturnType<typeof scoreIntent>;
  execution: ReturnType<typeof executeIntent> | null;
  providerSucceeded: boolean | null;
  elapsedMs: number;
  traceId?: string;
  failure?: string;
  requestSequence?: number;
}
interface RequestReceipt {
  sequence: number;
  taskId: string;
  phase: 'qualification' | 'test';
  startedAt: string;
  reservedTokens: number;
  status: 'started' | 'responded' | 'transport-failure';
  elapsedMs?: number;
  httpStatus?: number;
  usage?: Usage;
  returnedModel?: string;
  responseId?: string;
  finishReason?: string;
  toolCalls?: unknown[];
}
interface Campaign {
  schemaVersion: 1;
  project: string;
  version: string;
  sourceHash: string;
  datasetHash: string;
  createdAt: string;
  completedAt?: string;
  status: string;
  qualified: boolean;
  rows: ResultRow[];
  requests: RequestReceipt[];
  discovery: { attempt: number; at: string; available: boolean; httpStatus?: number }[];
  activeAttempt?: { taskId: string; phase: 'qualification' | 'test' };
  failure?: string;
}
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
async function save(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, json(value));
  await rename(`${path}.tmp`, path);
}
function summarize(rows: ResultRow[], requests: RequestReceipt[] = []) {
  const summaries = [
    ...new Set(rows.filter((row) => row.phase === 'test').map((row) => row.arm)),
  ].map((arm) => {
    const test = rows.filter((row) => row.arm === arm && row.phase === 'test');
    const expectedExplorations = testCases
      .filter((task) => task.expected.action === 'explore')
      .map((task) => task.id);
    return {
      arm,
      planned: testCases.length,
      completed: test.length,
      missing: testCases.length - test.length,
      exactIntent: test.filter((row) => row.scores.exactIntent).length,
      schemaValid: test.filter((row) => row.scores.schemaValid).length,
      engineValid: test.filter((row) => row.scores.engineValid).length,
      providerSucceeded:
        arm === 'deterministic-parser' ? null : test.filter((row) => row.providerSucceeded).length,
      usableExplorations: test.filter(
        (row) => expectedExplorations.includes(row.taskId) && row.scores.usableExploration,
      ).length,
      expectedExplorations: expectedExplorations.length,
      categories: Object.fromEntries(
        ['literal', 'paraphrase', 'boundary', 'adversarial'].map((category) => {
          const tasks = testCases.filter((task) => task.category === category);
          return [
            category,
            {
              passed: test.filter(
                (row) => tasks.some((task) => task.id === row.taskId) && row.scores.exactIntent,
              ).length,
              total: tasks.length,
            },
          ];
        }),
      ),
    };
  });
  const baseline = rows.filter((row) => row.arm === 'deterministic-parser' && row.phase === 'test');
  const hosted = rows.filter((row) => row.arm === MODEL && row.phase === 'test');
  const paired = {
    modelOnly: 0,
    parserOnly: 0,
    both: 0,
    neither: 0,
    missingHosted: testCases.length - hosted.length,
  };
  for (const local of baseline) {
    const remote = hosted.find((row) => row.taskId === local.taskId);
    if (!remote) continue;
    paired[
      local.scores.exactIntent
        ? remote.scores.exactIntent
          ? 'both'
          : 'parserOnly'
        : remote.scores.exactIntent
          ? 'modelOnly'
          : 'neither'
    ]++;
  }
  return {
    version: INTENT_VERSION,
    synthetic: true,
    realLearners: 0,
    promotionEligible: false,
    plannedTasks: testCases.length,
    summaries,
    paired,
    requests: requests.length,
    knownTokens: requests.reduce((sum, request) => sum + (request.usage?.total_tokens ?? 0), 0),
    unknownUsageRequests: requests.filter((request) => !request.usage).length,
    accountedTokens: accountedTokens(requests),
    maxCalls,
    maxTokens,
  };
}
async function main() {
  await mkdir(destination, { recursive: true });
  const cases = testCases.map((task) => caseSchema.parse(task));
  const datasetHash = digest(json(cases));
  const sourceHashes = await Promise.all(
    sourcePaths.map(async (path) => ({
      path,
      sha256: digest(await readFile(resolve(root, path))),
    })),
  );
  const sourceHash = digest(json(sourceHashes));
  const manifestPath = resolve(destination, 'manifest.json');
  const campaignPath = resolve(destination, 'campaign.json');
  if (process.argv.includes('--prepare')) {
    const manifest = {
      schemaVersion: 1,
      project,
      version: INTENT_VERSION,
      createdAt: new Date().toISOString(),
      datasetHash,
      sourceHash,
      sourceHashes,
      qualificationHash: digest(json(qualificationCases)),
      tasks: cases.map((task) => task.id),
      model: MODEL,
      maxCalls,
      maxTokens,
      maxCompletionTokens: MAX_COMPLETION_TOKENS,
      synthetic: true,
      realLearners: 0,
      policyPromotion: false,
      integration: 'research-only; actual engine, no app intent endpoint',
    };
    await writeFile(manifestPath, json(manifest), { flag: 'wx' });
    await writeFile(resolve(destination, 'cases.json'), json(cases), { flag: 'wx' });
    await writeFile(resolve(destination, 'qualification-cases.json'), json(qualificationCases), {
      flag: 'wx',
    });
    for (const path of sourcePaths) {
      const to = resolve(destination, 'source-snapshot', path);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, await readFile(resolve(root, path)), { flag: 'wx' });
    }
    const rows: ResultRow[] = cases.map((task) => {
      const start = performance.now();
      const output = parseIntent(task.request, task.context);
      return {
        taskId: task.id,
        arm: 'deterministic-parser',
        phase: 'test',
        output,
        scores: scoreIntent(task, output),
        execution: executeIntent(output, task.context),
        providerSucceeded: null,
        elapsedMs: performance.now() - start,
      };
    });
    await writeFile(resolve(destination, 'baseline.json'), json(rows), { flag: 'wx' });
    await save(resolve(destination, 'summary.json'), summarize(rows));
    console.info(json({ prepared: true, sourceHash, datasetHash, ...summarize(rows) }));
    return;
  }
  if (process.argv.includes('--summarize')) {
    const campaign: Campaign = JSON.parse(await readFile(campaignPath, 'utf8'));
    const summary = summarize(campaign.rows, campaign.requests);
    await save(resolve(destination, 'summary.json'), summary);
    console.info(json(summary));
    return;
  }
  if (!process.argv.includes('--run')) throw new Error('Choose --prepare, --run or --summarize');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    manifest.sourceHash !== sourceHash ||
    manifest.datasetHash !== datasetHash ||
    manifest.qualificationHash !== digest(json(qualificationCases))
  )
    throw new Error('Frozen source or fixture changed');
  const credential = process.env.WANDB_API_KEY;
  if (!credential) throw new Error('Missing inference credential');
  const campaign: Campaign = {
    schemaVersion: 1,
    project,
    version: INTENT_VERSION,
    sourceHash,
    datasetHash,
    createdAt: new Date().toISOString(),
    status: 'qualifying',
    qualified: false,
    rows: JSON.parse(await readFile(resolve(destination, 'baseline.json'), 'utf8')),
    requests: [],
    discovery: [],
  };
  await writeFile(campaignPath, json(campaign), { flag: 'wx' });
  const checkpoint = () => save(campaignPath, campaign);
  const native = createNativeInferenceFetch();
  const capture = createLensCapture(resolve(destination, 'lens-capture'));
  let tracingReady = false;
  try {
    // Reuse the existing separately tested private-project transport. No project creation.
    const transportModule = '../forge/transport.mjs';
    const projectModule = '../forge/project.mjs';
    const { ForgeTransport } = await import(transportModule);
    const { ensurePrivateProject } = await import(projectModule);
    const transport = new ForgeTransport({
      directory: resolve(destination, 'preflight'),
      mode: 'native',
    });
    try {
      const receipt = await ensurePrivateProject(transport, { createIfMissing: false });
      await save(resolve(destination, 'project.json'), receipt);
    } finally {
      transport.close();
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      const receipt: Campaign['discovery'][number] = {
        attempt,
        at: new Date().toISOString(),
        available: false,
      };
      try {
        const response = await native.fetch('https://api.inference.wandb.ai/v1/models', {
          headers: { Authorization: `Bearer ${credential}` },
          signal: AbortSignal.timeout(20_000),
        });
        receipt.httpStatus = response.status;
        const value = (await response.json()) as { data?: { id: string }[] };
        receipt.available = response.ok && !!value.data?.some((item) => item.id === MODEL);
      } catch {
        /* Every read-only attempt remains in the receipt. */
      }
      campaign.discovery.push(receipt);
      await checkpoint();
      if (receipt.available) break;
    }
    if (!campaign.discovery.some((receipt) => receipt.available))
      throw new Error('Model discovery did not qualify');
    await tracing.init(project, {
      apiKey: credential,
      serviceName: 'tab-to-pitch-fretboard-intent',
      spanProcessor: capture.spanProcessor,
    });
    tracingReady = true;
    async function attempt(task: IntentCase, phase: 'qualification' | 'test') {
      const body = JSON.stringify({
        model: MODEL,
        messages: messagesFor(task),
        tools: [tool],
        tool_choice: { type: 'function', function: { name: 'propose_exploration' } },
        max_tokens: MAX_COMPLETION_TOKENS,
        temperature: 0,
      });
      const reservedTokens = Buffer.byteLength(body) + MAX_COMPLETION_TOKENS + 128;
      requireAllowance(campaign.requests, reservedTokens, maxCalls, maxTokens);
      campaign.activeAttempt = { taskId: task.id, phase };
      const request: RequestReceipt = {
        sequence: campaign.requests.length + 1,
        taskId: task.id,
        phase,
        startedAt: new Date().toISOString(),
        reservedTokens,
        status: 'started',
      };
      campaign.requests.push(request);
      await checkpoint();
      const start = performance.now();
      let output: unknown = null;
      let failure: string | undefined;
      let traceId: string | undefined;
      await tracing.runIsolated(async () => {
        const conversation = tracing.startConversation({
          agentName: 'tab-to-pitch-fretboard-intent',
          agentVersion: INTENT_VERSION,
          attributes: {
            'ttp.synthetic': true,
            'ttp.task_id': task.id,
            'ttp.phase': phase,
            'ttp.source_hash': sourceHash,
            'ttp.dataset_hash': datasetHash,
          },
        });
        traceId = conversation.conversationId;
        const turn = conversation.startTurn({ userMessage: task.request });
        const model = turn.startLLM({
          model: MODEL,
          providerName: 'coreweave',
          systemInstructions: [SYSTEM_PROMPT],
        });
        model.inputMessages = [
          {
            role: 'user',
            content: JSON.stringify({ request: task.request, context: task.context }),
          },
        ];
        try {
          const response = await native.fetch(
            'https://api.inference.wandb.ai/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${credential}`,
                'Content-Type': 'application/json',
              },
              body,
              signal: AbortSignal.timeout(20_000),
            },
          );
          request.status = 'responded';
          request.httpStatus = response.status;
          const value = (await response.json()) as {
            model?: string;
            id?: string;
            usage?: unknown;
            choices?: {
              finish_reason?: string;
              message?: {
                tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
              };
            }[];
          };
          request.usage = validUsage(value.usage);
          request.returnedModel = value.model;
          request.responseId = value.id;
          request.finishReason = value.choices?.[0]?.finish_reason;
          request.toolCalls = value.choices?.[0]?.message?.tool_calls;
          model.record({
            usage: {
              inputTokens: request.usage?.prompt_tokens,
              outputTokens: request.usage?.completion_tokens,
            },
            responseId: value.id,
            responseModel: value.model,
            finishReasons: request.finishReason ? [request.finishReason] : [],
          });
          if (!response.ok) throw new Error('provider-http-failure');
          const calls = value.choices?.[0]?.message?.tool_calls;
          if (
            request.finishReason !== 'tool_calls' ||
            calls?.length !== 1 ||
            calls[0]?.function?.name !== 'propose_exploration'
          )
            throw new Error('invalid-tool-protocol');
          const args: unknown = JSON.parse(calls[0].function.arguments ?? 'null');
          model.output(JSON.stringify({ tool: 'propose_exploration', arguments: args }));
          model.end();
          const execution = turn.startTool({
            name: 'validate_and_explore',
            args: JSON.stringify(args),
            toolCallId: calls[0].id,
          });
          try {
            const parsed = intentSchema.parse(args);
            const result = executeIntent(parsed, task.context);
            output = parsed;
            execution.end({ result });
          } catch {
            execution.end({
              error: new Error('invalid-explorer-constraints'),
              errorType: 'validation',
            });
            throw new Error('invalid-explorer-constraints');
          }
        } catch (error) {
          failure = error instanceof Error ? error.message : 'unknown-failure';
          if (request.status === 'started') request.status = 'transport-failure';
          model.end({ error: new Error(failure) });
        } finally {
          turn.end(failure ? { error: new Error(failure) } : undefined);
          conversation.end(failure ? { error: new Error(failure) } : undefined);
        }
      });
      request.elapsedMs = Math.round(performance.now() - start);
      const parsed = intentSchema.safeParse(output);
      const row: ResultRow = {
        taskId: task.id,
        arm: MODEL,
        phase,
        output,
        scores: scoreIntent(task, output),
        execution: parsed.success ? executeIntent(parsed.data, task.context) : null,
        providerSucceeded: !failure,
        elapsedMs: request.elapsedMs,
        traceId,
        failure,
        requestSequence: request.sequence,
      };
      campaign.rows.push(row);
      await capture.checkpoint();
      delete campaign.activeAttempt;
      await checkpoint();
      console.info(
        JSON.stringify({
          task: task.id,
          phase,
          providerSucceeded: row.providerSucceeded,
          exactIntent: row.scores.exactIntent,
          elapsedMs: row.elapsedMs,
          failure,
          accountedTokens: accountedTokens(campaign.requests),
        }),
      );
      return row;
    }
    for (const task of qualificationCases) {
      const row = await attempt(task, 'qualification');
      if (row.providerSucceeded && row.scores.exactIntent) {
        campaign.qualified = true;
        break;
      }
    }
    if (!campaign.qualified) throw new Error('Model failed qualification; test arm unstarted');
    campaign.status = 'testing';
    await checkpoint();
    for (const task of cases) await attempt(task, 'test');
    campaign.status = 'complete';
    campaign.completedAt = new Date().toISOString();
  } catch (error) {
    campaign.status = 'stopped';
    campaign.failure = error instanceof Error ? error.message : 'unknown';
    console.error(campaign.failure);
    process.exitCode = 2;
  } finally {
    if (tracingReady) await tracing.shutdown();
    native.close();
    await checkpoint();
    await save(resolve(destination, 'summary.json'), summarize(campaign.rows, campaign.requests));
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
