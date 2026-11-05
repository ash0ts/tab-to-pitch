import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { ForgeArrangementAgent } from '../../server/arrangements.js';
import { readConfig } from '../../server/config.js';
import type { TraceRunner } from '../../server/tracing.js';
import { localArrangement, type ArrangementResponse } from '../../src/shared/arrangements.js';
import { testCases, developmentCases, type ArrangementCase } from './cases.js';
import { scoreArrangement } from './contract.js';
import { createLensCapture } from '../coach-benchmark/lens-capture.js';
import { createNativeInferenceFetch } from '../coach-benchmark/native-fetch.js';
import { validUsage, type Usage } from '../coach-benchmark/contracts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const destination = resolve(root, '../tabtopitch-real-data/arrangement-agent-v1');
const PROJECT = 'wandb/tab-to-pitch-public-data-research';
const MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
const maxDollars = 25,
  maxTokens = 2_000_000,
  maxCalls = 800;
const pricing = {
  source: 'https://coreweave.com/products/serverless-inference',
  verifiedAt: '2026-10-29',
  perMillion: {
    'openai/gpt-oss-20b': { input: 0.03, output: 0.13 },
    'openai/gpt-oss-120b': { input: 0.03, output: 0.17 },
  },
};
const sourcePaths = [
  'src/shared/arrangements.ts',
  'src/engine/harmony.ts',
  'src/engine/theory.ts',
  'server/arrangements.ts',
  'research/arrangement-agent/cases.ts',
  'research/arrangement-agent/contract.ts',
  'research/arrangement-agent/run.ts',
  'research/arrangement-agent/protocol.md',
  'package-lock.json',
];
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
async function save(path: string, value: unknown) {
  await writeFile(path + '.tmp', json(value));
  await rename(path + '.tmp', path);
}
interface Receipt {
  sequence: number;
  taskId: string;
  arm: string;
  trial: number;
  phase: string;
  startedAt: string;
  reservedTokens: number;
  reservedDollars: number;
  status: 'started' | 'responded' | 'failed';
  usage?: Usage;
  httpStatus?: number;
  returnedModel?: string;
  responseId?: string;
  output?: unknown;
  elapsedMs?: number;
  costDollars?: number;
}
export interface Row {
  taskId: string;
  contextId: string;
  category: string;
  arm: string;
  trial: number;
  phase: 'qualification' | 'test';
  output: ArrangementResponse | null;
  scores: ReturnType<typeof scoreArrangement>;
  elapsedMs: number;
  providerSucceeded: boolean | null;
  failure?: string;
  traceId?: string;
}
interface Campaign {
  schemaVersion: 1;
  project: string;
  sourceHash: string;
  datasetHash: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  qualified: Record<string, boolean>;
  rows: Row[];
  requests: Receipt[];
  discovery: unknown[];
  failure?: string;
}
const totals = (requests: Receipt[]) => ({
  calls: requests.length,
  tokens: requests.reduce((n, r) => n + (r.usage?.total_tokens ?? r.reservedTokens), 0),
  dollars: requests.reduce((n, r) => n + (r.costDollars ?? r.reservedDollars), 0),
  knownTokens: requests.reduce((n, r) => n + (r.usage?.total_tokens ?? 0), 0),
  unknownUsage: requests.filter((r) => !r.usage).length,
});
export function summarize(campaign: Campaign) {
  const arms = ['deterministic-parser', ...MODELS].map((arm) => {
    const rows = campaign.rows.filter((r) => r.arm === arm && r.phase === 'test');
    const planned = 96 * (arm === 'deterministic-parser' ? 1 : 2);
    const criteria = Object.fromEntries(
      Object.keys(scoreArrangement(testCases[0]!, null)).map((key) => [
        key,
        rows.filter((r) => r.scores[key as keyof Row['scores']]).length,
      ]),
    );
    const latency = rows.map((r) => r.elapsedMs).sort((a, b) => a - b);
    return {
      arm,
      qualified: arm === 'deterministic-parser' || campaign.qualified[arm] === true,
      planned,
      completed: rows.length,
      missing: planned - rows.length,
      criteria,
      requestAccuracy: rows.length ? criteria.requestCorrect! / rows.length : null,
      providerSucceeded:
        arm === 'deterministic-parser' ? null : rows.filter((r) => r.providerSucceeded).length,
      p50ms: latency[Math.floor(latency.length * 0.5)] ?? null,
      p95ms: latency[Math.floor(latency.length * 0.95)] ?? null,
      categories: Object.fromEntries(
        ['literal', 'paraphrase', 'boundary', 'adversarial'].map((category) => {
          const subset = rows.filter((r) => r.category === category);
          return [
            category,
            { correct: subset.filter((r) => r.scores.requestCorrect).length, total: subset.length },
          ];
        }),
      ),
      qualifiedForCloudPreview:
        rows.length === planned &&
        criteria.requestCorrect! / planned >= 0.9 &&
        rows.every((r) => r.scores.validNotes && r.scores.factualReferences),
    };
  });
  const paired = MODELS.map((arm) => ({
    arm,
    ...Object.fromEntries(
      ['both', 'modelOnly', 'parserOnly', 'neither'].map((outcome) => [
        outcome,
        campaign.rows
          .filter((r) => r.phase === 'test' && r.arm === arm)
          .filter((r) => {
            const baseline = campaign.rows.find(
              (b) => b.arm === 'deterministic-parser' && b.taskId === r.taskId,
            )!;
            return (
              (baseline.scores.requestCorrect
                ? r.scores.requestCorrect
                  ? 'both'
                  : 'parserOnly'
                : r.scores.requestCorrect
                  ? 'modelOnly'
                  : 'neither') === outcome
            );
          }).length,
      ]),
    ),
  }));
  return {
    version: 'arrangement-agent-v1',
    synthetic: true,
    realLearners: 0,
    contexts: 24,
    uniqueRequests: 96,
    repetitionsAreNotIndependentTasks: true,
    arms,
    paired,
    ...totals(campaign.requests),
    maxDollars,
    maxTokens,
    maxCalls,
    pricing,
  };
}
async function main() {
  await mkdir(destination, { recursive: true });
  const sourceHashes = await Promise.all(
    sourcePaths.map(async (path) => ({ path, sha256: sha(await readFile(resolve(root, path))) })),
  );
  const sourceHash = sha(json(sourceHashes)),
    datasetHash = sha(json(testCases));
  const manifestPath = resolve(destination, 'manifest.json'),
    campaignPath = resolve(destination, 'campaign.json');
  if (process.argv.includes('--prepare')) {
    const rows = testCases.map((task) => {
      const start = performance.now(),
        output = localArrangement(task.request);
      return {
        taskId: task.id,
        contextId: task.contextId,
        category: task.category,
        arm: 'deterministic-parser',
        trial: 0,
        phase: 'test' as const,
        output,
        scores: scoreArrangement(task, output),
        elapsedMs: performance.now() - start,
        providerSucceeded: null,
      };
    });
    await writeFile(
      manifestPath,
      json({
        schemaVersion: 1,
        project: PROJECT,
        sourceHash,
        sourceHashes,
        datasetHash,
        developmentHash: sha(json(developmentCases)),
        models: MODELS,
        pricing,
        maxDollars,
        maxTokens,
        maxCalls,
        createdAt: new Date().toISOString(),
      }),
      { flag: 'wx' },
    );
    await writeFile(resolve(destination, 'cases.json'), json(testCases), { flag: 'wx' });
    await writeFile(resolve(destination, 'development-cases.json'), json(developmentCases), {
      flag: 'wx',
    });
    await writeFile(resolve(destination, 'baseline.json'), json(rows), { flag: 'wx' });
    console.info(
      json({
        prepared: true,
        sourceHash,
        datasetHash,
        baselineCorrect: rows.filter((r) => r.scores.requestCorrect).length,
      }),
    );
    return;
  }
  if (process.argv.includes('--summarize')) {
    const c = JSON.parse(await readFile(campaignPath, 'utf8'));
    await save(resolve(destination, 'summary.json'), summarize(c));
    console.info(json(summarize(c)));
    return;
  }
  if (!process.argv.includes('--run')) throw new Error('Use --prepare, --run or --summarize');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.sourceHash !== sourceHash || manifest.datasetHash !== datasetHash)
    throw new Error('Frozen sources changed');
  const key = process.env.WANDB_API_KEY;
  if (!key) throw new Error('Missing inference credential');
  const campaign: Campaign = {
    schemaVersion: 1,
    project: PROJECT,
    sourceHash,
    datasetHash,
    status: 'qualifying',
    createdAt: new Date().toISOString(),
    qualified: {},
    rows: JSON.parse(await readFile(resolve(destination, 'baseline.json'), 'utf8')),
    requests: [],
    discovery: [],
  };
  await writeFile(campaignPath, json(campaign), { flag: 'wx' });
  const checkpoint = () => save(campaignPath, campaign);
  const native = createNativeInferenceFetch(),
    capture = createLensCapture(resolve(destination, 'lens-capture'));
  let initialized = false;
  try {
    const transportPath = '../forge/transport.mjs',
      projectPath = '../forge/project.mjs';
    const { ForgeTransport } = await import(transportPath),
      { ensurePrivateProject } = await import(projectPath);
    const transport = new ForgeTransport({
      directory: resolve(destination, 'preflight'),
      mode: 'native',
    });
    try {
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await save(
            resolve(destination, 'project.json'),
            await ensurePrivateProject(transport, { createIfMissing: false }),
          );
          break;
        } catch (error) {
          if (attempt === 5 || (error as { receipt?: { httpStatus?: number } }).receipt?.httpStatus)
            throw error;
        }
      }
    } finally {
      transport.close();
    }
    await tracing.init(PROJECT, {
      apiKey: key,
      serviceName: 'tab-to-pitch-arrangement-research',
      spanProcessor: capture.spanProcessor,
    });
    initialized = true;
    let discovery: Response | undefined;
    let catalog: { data?: { id: string }[] } = {};
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        discovery = await native.fetch('https://api.inference.wandb.ai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(20_000),
        });
        catalog = (await discovery.json()) as typeof catalog;
        campaign.discovery.push({
          attempt,
          at: new Date().toISOString(),
          status: discovery.status,
          models: catalog.data?.map((m) => m.id),
        });
        await checkpoint();
        if (discovery.ok && catalog.data?.length) break;
      } catch (error) {
        campaign.discovery.push({
          attempt,
          at: new Date().toISOString(),
          failure: error instanceof Error ? error.message : 'Read failed',
        });
        await checkpoint();
      }
    }
    if (!discovery?.ok || !catalog.data?.length)
      throw new Error('Model discovery unavailable after bounded reads');
    async function attempt(
      task: ArrangementCase,
      arm: string,
      trial: number,
      phase: 'qualification' | 'test',
    ) {
      let traceId: string | undefined;
      const tracer: TraceRunner = {
        close: async () => {},
        run: async (work) =>
          tracing.runIsolated(async () => {
            const conversation = tracing.startConversation({
              agentName: 'tab-to-pitch-arrangement',
              agentVersion: 'arrangement-v1',
              attributes: {
                'ttp.task_id': task.id,
                'ttp.context_id': task.contextId,
                'ttp.trial': trial,
                'ttp.phase': phase,
                'ttp.synthetic': true,
                'ttp.source_hash': sourceHash,
                'ttp.dataset_hash': datasetHash,
              },
            });
            traceId = conversation.conversationId;
            const turn = conversation.startTurn({ userMessage: task.request.request });
            let failed = false;
            try {
              return await work({
                id: traceId,
                model: async (model, execute, usage) => {
                  const span = turn.startLLM({ model, providerName: 'coreweave' });
                  try {
                    const result = await execute();
                    span.record({ usage: usage(result) });
                    span.output(JSON.stringify(result));
                    return result;
                  } catch (error) {
                    span.end({ error: new Error('Recorded model call failed') });
                    throw error;
                  } finally {
                    span.end();
                  }
                },
                tool: (name, execute) => {
                  const span = turn.startTool({ name });
                  try {
                    const result = execute();
                    span.end({ result: JSON.parse(JSON.stringify(result)) });
                    return result;
                  } catch (error) {
                    span.end({ error: new Error('Tool rejected output') });
                    throw error;
                  }
                },
              });
            } catch (error) {
              failed = true;
              throw error;
            } finally {
              turn.end(failed ? { error: new Error('Arrangement attempt failed') } : undefined);
              conversation.end(
                failed ? { error: new Error('Arrangement attempt failed') } : undefined,
              );
            }
          }),
      };
      const fetcher: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        if (request.method !== 'POST')
          return new Response(JSON.stringify(catalog), {
            status: discovery!.status,
            headers: { 'Content-Type': 'application/json' },
          });
        const body = await request.text(),
          value = JSON.parse(body),
          prices = pricing.perMillion[arm as keyof typeof pricing.perMillion];
        const reservedTokens = Buffer.byteLength(body) + value.max_tokens + 128,
          reservedDollars =
            ((Buffer.byteLength(body) + 128) * prices.input + value.max_tokens * prices.output) /
            1e6;
        const used = totals(campaign.requests);
        if (
          used.calls >= maxCalls ||
          used.tokens + reservedTokens > maxTokens ||
          used.dollars + reservedDollars > maxDollars
        )
          throw new Error('Campaign allowance exhausted');
        const receipt: Receipt = {
          sequence: campaign.requests.length + 1,
          taskId: task.id,
          arm,
          trial,
          phase,
          startedAt: new Date().toISOString(),
          reservedTokens,
          reservedDollars,
          status: 'started',
        };
        campaign.requests.push(receipt);
        await checkpoint();
        const start = performance.now();
        try {
          const response = await native.fetch(request.url, {
            method: 'POST',
            headers: request.headers,
            body,
            signal: request.signal,
          });
          const raw = (await response.json()) as {
            usage?: unknown;
            model?: string;
            id?: string;
            choices?: unknown;
          };
          receipt.status = 'responded';
          receipt.httpStatus = response.status;
          receipt.usage = validUsage(raw.usage);
          receipt.returnedModel = raw.model;
          receipt.responseId = raw.id;
          receipt.output = raw.choices;
          if (receipt.usage)
            receipt.costDollars =
              (receipt.usage.prompt_tokens * prices.input +
                receipt.usage.completion_tokens * prices.output) /
              1e6;
          return new Response(JSON.stringify(raw), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          receipt.status = 'failed';
          throw error;
        } finally {
          receipt.elapsedMs = performance.now() - start;
          await checkpoint();
        }
      };
      const agent = new ForgeArrangementAgent(
        {
          ...readConfig(),
          cloudEnabled: true,
          tracingEnabled: true,
          forgeApiKey: key,
          forgeProject: PROJECT,
          forgeModel: arm,
        },
        fetcher,
        tracer,
      );
      const start = performance.now();
      let output: ArrangementResponse | null = null,
        failure: string | undefined;
      try {
        output = (await agent.run(task.request, AbortSignal.timeout(30_000))).response;
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Unknown error';
      }
      const row: Row = {
        taskId: task.id,
        contextId: task.contextId,
        category: task.category,
        arm,
        trial,
        phase,
        output,
        scores: scoreArrangement(task, output),
        elapsedMs: performance.now() - start,
        providerSucceeded: !failure,
        failure,
        traceId,
      };
      campaign.rows.push(row);
      await capture.checkpoint();
      await checkpoint();
      console.info(
        JSON.stringify({
          task: task.id,
          arm,
          trial,
          phase,
          correct: row.scores.requestCorrect,
          providerSucceeded: row.providerSucceeded,
          ...totals(campaign.requests),
        }),
      );
      return row;
    }
    for (const arm of MODELS) {
      if (!catalog.data?.some((m) => m.id === arm)) {
        campaign.qualified[arm] = false;
        continue;
      }
      const rows = [];
      for (const task of developmentCases) rows.push(await attempt(task, arm, 0, 'qualification'));
      campaign.qualified[arm] =
        rows.every((r) => r.providerSucceeded && r.scores.requestCorrect) &&
        rows.some((r) => r.output?.status === 'proposal');
      await checkpoint();
    }
    campaign.status = 'running';
    await checkpoint();
    // Alternate model and trial order by context; no failed request is retried or replaced.
    for (let trial = 1; trial <= 2; trial++)
      for (const task of testCases) {
        const arms = Number(task.contextId.slice(-2)) % 2 ? [...MODELS].reverse() : MODELS;
        for (const arm of arms)
          if (campaign.qualified[arm]) await attempt(task, arm, trial, 'test');
      }
    campaign.status = 'complete';
  } catch (error) {
    campaign.status = 'stopped';
    campaign.failure = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  } finally {
    campaign.completedAt = new Date().toISOString();
    await capture.checkpoint();
    if (initialized) await tracing.shutdown();
    native.close();
    await checkpoint();
    await save(resolve(destination, 'summary.json'), summarize(campaign));
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
