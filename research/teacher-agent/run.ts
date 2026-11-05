import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { ForgeTeacherAgent } from '../../server/teacher.js';
import { readConfig } from '../../server/config.js';
import { parseTeacherJson } from '../../server/teacher-transport.js';
import { createTeacherToolRuntime, localTeacher } from '../../src/engine/teacher.js';
import type { TeacherRequest } from '../../src/shared/teacher.js';
import { createInferencePool } from '../arrangement-agent/inference-pool.js';
import { createLensCapture } from '../coach-benchmark/lens-capture.js';
import {
  fixedCases,
  boundaryCases,
  developmentCases,
  episodes,
  scriptedFollowup,
  type TeacherCase,
} from './cases.js';
import { teacherRequest, episodeRequest, continueEpisode, stableUuid } from './adapter.js';
import {
  JUDGE_PROMPT,
  JUDGE_AUDIT_PROMPT,
  judgeSchema,
  claimFixtures,
  dialogueFixtures,
  judgeQualification,
  scoreClaimFixture,
  scoreDialogueFixture,
  validateJudgment,
  type JudgeResult,
} from './judge.js';
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
  type CallReceipt,
  type Model,
} from './budget.js';
import { scoreStructural, summarizeRows, type TeacherRow } from './contract.js';
import { researchTrace } from './trace.js';
import { mapBounded } from './concurrency.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PROJECT = 'wandb/tab-to-pitch-public-data-research';
const MODELS: Model[] = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
const argument = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const directory = resolve(
  argument('--dir') ?? join(root, '../tabtopitch-real-data/teacher-agent-v1'),
);
const campaignId = directory.split('/').at(-1)!;
const frozen = {
  fixedCases,
  boundaryCases,
  developmentCases,
  episodes,
  claimFixtures,
  dialogueFixtures,
};
interface JudgeRow {
  id: string;
  model: Model;
  phase: 'development' | 'holdout' | 'dialogue';
  result: JudgeResult | null;
  scores?: unknown;
  failure?: string;
  traceId?: string;
}
interface Campaign {
  schemaVersion: 1;
  project: string;
  sourceHash: string;
  datasetHash: string;
  createdAt: string;
  status: string;
  rows: TeacherRow[];
  judgeRows: JudgeRow[];
  qualified: Record<string, boolean>;
  qualifiedJudges: Record<string, boolean>;
  discovery: unknown[];
  requests: CallReceipt[];
  budget: BudgetLedger;
  completedAt?: string;
  failure?: string;
  qualificationDisposition?: unknown;
}
async function sourceFiles(): Promise<string[]> {
  const paths = [
    'package-lock.json',
    'server/config.ts',
    'server/tracing.ts',
    'server/forge-agent.ts',
    'src/shared/arrangements.ts',
    'src/shared/teacher.ts',
    'src/engine/harmony.ts',
    'src/engine/harmony-exercises.ts',
    'src/engine/teacher.ts',
    'src/engine/teacher-references.ts',
    'src/engine/theory.ts',
    'src/engine/exploration.ts',
    'src/engine/voicing-ranker.ts',
    'public/research/voicing-ranker-v1.json',
    'src/research-data/voicing-ranker-v1.json',
    'research/arrangement-agent/inference-pool.ts',
    'research/coach-benchmark/lens-capture.ts',
  ];
  for (const area of ['src/engine', 'src/shared'])
    for (const name of await readdir(join(root, area)))
      if (name.endsWith('.ts') && !name.endsWith('.test.ts')) paths.push(`${area}/${name}`);
  for (const name of await readdir(join(root, 'server')))
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) paths.push(`server/${name}`);
  for (const name of await readdir(join(root, 'research/teacher-agent')))
    if (/\.(ts|json|md|mjs)$/.test(name) && !name.endsWith('.test.ts') && name !== 'results.md')
      paths.push(`research/teacher-agent/${name}`);
  return [...new Set(paths)].sort();
}
async function hashes() {
  return Promise.all(
    (await sourceFiles()).map(async (path) => ({
      path,
      sha256: digest(await readFile(join(root, path))),
    })),
  );
}
function localRow(task: TeacherCase, arm = 'authored-local', trial = 0): TeacherRow {
  const request = teacherRequest(task, `${campaignId}:${arm}:${trial}:${task.id}`),
    before = json(request),
    start = performance.now();
  const output = localTeacher(request);
  return {
    id: `${arm}:${trial}:${task.id}`,
    taskId: task.id,
    contextId: task.contextId,
    suite: task.suite,
    arm,
    trial,
    turn: 0,
    request,
    output,
    tools: [],
    scores: scoreStructural(request, output, before === json(request)),
    elapsedMs: performance.now() - start,
    providerSucceeded: null,
    judges: [],
  };
}
async function prepare() {
  const requestedActor = argument('--actor-model');
  if (requestedActor && !MODELS.includes(requestedActor as Model))
    throw new Error('Unknown actor model');
  const actorModels: Model[] = requestedActor ? [requestedActor as Model] : MODELS;
  const developmentBlock = Number(argument('--development-block') ?? 0);
  if (![0, 1, 2].includes(developmentBlock))
    throw new Error('Development block must be 0, 1, or 2');
  const sourceHashes = await hashes(),
    sourceHash = digest(json(sourceHashes)),
    datasetHash = digest(json(frozen));
  const prior = await reconcileHistoricalSpending(
    resolve(root, '../tabtopitch-real-data'),
    resolve(root, '../tabtopitch-forge-demo/live-coach.json'),
  );
  const budget = createBudgetLedger(prior);
  let qualificationDisposition: unknown;
  const failedQualification = argument('--failed-qualification');
  if (failedQualification) {
    const priorPath = resolve(failedQualification, 'campaign.json');
    const raw = await readFile(priorPath, 'utf8');
    const previous = JSON.parse(raw) as Campaign;
    if (
      previous.status !== 'qualification-complete' ||
      MODELS.some((m) => previous.qualified[m] !== false) ||
      previous.requests.some((r) => r.status === 'started')
    )
      throw new Error(
        'Calibration-only campaign requires completed failed qualification for both actors',
      );
    qualificationDisposition = {
      mode: 'calibration-and-local-baseline-only',
      priorPath,
      priorCampaignSha256: digest(raw),
      priorSourceHash: previous.sourceHash,
      reason:
        'Both hosted actors failed the prior development gate. No eligibility is transferred to the updated implementation.',
    };
  }
  await mkdir(directory, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    project: PROJECT,
    campaignId,
    sourceHashes,
    sourceHash,
    datasetHash,
    createdAt: new Date().toISOString(),
    models: MODELS,
    actorModels,
    developmentBlock,
    prior,
    budgetCeiling: budget.campaignCeilingDollars,
    qualificationDisposition,
    protocol: JSON.parse(
      await readFile(join(root, 'research/teacher-agent/protocol.json'), 'utf8'),
    ),
  };
  await writeFile(join(directory, 'manifest.json'), json(manifest), { flag: 'wx', mode: 0o600 });
  for (const source of sourceHashes) {
    const target = join(directory, 'source', source.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(join(root, source.path)), { flag: 'wx' });
  }
  await writeFile(join(directory, 'cases.json'), json(frozen), { flag: 'wx' });
  const rows = [...fixedCases, ...boundaryCases].map((task) => localRow(task));
  for (const episode of episodes) {
    let request = episodeRequest(episode, `${campaignId}:authored-local:0:${episode.id}`);
    for (let turn = 0; turn < episode.maxTurns; turn++) {
      const before = json(request),
        start = performance.now(),
        output = localTeacher(request);
      rows.push({
        id: `authored-local:0:${episode.id}:${turn}`,
        taskId: episode.id,
        contextId: episode.contextId,
        suite: 'episode',
        arm: 'authored-local',
        trial: 0,
        turn,
        request,
        output,
        tools: [],
        scores: scoreStructural(request, output, before === json(request)),
        elapsedMs: performance.now() - start,
        providerSucceeded: null,
        judges: [],
      });
      request = continueEpisode(
        request,
        output,
        scriptedFollowup(episode, turn, {
          offeredQuestion: output.actions.some((a) => a.type === 'question'),
          offeredVariation: output.actions.some((a) => a.type === 'preview'),
        }),
        turn + 1,
      );
    }
  }
  const campaign: Campaign = {
    schemaVersion: 1,
    project: PROJECT,
    sourceHash,
    datasetHash,
    createdAt: new Date().toISOString(),
    status: 'prepared',
    rows,
    judgeRows: [],
    qualified: Object.fromEntries(
      MODELS.filter((model) => failedQualification || !actorModels.includes(model)).map((model) => [
        model,
        false,
      ]),
    ),
    qualificationDisposition,
    qualifiedJudges: {},
    discovery: [],
    requests: budget.requests,
    budget,
  };
  await writeFile(join(directory, 'campaign.json'), json(campaign), { flag: 'wx', mode: 0o600 });
  await atomicJson(join(directory, 'summary.json'), summary(campaign));
  console.info(
    json({
      prepared: true,
      sourceHash,
      datasetHash,
      localRows: rows.length,
      structuralViolations: rows.filter((r) => !r.scores.structuralValid).length,
      prior,
      ceiling: budget.campaignCeilingDollars,
    }),
  );
}
function summary(c: Campaign) {
  return {
    schemaVersion: 1,
    experiment: campaignId,
    synthetic: true,
    realLearners: 0,
    humanReview: false,
    status: c.status,
    qualified: c.qualified,
    qualifiedJudges: c.qualifiedJudges,
    qualificationDisposition: c.qualificationDisposition,
    qualification: MODELS.map((model) => {
      const rows = c.rows.filter((r) => r.arm === model && r.suite === 'qualification');
      return {
        model,
        planned: rows.length === 0 && c.qualified[model] === false ? 0 : 12,
        observed: rows.length,
        usable: rows.filter((r) => r.providerSucceeded).length,
        qualified: c.qualified[model] ?? null,
        failures: Object.fromEntries(
          [...new Set(rows.flatMap((r) => (r.failure ? [r.failure] : [])))].map((failure) => [
            failure,
            rows.filter((r) => r.failure === failure).length,
          ]),
        ),
      };
    }),
    judgeCalibration: MODELS.map((model) => ({
      model,
      ...judgeQualification(
        claimFixtures.map((fixture) => ({
          fixture,
          result: c.judgeRows.find((r) => r.model === model && r.id === fixture.id)?.result ?? null,
        })),
      ),
      dialogueObserved: c.judgeRows.filter((r) => r.model === model && r.phase === 'dialogue')
        .length,
      qualified: c.qualifiedJudges[model] ?? null,
    })),
    arms: summarizeRows(c.rows),
    calls: c.requests.length,
    dollars: accountedDollars(c.requests),
    cumulativeDollars: c.budget.prior.dollars + accountedDollars(c.requests),
    missingUsage: c.requests.filter((r) => !r.usage).length,
    callsByKind: Object.fromEntries(
      [...new Set(c.requests.map((r) => r.kind))].map((kind) => [
        kind,
        c.requests.filter((r) => r.kind === kind).length,
      ]),
    ),
    judgeCalibrationRows: c.judgeRows.length,
    researchGate: 'Automated evidence only; no learning or independent pedagogy claim',
  };
}
async function run() {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (
    digest(json(await hashes())) !== manifest.sourceHash ||
    digest(json(frozen)) !== manifest.datasetHash
  )
    throw new Error('Frozen sources or cases changed; prepare a new campaign');
  const campaign = JSON.parse(await readFile(join(directory, 'campaign.json'), 'utf8')) as Campaign;
  if (campaign.status !== 'prepared' && !process.argv.includes('--resume'))
    throw new Error('Campaign already started; inspect its ledger before --resume');
  if (campaign.requests.some((r) => r.status === 'started'))
    throw new Error('An uncertain completion exists; no automatic resume or retry');
  campaign.budget.requests = campaign.requests;
  const key = process.env.WANDB_API_KEY;
  if (!key) throw new Error('Missing inference credential');
  let saves: Promise<void> = Promise.resolve();
  const checkpoint = () => {
    saves = saves.then(() => atomicJson(join(directory, 'campaign.json'), campaign));
    return saves;
  };
  const capture = createLensCapture(join(directory, 'lens-capture'));
  const pool = await createInferencePool();
  let initialized = false;
  let exhausted: Error | undefined;
  try {
    const transportPath = '../forge/transport.mjs',
      projectPath = '../forge/project.mjs';
    const { ForgeTransport } = await import(transportPath),
      { ensurePrivateProject } = await import(projectPath);
    const transport = new ForgeTransport({
      directory: join(directory, 'preflight'),
      mode: process.env.FORGE_TRANSPORT ?? 'native',
      deadlineMs: 30000,
    });
    try {
      await atomicJson(
        join(directory, 'project.json'),
        await ensurePrivateProject(transport, { createIfMissing: false }),
      );
    } finally {
      transport.close();
    }
    await tracing.init(PROJECT, {
      apiKey: key,
      serviceName: 'tab-to-pitch-teacher-research',
      spanProcessor: capture.spanProcessor,
    });
    initialized = true;
    const discoveryResponse = await pool.fetch('https://api.inference.wandb.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    const catalog = (await discoveryResponse.json()) as { data?: { id: string }[] };
    campaign.discovery.push({
      at: new Date().toISOString(),
      status: discoveryResponse.status,
      models: catalog.data?.map((m) => m.id),
    });
    await checkpoint();
    if (!discoveryResponse.ok || !catalog.data?.length)
      throw new Error('Live model discovery failed');
    async function completion(
      body: string,
      identity: string,
      kind: CallReceipt['kind'],
      signal: AbortSignal,
    ) {
      const parsed = JSON.parse(body) as { model: Model; max_tokens: number };
      if (!MODELS.includes(parsed.model)) throw new Error('Model lacks a frozen price');
      if (exhausted) throw exhausted;
      let receipt: CallReceipt;
      try {
        receipt = reserve(campaign.budget, {
          identity,
          kind,
          model: parsed.model,
          body,
          maxOutputTokens: parsed.max_tokens,
          maxInputBytes: kind === 'judge' || kind === 'judge-calibration' ? 49152 : 32768,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('allowance')) exhausted = error;
        throw error;
      }
      await checkpoint();
      const start = performance.now();
      try {
        const response = await pool.fetch('https://api.inference.wandb.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'OpenAI-Project': PROJECT,
          },
          body,
          signal,
        });
        const raw = (await response.json()) as {
          usage?: unknown;
          model?: string;
          id?: string;
          choices?: unknown;
        };
        settle(receipt, raw, response.status);
        return { raw, status: response.status };
      } catch (error) {
        receipt.status = 'failed';
        receipt.failure =
          error instanceof Error ? error.message.slice(0, 300) : 'Transport failure';
        throw error;
      } finally {
        receipt.elapsedMs = performance.now() - start;
        await checkpoint();
      }
    }
    async function actor(
      request: TeacherRequest,
      meta: Pick<TeacherRow, 'taskId' | 'contextId' | 'suite' | 'arm' | 'trial' | 'turn'>,
      model: Model,
    ) {
      const id = `${meta.arm}:${meta.trial}:${meta.taskId}:${meta.turn}`;
      const existing = campaign.rows.find((r) => r.id === id);
      if (existing) return existing;
      let traceId: string | undefined;
      const raw: unknown[] = [];
      const trace = researchTrace(
        {
          campaign: campaignId,
          task: meta.taskId,
          arm: meta.arm,
          trial: meta.trial,
          lesson: request.lessonId,
          turn: meta.turn,
        },
        (value) => {
          traceId = value;
        },
      );
      const fetcher: typeof fetch = async (input, init) => {
        const req = new Request(input, init);
        if (req.method !== 'POST')
          return new Response(JSON.stringify(catalog), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        const body = await req.text();
        const value = JSON.parse(body) as { tools?: { function?: { name?: string } }[] };
        const kind =
          value.tools?.[0]?.function?.name === 'review_teacher_reply'
            ? 'runtime-critic'
            : meta.suite === 'qualification'
              ? 'qualification'
              : 'actor';
        const result = await completion(body, id, kind, req.signal);
        raw.push(result.raw);
        return new Response(JSON.stringify(result.raw), {
          status: result.status,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      const agent = new ForgeTeacherAgent(
        {
          ...readConfig(),
          forgeApiKey: key,
          forgeProject: PROJECT,
          forgeModel: model,
          teacherCriticModel: 'openai/gpt-oss-20b',
          cloudEnabled: true,
          teacherEnabled: true,
        },
        fetcher,
        trace,
      );
      const before = json(request),
        start = performance.now();
      const result = await agent.run(request, AbortSignal.timeout(60000), {
        conversationId: stableUuid(`${campaignId}:${meta.arm}:${meta.trial}:${request.lessonId}`),
      });
      const row: TeacherRow = {
        id,
        ...meta,
        request,
        output: result.response,
        rawActor: raw,
        tools: result.toolResults,
        runtimeReview: result.review,
        scores: scoreStructural(
          request,
          result.response,
          before === json(request),
          result.calls.length,
          result.toolResults.length,
        ),
        elapsedMs: performance.now() - start,
        providerSucceeded: result.response.source === 'forge' && !result.failure,
        failure: result.failure,
        traceId,
        judges: [],
      };
      campaign.rows.push(row);
      await checkpoint();
      if (exhausted) throw exhausted;
      return row;
    }
    async function judge(
      payload: unknown,
      id: string,
      model: Model,
      pass: number,
      calibration = false,
    ) {
      let traceId: string | undefined,
        result: JudgeResult | null = null,
        failure: string | undefined;
      const trace = researchTrace(
        { campaign: campaignId, task: id, arm: `judge-${model}`, trial: pass, lesson: id, turn: 0 },
        (value) => {
          traceId = value;
        },
      );
      try {
        result = await trace.run(async (span) => {
          const body = JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 2048,
            messages: [
              { role: 'system', content: pass ? JUDGE_AUDIT_PROMPT : JUDGE_PROMPT },
              { role: 'user', content: JSON.stringify(payload) },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'review_teaching',
                  description: 'Evaluate the supplied response.',
                  strict: true,
                  parameters: z.toJSONSchema(judgeSchema, { target: 'draft-7' }),
                },
              },
            ],
            tool_choice: { type: 'function', function: { name: 'review_teaching' } },
            parallel_tool_calls: false,
          });
          const response = await span.model(
            model,
            async () =>
              (
                await completion(
                  body,
                  `${id}:judge-${pass}`,
                  calibration ? 'judge-calibration' : 'judge',
                  AbortSignal.timeout(60000),
                )
              ).raw,
            (output) => {
              const u = output.usage as
                | { prompt_tokens?: number; completion_tokens?: number }
                | undefined;
              return { inputTokens: u?.prompt_tokens, outputTokens: u?.completion_tokens };
            },
          );
          const choice = (
            response.choices as
              | {
                  finish_reason?: string;
                  message?: {
                    content?: string;
                    tool_calls?: { function: { name: string; arguments: string } }[];
                  };
                }[]
              | undefined
          )?.[0];
          const call = choice?.message?.tool_calls?.[0];
          if (
            call &&
            (choice?.message?.tool_calls?.length !== 1 || call.function.name !== 'review_teaching')
          )
            throw new Error('Invalid judge tool');
          const text = call ? call.function.arguments : choice?.message?.content;
          if (!text || !['tool_calls', 'stop'].includes(choice?.finish_reason ?? ''))
            throw new Error('Incomplete judge output');
          return span.tool('validate_teacher_evaluation', () =>
            validateJudgment(parseTeacherJson(text), payload),
          );
        });
      } catch (error) {
        failure = error instanceof Error ? error.message.slice(0, 400) : 'Judge failed';
      }
      if (exhausted) throw exhausted;
      return { result, failure, traceId };
    }
    campaign.status = 'qualifying';
    await checkpoint();
    const qualifications = ['foundations', 'connections', 'extensions'].flatMap((lesson) =>
      developmentCases
        .filter((c) => c.context.lesson === lesson)
        .slice((manifest.developmentBlock ?? 0) * 4, ((manifest.developmentBlock ?? 0) + 1) * 4),
    );
    for (const model of (manifest.actorModels ?? MODELS) as Model[]) {
      if (campaign.qualified[model] !== undefined) continue;
      if (!catalog.data.some((m) => m.id === model)) {
        campaign.qualified[model] = false;
        await checkpoint();
        continue;
      }
      let unavailable = 0;
      for (const task of qualifications) {
        const row = await actor(
          teacherRequest(task, `${campaignId}:${model}:qualification:${task.id}`),
          {
            taskId: task.id,
            contextId: task.contextId,
            suite: 'qualification',
            arm: model,
            trial: 0,
            turn: 0,
          },
          model,
        );
        unavailable =
          row.failure === 'unavailable' || row.failure === 'cancelled-or-timeout'
            ? unavailable + 1
            : 0;
        if (unavailable >= 2) break;
      }
      const rows = campaign.rows.filter((r) => r.arm === model && r.suite === 'qualification');
      campaign.qualified[model] =
        rows.length === 12 &&
        rows.filter((r) => r.providerSucceeded).length >= 11 &&
        rows.every((r) => r.scores.structuralValid);
      await checkpoint();
    }
    if (process.argv.includes('--qualify-only')) {
      campaign.status = 'qualification-complete';
      await checkpoint();
      return;
    }
    campaign.status = 'judge-calibration';
    await checkpoint();
    for (const model of [...MODELS].reverse()) {
      if (campaign.qualifiedJudges[model] !== undefined) continue;
      if (!catalog.data.some((m) => m.id === model)) {
        campaign.qualifiedJudges[model] = false;
        continue;
      }
      const assessFixture = async (fixture: (typeof claimFixtures)[number]) => {
        const existing = campaign.judgeRows.find((r) => r.id === fixture.id && r.model === model);
        const output =
          existing ??
          (await judge(
            { question: fixture.question, response: fixture.response, facts: fixture.facts },
            fixture.id,
            model,
            0,
            true,
          ));
        if (!existing)
          campaign.judgeRows.push({
            id: fixture.id,
            model,
            phase: fixture.split,
            ...output,
            scores: scoreClaimFixture(fixture, output.result),
          });
        await checkpoint();
        return !!output.result;
      };
      const smoke = [];
      for (const fixture of claimFixtures.slice(0, 2)) smoke.push(await assessFixture(fixture));
      if (smoke.some(Boolean)) await mapBounded(claimFixtures.slice(2), 4, assessFixture);
      const qualification = judgeQualification(
        claimFixtures.map((fixture) => ({
          fixture,
          result:
            campaign.judgeRows.find((r) => r.id === fixture.id && r.model === model)?.result ??
            null,
        })),
      );
      let injectionSafe = true;
      const dialogueScores: ReturnType<typeof scoreDialogueFixture>[] = [];
      if (qualification.qualified)
        for (const fixture of dialogueFixtures) {
          const existing = campaign.judgeRows.find((r) => r.id === fixture.id && r.model === model);
          const output =
            existing ??
            (await judge(
              { question: fixture.question, response: fixture.response, facts: fixture.facts },
              fixture.id,
              model,
              0,
              true,
            ));
          if (!existing)
            campaign.judgeRows.push({
              id: fixture.id,
              model,
              phase: 'dialogue',
              ...output,
              scores: scoreDialogueFixture(fixture, output.result),
            });
          dialogueScores.push(scoreDialogueFixture(fixture, output.result));
          if (
            fixture.expectedProblem === 'instruction-takeover' &&
            output.result?.overall !== 'unusable'
          )
            injectionSafe = false;
          await checkpoint();
        }
      campaign.qualifiedJudges[model] =
        qualification.qualified &&
        injectionSafe &&
        dialogueScores.length === 24 &&
        dialogueScores.filter((s) => s.correct).length / 24 >= 0.9;
      await checkpoint();
    }
    campaign.status = 'evaluating';
    await checkpoint();
    for (const model of MODELS.filter((m) => campaign.qualified[m])) {
      for (let trial = 0; trial < 2; trial++) {
        await mapBounded([...fixedCases, ...boundaryCases], 4, async (task) =>
          actor(
            teacherRequest(task, `${campaignId}:${model}:${trial}:${task.id}`),
            {
              taskId: task.id,
              contextId: task.contextId,
              suite: task.suite,
              arm: model,
              trial,
              turn: 0,
            },
            model,
          ),
        );
        await mapBounded(episodes, 4, async (episode) => {
          let request = episodeRequest(episode, `${campaignId}:${model}:${trial}:${episode.id}`);
          for (let turn = 0; turn < 6; turn++) {
            const row = await actor(
              request,
              {
                taskId: episode.id,
                contextId: episode.contextId,
                suite: 'episode',
                arm: model,
                trial,
                turn,
              },
              model,
            );
            request = continueEpisode(
              request,
              row.output,
              scriptedFollowup(episode, turn, {
                offeredQuestion: row.output?.actions.some((a) => a.type === 'question') ?? false,
                offeredVariation: row.output?.actions.some((a) => a.type === 'preview') ?? false,
              }),
              turn + 1,
            );
          }
        });
      }
    }
    if (campaign.qualified['openai/gpt-oss-20b'])
      for (let trial = 0; trial < 2; trial++)
        await mapBounded(fixedCases, 4, async (task) => {
          const arm = 'openai/gpt-oss-20b-history-withheld';
          await actor(
            teacherRequest(task, `${campaignId}:${arm}:${trial}:${task.id}`, {
              withholdHistory: true,
            }),
            { taskId: task.id, contextId: task.contextId, suite: task.suite, arm, trial, turn: 0 },
            'openai/gpt-oss-20b',
          );
        });
    campaign.status = 'judging';
    await checkpoint();
    await mapBounded(
      campaign.rows.filter((r) => r.suite !== 'qualification'),
      4,
      async (row) => {
        const preferred = row.arm === 'openai/gpt-oss-120b' ? MODELS : [...MODELS].reverse();
        const model = preferred.find((m) => campaign.qualifiedJudges[m]);
        if (!model) return;
        for (let pass = 0; pass < 2; pass++) {
          if (row.judges.some((j) => j.pass === pass)) continue;
          const facts = createTeacherToolRuntime(row.request).facts;
          const task =
            fixedCases.find((t) => t.id === row.taskId) ??
            boundaryCases.find((t) => t.id === row.taskId);
          const result = await judge(
            {
              question: row.request.request,
              history: row.request.context.history,
              music: row.request.context.music,
              evidence: row.request.context.evidence,
              facts,
              tools: row.tools,
              goal: task?.goal ?? episodes.find((e) => e.id === row.taskId)?.completion,
              rubric: task?.rubric,
              response: row.output?.message ?? '',
              actions: row.output?.actions ?? [],
            },
            row.id,
            model,
            pass,
          );
          row.judges.push({ model, pass, qualified: true, ...result });
          await checkpoint();
        }
      },
    );
    campaign.status = 'complete';
  } catch (error) {
    campaign.status = 'stopped';
    campaign.failure =
      error instanceof Error ? error.message.slice(0, 400) : 'Unknown campaign failure';
    throw error;
  } finally {
    campaign.completedAt = new Date().toISOString();
    if (initialized) await tracing.shutdown();
    await capture.checkpoint();
    pool.close();
    await checkpoint();
    await atomicJson(join(directory, 'summary.json'), summary(campaign));
    console.info(json(summary(campaign)));
  }
}
if (process.argv.includes('--prepare')) await prepare();
else if (process.argv.includes('--run')) await run();
else if (process.argv.includes('--summarize'))
  console.info(json(summary(JSON.parse(await readFile(join(directory, 'campaign.json'), 'utf8')))));
else throw new Error('Use --prepare, --run [--qualify-only] [--resume], or --summarize with --dir');
