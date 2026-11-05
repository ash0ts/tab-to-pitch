import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { ForgeTeacherAgent } from '../../server/teacher.js';
import { readConfig } from '../../server/config.js';
import { localTeacher } from '../../src/engine/teacher.js';
import type { TeacherRequest, TeacherTurn } from '../../src/shared/teacher.js';
import { cases, requestFor, type EarCase } from './cases.js';
import { scoreEar } from './contract.js';
import { stableUuid } from '../teacher-agent/adapter.js';
import { researchTrace } from '../teacher-agent/trace.js';
import { createLensCapture } from '../coach-benchmark/lens-capture.js';
import { createInferencePool } from '../arrangement-agent/inference-pool.js';
import { earHistoricalSpending } from './budget.js';
import {
  atomicJson,
  json,
  digest,
  createBudgetLedger,
  reserve,
  settle,
  accountedDollars,
  type BudgetLedger,
  type Model,
} from '../teacher-agent/budget.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const dir = resolve(arg('--dir') ?? join(root, '../tabtopitch-real-data/ear-lab-v1-teacher-001'));
const project = 'wandb/tab-to-pitch-public-data-research';
const audioDir = resolve(arg('--audio-dir') ?? join(root, '.local/research/ear-lab-v1-audio-003'));
const audioManifest = JSON.parse(await readFile(join(audioDir, 'manifest.json'), 'utf8'));
const rows = await Promise.all(
  (await readdir(join(audioDir, 'rows')).catch(() => []))
    .filter((p) => p.endsWith('.json'))
    .map(async (p) => JSON.parse(await readFile(join(audioDir, 'rows', p), 'utf8'))),
);
const inputs = audioManifest.fixtures
  .filter((f: { split: string }) => f.split !== 'regression')
  .map((f: { id: string; notes: unknown[] }) => ({
    id: f.id,
    reference: f.notes,
    actual: rows.find((r) => r.id === f.id)?.conditions.reconciled?.notes ?? [],
  }));
const smoke = JSON.parse(await readFile(join(root, '.local/research/model-smoke-4.json'), 'utf8'));
const original = {
  id: 'original-study-development',
  reference: [
    { midi: 65, start: 0, end: 4 },
    { midi: 64, start: 4, end: 8 },
  ],
  actual: smoke.result.notes,
};
const frozen = cases(process.argv.includes('--qualify') ? [] : inputs, original);
if (!process.argv.includes('--qualify') && rows.length < audioManifest.fixtures.length)
  throw new Error(
    'Audio conditions are incomplete; finish or explicitly retain exclusions before freezing the teacher suite.',
  );
const {
  development: developmentCases,
  checkpoints: checkpointCases,
  boundaries: boundaryCases,
  episodes,
} = frozen;
interface Row {
  id: string;
  taskId: string;
  contextId: string;
  suite: string;
  arm: string;
  trial: number;
  turn: number;
  request: TeacherRequest;
  output: TeacherTurn;
  scores: ReturnType<typeof scoreEar>;
  tools: unknown[];
  calls: unknown[];
  review: unknown;
  traceId?: string;
  failure?: string;
  elapsedMs: number;
}
interface Campaign {
  schemaVersion: 1;
  project: string;
  sourceHash: string;
  datasetHash: string;
  status: string;
  rows: Row[];
  requests: BudgetLedger['requests'];
  budget: BudgetLedger;
  discovery?: unknown;
  failure?: string;
  qualification: Record<string, boolean>;
}
async function sourceHashes() {
  const files: string[] = ['package-lock.json'];
  async function visit(area: string) {
    for (const e of await readdir(join(root, area), { withFileTypes: true })) {
      const path = join(area, e.name);
      if (e.isDirectory()) await visit(path);
      else if (/\.(ts|mjs|json)$/.test(path) && !path.endsWith('.test.ts')) files.push(path);
    }
  }
  for (const area of [
    'src',
    'server',
    'research/ear-lab',
    'research/teacher-agent',
    'research/forge',
    'research/arrangement-agent',
    'research/coach-benchmark',
  ])
    await visit(area);
  return Promise.all(
    files.sort().map(async (path) => ({ path, sha256: digest(await readFile(join(root, path))) })),
  );
}
function localRow(c: EarCase, request = requestFor(c, `local:${c.id}`), turn = 0): Row {
  const before = json(request),
    start = performance.now(),
    output = localTeacher(request);
  return {
    id: `authored:${c.id}:${turn}`,
    taskId: c.id,
    contextId: c.contextId,
    suite: c.suite,
    arm: 'authored-local',
    trial: 0,
    turn,
    request,
    output,
    scores: scoreEar(request, output, before === json(request)),
    tools: [],
    calls: [],
    review: null,
    elapsedMs: performance.now() - start,
  };
}
function followup(
  request: TeacherRequest,
  output: TeacherTurn,
  text: string,
  turn: number,
): TeacherRequest {
  return {
    ...request,
    requestId: stableUuid(`${request.lessonId}:${turn}:request`),
    turnId: stableUuid(`${request.lessonId}:${turn}:turn`),
    contextVersion: `${request.contextVersion}:t${turn}`,
    request: text,
    context: {
      ...request.context,
      history: [
        ...request.context.history,
        { role: 'user' as const, text: request.request },
        { role: 'assistant' as const, text: output.message.slice(0, 2000) },
      ].slice(-8),
    },
  };
}
function summary(c: Campaign) {
  return {
    status: c.status,
    project,
    rows: c.rows.length,
    requests: c.requests.length,
    campaignDollars: accountedDollars(c.requests),
    historicalDollars: c.budget.prior.dollars,
    cumulativeDollars: c.budget.prior.dollars + accountedDollars(c.requests),
    arms: [...new Set(c.rows.map((r) => r.arm))].map((arm) => {
      const rows = c.rows.filter((r) => r.arm === arm);
      return {
        arm,
        turns: rows.length,
        contexts: new Set(rows.map((r) => r.contextId)).size,
        providerSuccess: rows.filter((r) => r.scores.providerSuccess).length,
        fallbacks: rows.filter((r) => r.scores.fallback).length,
        invalidActions: rows.filter((r) => !r.scores.musicalActionsValid).length,
        conversationalQuality: 'unavailable: no qualified independent judge',
        medianLatencyMs: rows.map((r) => r.elapsedMs).sort((a, b) => a - b)[
          Math.floor(rows.length / 2)
        ],
      };
    }),
    qualification: c.qualification,
    productionPromotion: false,
    limitation:
      'Authored synthetic conversations and structural checks do not measure learner outcomes or establish teaching quality.',
  };
}
async function prepare() {
  const sources = await sourceHashes(),
    sourceHash = digest(json(sources)),
    datasetHash = digest(json(frozen));
  const prior = await earHistoricalSpending(
    [
      resolve(
        arg('--history-root') ??
          '/Users/ashah/conductor/workspaces/core/lima/.context/tabtopitch-real-data',
      ),
      join(root, '.local/research'),
    ],
    resolve(
      '/Users/ashah/conductor/workspaces/core/lima/.context/tabtopitch-forge-demo/live-coach.json',
    ),
  );
  const budget = createBudgetLedger(prior);
  await mkdir(dirname(dir), { recursive: true });
  await mkdir(dir, { recursive: false });
  for (const s of sources) {
    const target = join(dir, 'source', s.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(join(root, s.path)), { flag: 'wx' });
  }
  const rows = [...developmentCases, ...checkpointCases, ...boundaryCases].map((c) => localRow(c));
  for (const episode of episodes) {
    let request = requestFor(episode, `local:${episode.id}`);
    for (let t = 0; t < 6; t++) {
      const row = localRow(episode, request, t);
      row.suite = 'episode';
      rows.push(row);
      if (t < 5) request = followup(request, row.output, episode.followups[t]!, t + 1);
    }
  }
  const campaign: Campaign = {
    schemaVersion: 1,
    project,
    sourceHash,
    datasetHash,
    status: 'prepared',
    rows,
    requests: budget.requests,
    budget,
    qualification: {},
  };
  await atomicJson(join(dir, 'manifest.json'), {
    version: process.argv.includes('--qualify') ? 'ear-lab-v1-qualification' : 'ear-lab-v1-teacher',
    project,
    sourceHash,
    sourceHashes: sources,
    datasetHash,
    createdAt: new Date().toISOString(),
    pricingSource: 'https://coreweave.com/forge-pricing/inference-agents',
    pricingCheckedAt: '2026-11-04',
    privacy: 'authored-requests-and-derived-public-dataset-symbolic-evidence-only',
    models: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
    trials: 2,
  });
  await atomicJson(join(dir, 'cases.json'), frozen);
  await atomicJson(join(dir, 'campaign.json'), campaign);
  await atomicJson(join(dir, 'summary.json'), summary(campaign));
  console.info(json(summary(campaign)));
}
async function run() {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  if (
    manifest.sourceHash !== digest(json(await sourceHashes())) ||
    manifest.datasetHash !== digest(json(frozen))
  )
    throw new Error('Sources or fixtures changed. Prepare a new campaign.');
  const c = JSON.parse(await readFile(join(dir, 'campaign.json'), 'utf8')) as Campaign;
  if (c.status !== 'prepared')
    throw new Error('This campaign already executed. Do not overwrite or automatically retry.');
  const key = process.env.WANDB_API_KEY;
  if (!key) throw new Error('Missing inference credential');
  c.budget.requests = c.requests;
  const save = () => atomicJson(join(dir, 'campaign.json'), c);
  let pool: Awaited<ReturnType<typeof createInferencePool>> | undefined;
  let initialized = false;
  try {
    const path = '../forge/transport.mjs',
      projectPath = '../forge/project.mjs';
    const { ForgeTransport } = await import(path),
      { ensurePrivateProject } = await import(projectPath);
    const transport = new ForgeTransport({
      directory: join(dir, 'preflight'),
      mode: process.env.FORGE_TRANSPORT ?? 'curl',
      deadlineMs: 20000,
    });
    try {
      await atomicJson(
        join(dir, 'project.json'),
        await ensurePrivateProject(transport, { createIfMissing: false }),
      );
    } finally {
      transport.close();
    }
    pool = await createInferencePool();
    const capture = createLensCapture(join(dir, 'lens-capture'));
    await tracing.init(project, {
      apiKey: key,
      serviceName: 'tabtopitch-ear-evaluation',
      spanProcessor: capture.spanProcessor,
    });
    initialized = true;
    const discovery = await pool.fetch('https://api.inference.wandb.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    const catalog = (await discovery.json()) as { data?: { id: string }[] };
    c.discovery = { status: discovery.status, models: catalog.data?.map((m) => m.id) };
    await save();
    if (!discovery.ok || !catalog.data?.length) throw new Error('Model discovery failed');
    c.status = 'running';
    await save();
    for (const model of ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'] as Model[]) {
      if (!catalog.data.some((m) => m.id === model)) {
        c.qualification[model] = false;
        continue;
      }
      let complete = 0;
      const execute = async (
        task: EarCase,
        trial: number,
        request = requestFor(task, `${dir}:${model}:${trial}:${task.id}`),
        turn = 0,
        suite: string = task.suite,
      ) => {
        const id = `${model}:${trial}:${task.id}:${turn}`,
          before = json(request),
          started = performance.now();
        let traceId: string | undefined;
        const fetcher: typeof fetch = async (input, init) => {
          if (String(input).endsWith('/models')) return Response.json(catalog);
          const body = String(init?.body),
            parsed = JSON.parse(body) as {
              model: Model;
              max_tokens: number;
              tools: { function: { name: string } }[];
            };
          const receipt = reserve(c.budget, {
            identity: id,
            kind:
              parsed.tools[0]?.function.name === 'review_teacher_reply'
                ? 'runtime-critic'
                : 'actor',
            model: parsed.model,
            body,
            maxOutputTokens: parsed.max_tokens,
            maxInputBytes: 32768,
          });
          await save();
          const begin = performance.now();
          try {
            const response = await pool!.fetch(input, init),
              raw = await response.text();
            await writeFile(join(dir, `response-${receipt.sequence}.json`), raw, {
              flag: 'wx',
              mode: 0o600,
            });
            settle(receipt, JSON.parse(raw), response.status);
            receipt.elapsedMs = performance.now() - begin;
            await save();
            return new Response(raw, {
              status: response.status,
              headers: { 'Content-Type': 'application/json' },
            });
          } catch (error) {
            receipt.status = 'failed';
            receipt.failure = error instanceof Error ? error.name : 'request-failed';
            receipt.elapsedMs = performance.now() - begin;
            await save();
            throw error;
          }
        };
        const config = {
          ...readConfig(),
          forgeApiKey: key,
          forgeProject: project,
          forgeModel: model,
          teacherCriticModel: model,
          teacherEnabled: true,
          teacherQualification: 'unqualified' as const,
        };
        const agent = new ForgeTeacherAgent(
          config,
          fetcher,
          researchTrace(
            {
              campaign: dir.split('/').at(-1)!,
              task: task.id,
              arm: model,
              trial,
              lesson: request.lessonId,
              turn,
            },
            (id) => (traceId = id),
          ),
        );
        const result = await agent.run(request, new AbortController().signal);
        const row: Row = {
          id,
          taskId: task.id,
          contextId: task.contextId,
          suite,
          arm: model,
          trial,
          turn,
          request,
          output: result.response,
          scores: scoreEar(
            request,
            result.response,
            before === json(request),
            result.calls.length,
            result.toolResults.length,
          ),
          tools: result.toolResults,
          calls: result.calls,
          review: result.review ?? null,
          traceId,
          failure: result.failure,
          elapsedMs: performance.now() - started,
        };
        c.rows.push(row);
        await save();
        console.info(
          json({ id, source: row.output.source, failure: row.failure, elapsedMs: row.elapsedMs }),
        );
        return row;
      };
      for (let trial = 0; trial < 2; trial++) {
        const row = await execute(developmentCases[trial]!, trial, undefined, 0, 'qualification');
        if (row.scores.providerSuccess && row.scores.musicalActionsValid) complete++;
      }
      c.qualification[model] = false; // A transport smoke is not release qualification.
      if (complete !== 2 || process.argv.includes('--smoke') || process.argv.includes('--qualify'))
        continue;
      for (let trial = 0; trial < 2; trial++) {
        for (const task of [...checkpointCases, ...boundaryCases]) await execute(task, trial);
        for (const episode of episodes) {
          let request = requestFor(episode, `${dir}:${model}:${trial}:${episode.id}`);
          for (let t = 0; t < 6; t++) {
            const row = await execute(episode, trial, request, t, 'episode');
            if (t < 5) request = followup(request, row.output, episode.followups[t]!, t + 1);
          }
        }
      }
    }
    c.status = 'execution-complete';
  } catch (error) {
    c.status = 'failed';
    c.failure = error instanceof Error ? error.message : 'Campaign failed';
  } finally {
    if (initialized) await tracing.shutdown();
    pool?.close();
    await save();
    await atomicJson(join(dir, 'summary.json'), summary(c));
    console.info(json(summary(c)));
  }
}
if (process.argv.includes('--prepare')) await prepare();
else if (process.argv.includes('--run')) await run();
else {
  const c = JSON.parse(await readFile(join(dir, 'campaign.json'), 'utf8'));
  console.info(json(summary(c)));
}
