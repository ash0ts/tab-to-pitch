import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { createListeningExercise, gradeListening } from '../../src/songs/listening.js';
import { curatedHarmony } from '../../src/songs/catalog.js';
import { TeacherProvider } from '../../server/teacher-provider.js';
import {
  JUDGE_PROMPT,
  judgeSchema,
  validateJudgment,
  claimFixtures,
  dialogueFixtures,
  judgeQualification,
  scoreClaimFixture,
  scoreDialogueFixture,
  type JudgeResult,
} from '../teacher-agent/judge.js';
import { createTeacherToolRuntime } from '../../src/engine/teacher.js';
import { ForgeTeacherAgent } from '../../server/teacher.js';
import { readConfig } from '../../server/config.js';
import { localTeacher } from '../../src/engine/teacher.js';
import type { TeacherRequest, TeacherTurn } from '../../src/shared/teacher.js';
import {
  developmentCases,
  checkpointCases,
  boundaryCases,
  episodes,
  requestFor,
  type ListeningCase,
} from './cases.js';
import { scoreListening } from './contract.js';
import { mapBounded } from '../teacher-agent/concurrency.js';
import { stableUuid } from '../teacher-agent/adapter.js';
import { researchTrace } from '../teacher-agent/trace.js';
import { createLensCapture } from '../coach-benchmark/lens-capture.js';
import { createInferencePool } from '../arrangement-agent/inference-pool.js';
import {
  atomicJson,
  json,
  digest,
  reconcileHistoricalSpending,
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
const dir = resolve(arg('--dir') ?? join(root, '../tabtopitch-real-data/listening-agent-003'));
const project = 'wandb/tab-to-pitch-public-data-research';
const frozen = {
  developmentCases,
  checkpointCases,
  boundaryCases,
  episodes,
  claimFixtures,
  dialogueFixtures,
};
interface Judgment {
  id: string;
  model: Model;
  phase: string;
  result: JudgeResult | null;
  failure?: string;
  traceId?: string;
  qualified?: boolean;
  scores?: unknown;
}

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
  scores: ReturnType<typeof scoreListening>;
  tools: unknown[];
  calls: unknown[];
  review: unknown;
  judges: Judgment[];
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
  judgeRows: Judgment[];
  qualifiedJudges: Record<string, boolean>;
  calibrationReuse?: { campaign: string; sha256: string; qualified: Record<string, boolean> };
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
    'research/listening-agent',
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
function localRow(c: ListeningCase, request = requestFor(c, `local:${c.id}`), turn = 0): Row {
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
    scores: scoreListening(request, output, before === json(request)),
    tools: [],
    calls: [],
    review: null,
    judges: [],
    elapsedMs: performance.now() - start,
  };
}
function followup(
  request: TeacherRequest,
  output: TeacherTurn,
  text: string,
  turn: number,
): TeacherRequest {
  const context = structuredClone(request.context),
    listening = context.listening;
  if (listening) {
    if (output.actions.some((a) => a.type === 'listening' && a.operation === 'question'))
      listening.activeQuestion = {
        id: `episode-question:${request.lessonId}:${turn}`,
        assisted: false,
      };
    // The scripted learner asks for help before turn 3, then submits through the deterministic grader before turn 4.
    if (turn === 3 && listening.activeQuestion) listening.activeQuestion.assisted = true;
    if (turn === 4 && listening.activeQuestion) {
      const passage = curatedHarmony.getPassage(listening.passageId)!;
      const exercise = createListeningExercise(passage, 'recall', listening.source);
      const grade = gradeListening(
        exercise,
        passage.chords.map((c) => c.symbol),
      );
      listening.evidence.push({
        id: `episode-answer:${turn}`,
        outcome: 'answered',
        assisted: listening.activeQuestion.assisted,
        source: listening.source,
        familiar: false,
        root: grade.root,
        quality: grade.quality,
        sequence: grade.sequence,
      });
      listening.activeQuestion = null;
    }
  }
  return {
    ...request,
    requestId: stableUuid(`${request.lessonId}:${turn}:request`),
    turnId: stableUuid(`${request.lessonId}:${turn}:turn`),
    contextVersion: `${request.contextVersion}:t${turn}`,
    request: text,
    context: {
      ...context,
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
        conversationalQuality: rows.some((r) => r.judges.length)
          ? {
              judged: rows.filter((r) => r.judges.some((j) => j.result)).length,
              acceptable: rows.filter((r) =>
                r.judges.some((j) => j.qualified && j.result?.overall === 'acceptable'),
              ).length,
            }
          : 'unavailable: no qualified independent judge',
        medianLatencyMs: rows.map((r) => r.elapsedMs).sort((a, b) => a - b)[
          Math.floor(rows.length / 2)
        ],
      };
    }),
    qualification: c.qualification,
    calibrationReuse: c.calibrationReuse,
    judgeCalibration: Object.entries(c.qualifiedJudges).map(([model, qualified]) => ({
      model,
      releaseQualified: qualified,
      observed: c.judgeRows.filter((r) => r.model === model).length,
      ...judgeQualification(
        claimFixtures.map((fixture) => ({
          fixture,
          result: c.judgeRows.find((r) => r.id === fixture.id && r.model === model)?.result ?? null,
        })),
      ),
    })),
    productionPromotion: Object.values(c.qualification).some(Boolean),
    limitation:
      'Authored synthetic conversations and structural checks do not measure learner outcomes or establish teaching quality.',
  };
}
async function prepare() {
  const sources = await sourceHashes(),
    sourceHash = digest(json(sources)),
    datasetHash = digest(json(frozen));
  const prior = await reconcileHistoricalSpending(
    resolve(root, '../tabtopitch-real-data'),
    resolve(root, '../tabtopitch-forge-demo/live-coach.json'),
  );
  const budget = createBudgetLedger(prior);
  const priorListening = prior.sources
    .filter((s) => s.path.startsWith('listening-'))
    .reduce((n, s) => n + s.dollars, 0);
  budget.campaignCeilingDollars = Math.min(budget.campaignCeilingDollars, 15 - priorListening);
  if (budget.campaignCeilingDollars <= 0) throw new Error('Listening program allowance exhausted');
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
    judgeRows: [],
    qualifiedJudges: {},
    requests: budget.requests,
    budget,
    qualification: {},
  };
  const calibrationPath = arg('--reuse-calibration');
  if (calibrationPath) {
    const bytes = await readFile(resolve(calibrationPath));
    const previous = JSON.parse(bytes.toString());
    if (previous.status !== 'execution-complete') throw new Error('Calibration is unfinished');
    campaign.calibrationReuse = {
      campaign: resolve(calibrationPath),
      sha256: digest(bytes),
      qualified: previous.qualifiedJudges,
    };
    campaign.qualifiedJudges = previous.qualifiedJudges;
    await writeFile(join(dir, 'calibration-reuse.json'), bytes, { flag: 'wx' });
  }
  await atomicJson(join(dir, 'manifest.json'), {
    version: 'listening-agent-v1',
    project,
    sourceHash,
    sourceHashes: sources,
    datasetHash,
    createdAt: new Date().toISOString(),
    pricingSource: 'https://coreweave.com/forge-pricing/inference-agents',
    pricingCheckedAt: '2026-11-04',
    privacy: 'original-authored-fixtures-only',
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
  let writes = Promise.resolve();
  const save = () => {
    writes = writes.then(() => atomicJson(join(dir, 'campaign.json'), c));
    return writes;
  };
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
      serviceName: 'tabtopitch-listening-evaluation',
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
        task: ListeningCase,
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
          scores: scoreListening(
            request,
            result.response,
            before === json(request),
            result.calls.length,
            result.toolResults.length,
          ),
          tools: result.toolResults,
          calls: result.calls,
          review: result.review ?? null,
          judges: [],
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
      if (
        (model === 'openai/gpt-oss-120b' ? complete !== 2 : complete === 0) ||
        process.argv.includes('--smoke')
      )
        continue;
      for (let trial = 0; trial < 2; trial++) {
        await mapBounded([...checkpointCases, ...boundaryCases], 4, (task) => execute(task, trial));
        await mapBounded(episodes, 4, async (episode) => {
          let request = requestFor(episode, `${dir}:${model}:${trial}:${episode.id}`);
          for (let t = 0; t < 6; t++) {
            const row = await execute(episode, trial, request, t, 'episode');
            if (t < 5) request = followup(request, row.output, episode.followups[t]!, t + 1);
          }
        });
      }
    }

    const judge = async (
      payload: unknown,
      id: string,
      model: Model,
      phase: string,
    ): Promise<Judgment> => {
      let traceId: string | undefined,
        result: JudgeResult | null = null,
        failure: string | undefined;
      const tracer = researchTrace(
        {
          campaign: dir.split('/').at(-1)!,
          task: id,
          arm: `judge-${model}`,
          trial: 0,
          lesson: id,
          turn: 0,
        },
        (value) => (traceId = value),
      );
      const fetcher: typeof fetch = async (input, init) => {
        const body = String(init?.body),
          parsed = JSON.parse(body);
        const receipt = reserve(c.budget, {
          identity: `${model}:${id}`,
          kind: 'judge-calibration',
          model,
          body,
          maxOutputTokens: parsed.max_tokens,
          maxInputBytes: 32768,
        });
        await save();
        const started = performance.now();
        try {
          const response = await pool!.fetch(input, init),
            raw = await response.text();
          await writeFile(join(dir, `response-${receipt.sequence}.json`), raw, {
            flag: 'wx',
            mode: 0o600,
          });
          settle(receipt, JSON.parse(raw), response.status);
          await save();
          return new Response(raw, {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          receipt.status = 'failed';
          receipt.failure = error instanceof Error ? error.message : 'judge-request-failed';
          throw error;
        } finally {
          receipt.elapsedMs = performance.now() - started;
          await save();
        }
      };
      try {
        result = await tracer.run(async (span) => {
          const provider = new TeacherProvider(
            {
              ...readConfig(),
              forgeApiKey: key,
              forgeModel: model,
              teacherCriticModel: model,
              forgeProject: project,
            },
            fetcher,
            span,
            AbortSignal.timeout(60000),
          );
          const decoded = await provider.complete(
            'critic',
            [
              { role: 'system', content: JUDGE_PROMPT },
              { role: 'user', content: json(payload) },
            ],
            judgeSchema,
          );
          return span.tool('validate_independent_judgment', () =>
            validateJudgment(decoded.args, payload),
          );
        });
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Judge failed';
      }
      console.info(json({ judge: model, id, completed: !!result, failure }));
      return { id, model, phase, result, failure, traceId };
    };
    for (const model of (c.calibrationReuse
      ? []
      : ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']) as Model[]) {
      if (!catalog.data.some((m) => m.id === model)) {
        c.qualifiedJudges[model] = false;
        continue;
      }
      for (const fixture of claimFixtures) {
        if (
          c.judgeRows.filter((r) => r.model === model).length === 2 &&
          c.judgeRows.filter((r) => r.model === model).every((r) => !r.result)
        )
          break;
        const row = await judge(
          { question: fixture.question, response: fixture.response, facts: fixture.facts },
          fixture.id,
          model,
          fixture.split,
        );
        row.scores = scoreClaimFixture(fixture, row.result);
        c.judgeRows.push(row);
        await save();
      }
      const qualification = judgeQualification(
        claimFixtures.map((fixture) => ({
          fixture,
          result: c.judgeRows.find((r) => r.id === fixture.id && r.model === model)?.result ?? null,
        })),
      );
      if (qualification.qualified)
        for (const fixture of dialogueFixtures) {
          const row = await judge(
            { question: fixture.question, response: fixture.response, facts: fixture.facts },
            fixture.id,
            model,
            'dialogue',
          );
          row.scores = scoreDialogueFixture(fixture, row.result);
          c.judgeRows.push(row);
          await save();
        }
      const dialogues = dialogueFixtures.map((f) => ({
        fixture: f,
        score: scoreDialogueFixture(
          f,
          c.judgeRows.find((r) => r.id === f.id && r.model === model)?.result ?? null,
        ),
      }));
      c.qualifiedJudges[model] =
        qualification.qualified &&
        dialogues.filter((r) => r.score.correct).length >= 22 &&
        dialogues
          .filter((r) => r.fixture.expectedProblem === 'instruction-takeover')
          .every((r) => r.score.correct);
      await save();
    }
    for (const row of c.rows) {
      const models = (['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as Model[]).filter(
        (m) => c.qualifiedJudges[m],
      );
      const model = models.find((m) => m !== row.arm) ?? models[0];
      if (!model) continue;
      const judgment = await judge(
        {
          question: row.request.request,
          history: row.request.context.history,
          response: row.output.message,
          facts: createTeacherToolRuntime(row.request).facts,
          tools: row.tools,
          actions: row.output.actions,
        },
        row.id,
        model,
        'output-review',
      );
      judgment.qualified = true;
      row.judges.push(judgment);
      await save();
    }
    for (const model of ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']) {
      const ordinary = c.rows.filter((r) => r.arm === model && r.suite === 'checkpoint'),
        ep = c.rows.filter((r) => r.arm === model && r.suite === 'episode');
      const acceptable = (r: Row) =>
        r.scores.providerSuccess &&
        r.scores.musicalActionsValid &&
        r.judges.some((j) => j.qualified && j.result?.overall === 'acceptable');
      const critical = c.rows.some(
        (r) =>
          r.arm === model &&
          r.scores.providerSuccess &&
          (!r.scores.musicalActionsValid ||
            r.judges.some((j) =>
              j.result?.claims.some((x) => x.critical && x.verdict !== 'supported'),
            )),
      );
      c.qualification[model] =
        !critical &&
        ordinary.length === 96 &&
        ordinary.filter(acceptable).length / 96 >= 0.9 &&
        ep.length === 144 &&
        ep.filter(acceptable).length / 144 >= 0.9;
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
