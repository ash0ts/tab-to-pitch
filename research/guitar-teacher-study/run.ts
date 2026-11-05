import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { ForgeTeacherAgent, TEACHER_SYSTEM_PROMPT } from '../../server/teacher.js';
import { TeacherProvider } from '../../server/teacher-provider.js';
import {
  TEACHER_CRITIC_PROMPT,
  teacherReviewSchema,
  validateTeacherReview,
} from '../../server/teacher-review.js';
import { readConfig } from '../../server/config.js';
import {
  localTeacher,
  resolveTeacherAction,
  createTeacherToolRuntime,
} from '../../src/engine/teacher.js';
import { createInferencePool } from '../arrangement-agent/inference-pool.js';
import { createLensCapture } from '../coach-benchmark/lens-capture.js';
import { SharedInferenceBudget } from '../forge/shared-budget.js';
import {
  atomicJson,
  digest,
  validUsage,
  PRICES,
  type Model,
  reconcileHistoricalSpending,
} from '../teacher-agent/budget.js';
import { mapBounded } from '../teacher-agent/concurrency.js';
import { cases, PROTOCOL, EVIDENCE_FIRST, type StudyCase } from './cases.js';
import { criticCases } from './critic-cases.js';
import { score } from './scorer.js';
import { studyTrace } from './trace.js';

const split = process.argv[2] as 'development' | 'evaluation';
if (!['development', 'evaluation'].includes(split))
  throw new Error('Choose development or evaluation');
const directory = resolve(process.argv[3]!);
const campaignId = directory.split('/').at(-1)!;
const ledger = process.env.TTP_SHARED_INFERENCE_LEDGER;
if (!ledger || !process.env.WANDB_API_KEY)
  throw new Error('Canonical shared ledger and server credential required');
await mkdir(directory, { recursive: false });
const roots = JSON.parse(process.env.TTP_HISTORICAL_ROOTS ?? '[]') as string[];
const legacy = process.env.TTP_LEGACY_DEMO;
if (roots.length !== 4 || !legacy)
  throw new Error('Four historical source roots and legacy receipt required');
const prior: Awaited<ReturnType<typeof reconcileHistoricalSpending>> = {
  sources: [],
  calls: 0,
  dollars: 0,
  unknownUsage: 0,
};
for (const [index, root] of roots.entries()) {
  const old = await reconcileHistoricalSpending(root, legacy);
  for (const source of old.sources) {
    if (index && source.path.startsWith('legacy-')) continue;
    prior.sources.push({
      ...source,
      path: source.path.startsWith('legacy-') ? source.path : `source-${index}/${source.path}`,
    });
    prior.calls += source.calls;
    prior.dollars += source.dollars;
    prior.unknownUsage += source.unknownUsage;
  }
}
const budget = new SharedInferenceBudget(ledger);
budget.initialize(prior);
const tasks = cases(split, campaignId);
const fixtures = criticCases(split);
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((p) => /^(src|server|research)\/.+\.(ts|mjs|json)$/.test(p) || p === 'package-lock.json');
for (const name of await readdir('research/guitar-teacher-study'))
  if (/\.(ts|py|md)$/.test(name)) files.push(`research/guitar-teacher-study/${name}`);
for (const name of await readdir('research/guitar-teacher-study/data'))
  files.push(`research/guitar-teacher-study/data/${name}`);
const hashes: { path: string; sha256: string }[] = [];
for (const path of [...new Set(files)].sort()) {
  const bytes = await readFile(path);
  hashes.push({ path, sha256: digest(bytes) });
  await mkdir(dirname(join(directory, 'source', path)), { recursive: true });
  await writeFile(join(directory, 'source', path), bytes, { flag: 'wx' });
}
const frozen = {
  protocol: PROTOCOL,
  split,
  createdAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  hashes,
  cases: tasks,
  criticFixtures: fixtures,
  arms: ['local', 'current', 'evidence-first'],
  trials: split === 'development' ? 1 : 2,
  inference: {
    actor: 'openai/gpt-oss-20b',
    critic: 'openai/gpt-oss-20b',
    maxActor: 4,
    maxTools: 8,
    deadlineMs: 60000,
  },
  prompts: {
    current: TEACHER_SYSTEM_PROMPT,
    evidenceFirst: TEACHER_SYSTEM_PROMPT + '\n' + EVIDENCE_FIRST,
    critic: TEACHER_CRITIC_PROMPT,
  },
  priceSource: 'https://coreweave.com/forge-pricing/inference-agents',
  priceCheckedAt: '2026-11-05',
  prices: PRICES,
  sharedLedger: ledger,
};
await atomicJson(join(directory, 'manifest.json'), frozen);
const pool = await createInferencePool({ callerReserves: true });
const discovery = await pool.fetch('https://api.inference.wandb.ai/v1/models', {
  headers: { Authorization: `Bearer ${process.env.WANDB_API_KEY}` },
});
const models = await discovery.json();
await atomicJson(join(directory, 'discovery.json'), {
  status: discovery.status,
  models,
  probes: pool.probes,
});
if (!discovery.ok || !JSON.stringify(models).includes('openai/gpt-oss-20b'))
  throw new Error('Requested model unavailable');
const capture = createLensCapture(join(directory, 'lens-capture'));
await tracing.init('wandb/tab-to-pitch-public-data-research', {
  apiKey: process.env.WANDB_API_KEY,
  serviceName: PROTOCOL,
  spanProcessor: capture.spanProcessor,
});
const scope = new AsyncLocalStorage<string>();
const campaign: any = {
  protocol: PROTOCOL,
  split,
  project: 'wandb/tab-to-pitch-public-data-research',
  status: 'running',
  manifestSha256: digest(await readFile(join(directory, 'manifest.json'))),
  rows: [],
  criticRows: [],
  requests: [],
  plannedCheckpoints: tasks.length,
  plannedHostedTurns: tasks.length * 2 * frozen.trials,
};
let saving = Promise.resolve();
function save() {
  const snapshot = JSON.stringify(campaign);
  saving = saving.then(() => atomicJson(join(directory, 'campaign.json'), JSON.parse(snapshot)));
  return saving;
}
await save();
const fetcher: typeof fetch = async (input, init) => {
  // Model discovery is a GET, not a billable completion request.
  if (!init?.body) return pool.fetch(input, init);
  const body = String(init?.body),
    parsed = JSON.parse(body),
    identity = scope.getStore();
  if (!identity) throw new Error('Inference lacks occurrence identity');
  const model = parsed.model as Model,
    sequence = campaign.requests.length,
    id = `${campaignId}:${sequence}`;
  // Development and evaluation share one campaign reservation ceiling.
  const reservedDollars = budget.reserve(
    id,
    PROTOCOL,
    model,
    Buffer.byteLength(body),
    parsed.max_tokens,
  );
  const receipt: any = {
    id,
    identity,
    sequence,
    model,
    kind: parsed.tools?.[0]?.function?.name === 'review_teacher_reply' ? 'critic' : 'actor',
    requestHash: digest(body),
    reservedDollars,
    status: 'started',
    startedAt: new Date().toISOString(),
  };
  campaign.requests.push(receipt);
  await save();
  const before = performance.now();
  let usage: unknown;
  try {
    const response = await pool.fetch(input, init),
      raw = await response.text();
    await writeFile(join(directory, `response-${sequence}.json`), raw, { flag: 'wx', mode: 0o600 });
    const data = JSON.parse(raw);
    usage = data.usage;
    receipt.usage = validUsage(usage);
    receipt.responseId = data.id;
    receipt.httpStatus = response.status;
    receipt.returnedModel = data.model;
    receipt.status = response.ok ? 'completed' : 'failed';
    receipt.costDollars = receipt.usage
      ? (receipt.usage.prompt_tokens * PRICES[model].input +
          receipt.usage.completion_tokens * PRICES[model].output) /
        1e6
      : reservedDollars;
    return new Response(raw, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    receipt.status = 'failed';
    receipt.failure = error instanceof Error ? error.message : 'request-failed';
    throw error;
  } finally {
    receipt.elapsedMs = performance.now() - before;
    budget.settle(id, usage);
    await save();
  }
};
const config = {
  ...readConfig({}),
  forgeApiKey: process.env.WANDB_API_KEY,
  forgeProject: campaign.project,
  forgeModel: 'openai/gpt-oss-20b',
  teacherCriticModel: 'openai/gpt-oss-20b',
  cloudEnabled: true,
  teacherEnabled: true,
  teacherQualification: 'unqualified' as const,
  tracingEnabled: false,
};
function resolveOutput(task: StudyCase, output: any) {
  return output.actions.map((a: any) => resolveTeacherAction(task.request, a));
}
try {
  for (const task of tasks) {
    const before = JSON.stringify(task.request),
      start = performance.now(),
      output = localTeacher(task.request);
    const row: any = {
      id: `${task.id}:local`,
      taskId: task.id,
      recording: task.passage.recording,
      arm: 'local',
      trial: 0,
      request: task.request,
      output,
      resolved: resolveOutput(task, output),
      tools: [],
      calls: [],
      elapsedMs: performance.now() - start,
      sourceUnchanged: before === JSON.stringify(task.request),
      failure: null,
    };
    row.scores = score(task, row);
    campaign.rows.push(row);
  }
  // This ceiling measures whether the app can provide the requested artifact at all.
  campaign.engineCeiling = tasks.map((task) => {
    const action =
      task.kind === 'role'
        ? { type: 'highlight', spanIndex: task.passage.selected, degree: task.passage.tone.degree }
        : createTeacherToolRuntime(task.request).execute({
            name: 'explore_voicings',
            args: {
              intent: {
                action: 'propose',
                reason: 'requested',
                operation: 'move',
                constraints: task.request.context.constraints,
                targetQuality: null,
                substituteSymbol: null,
              },
            },
          }).actions[0];
    const row = {
      arm: 'engine-ceiling',
      sourceUnchanged: true,
      output: { actions: action ? [action] : [], claims: [] },
      resolved: action ? [resolveTeacherAction(task.request, action)] : [],
      tools: [],
    };
    return { taskId: task.id, action, scores: score(task, row) };
  });
  await save();
  const jobs = tasks
    .flatMap((task) =>
      Array.from({ length: frozen.trials }, (_, trial) =>
        (['current', 'evidence-first'] as const).map((arm) => ({ task, trial, arm })),
      ),
    )
    .flat();
  jobs.sort((a, b) =>
    digest(`${a.task.id}:${a.trial}:${a.arm}`).localeCompare(
      digest(`${b.task.id}:${b.trial}:${b.arm}`),
    ),
  );
  await mapBounded(jobs, 4, async ({ task, trial, arm }) => {
    const identity = `${campaignId}:${task.id}:${arm}:${trial}`,
      before = JSON.stringify(task.request),
      start = performance.now();
    let traceId: string | undefined;
    const agent = new ForgeTeacherAgent(
      config,
      fetcher,
      studyTrace(identity, arm, task.request.request, (id) => (traceId = id)),
      frozen.prompts[arm === 'current' ? 'current' : 'evidenceFirst'],
    );
    const result = await scope.run(identity, () =>
      agent.run(task.request, AbortSignal.timeout(61000)),
    );
    const row: any = {
      id: identity,
      taskId: task.id,
      recording: task.passage.recording,
      arm,
      trial,
      request: task.request,
      output: result.response,
      resolved: resolveOutput(task, result.response),
      calls: result.calls,
      tools: result.toolResults,
      review: result.review ?? null,
      failure: result.failure ?? null,
      traceId,
      elapsedMs: performance.now() - start,
      sourceUnchanged: before === JSON.stringify(task.request),
    };
    row.scores = score(task, row);
    campaign.rows.push(row);
    await save();
    await capture.checkpoint();
    console.info(
      JSON.stringify({
        completed: campaign.rows.length - tasks.length,
        total: jobs.length,
        arm,
        kind: task.kind,
        source: row.output.source,
        delivered: row.scores.requestedActionDelivered,
        failure: row.failure,
      }),
    );
  });
  await mapBounded(fixtures, 4, async (fixture) => {
    const identity = `${campaignId}:critic:${fixture.id}`,
      start = performance.now();
    let traceId: string | undefined;
    const trace = studyTrace(
      identity,
      'critic-diagnostic',
      fixture.request.request,
      (id) => (traceId = id),
    );
    const row: any = {
      id: identity,
      fixtureId: fixture.id,
      kind: fixture.kind,
      expectedApproved: fixture.approved,
      prose: fixture.prose,
      output: null,
      failure: null,
    };
    await trace.run(async (t) => {
      const provider = new TeacherProvider(
        config,
        fetcher,
        t,
        AbortSignal.timeout(60000),
        fixture.request.context,
      );
      try {
        const raw = await scope.run(identity, () =>
          provider.complete(
            'critic',
            [
              { role: 'system', content: TEACHER_CRITIC_PROMPT },
              {
                role: 'user',
                content: JSON.stringify({
                  learnerRequest: fixture.request.request,
                  context: fixture.request.context,
                  proposedReply: { message: fixture.prose, actions: [], claims: [], factRefs: [] },
                  verifiedFacts: fixture.facts,
                  toolResults: [],
                }),
              },
            ],
            teacherReviewSchema,
          ),
        );
        row.output = validateTeacherReview(
          raw.args,
          fixture.prose,
          fixture.facts.map((f) => f.id),
        );
      } catch (error) {
        row.failure = error instanceof Error ? error.message : 'critic-unavailable';
        t.fail?.('unavailable');
      }
      row.calls = provider.calls;
    });
    row.elapsedMs = performance.now() - start;
    row.traceId = traceId;
    row.correct = row.output !== null && row.output.approved === fixture.approved;
    campaign.criticRows.push(row);
    await save();
    await capture.checkpoint();
    console.info(
      JSON.stringify({
        criticCompleted: campaign.criticRows.length,
        total: fixtures.length,
        correct: row.correct,
        failure: row.failure,
      }),
    );
  });
  for (const f of hashes)
    if (digest(await readFile(f.path)) !== f.sha256) throw new Error(`Source drift: ${f.path}`);
  campaign.status = 'execution-complete';
} catch (error) {
  campaign.status = 'stopped';
  campaign.failure = error instanceof Error ? error.message : 'execution-failure';
  throw error;
} finally {
  await tracing.shutdown();
  await capture.checkpoint();
  pool.close();
  campaign.completedAt = new Date().toISOString();
  await save();
  await atomicJson(join(directory, 'budget-readback.json'), budget.read());
  budget.close();
}
