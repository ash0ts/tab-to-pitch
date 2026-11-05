import {
  PRACTICE_JUDGE_PROMPT as JUDGE_PROMPT,
  practiceJudgeSchema as judgeSchema,
  validatePracticeJudgment as validateJudgment,
  type PracticeJudgment as JudgeResult,
} from './judge.js';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { createLensCapture } from '../coach-benchmark/lens-capture.js';
import { createInferencePool } from '../arrangement-agent/inference-pool.js';
import { TeacherProvider } from '../../server/teacher-provider.js';
import { createTeacherToolRuntime } from '../../src/engine/teacher.js';
import {
  claimFixtures,
  dialogueFixtures,
  judgeQualification,
  scoreDialogueFixture,
} from '../teacher-agent/judge.js';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { practiceCases } from './cases.js';
import { canEvaluateHeldOut, scorePractice } from './contract.js';
import { localTeacher } from '../../src/engine/teacher.js';
import { ForgeTeacherAgent, TEACHER_SYSTEM_PROMPT } from '../../server/teacher.js';
import { readConfig } from '../../server/config.js';
import { researchTrace } from '../teacher-agent/trace.js';
import {
  atomicJson,
  digest,
  json,
  reconcileHistoricalSpending,
  PRICES,
  type Model,
} from '../teacher-agent/budget.js';
import { SharedInferenceBudget } from '../forge/shared-budget.js';
import previous from './current-prompt.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};
const directory = resolve(arg('--dir') ?? join(root, '../teaching-practice-001'));
const dataRoot = arg('--historical-root');
const legacy = arg('--legacy-demo');
const project = 'wandb/tab-to-pitch-public-data-research';
const campaignId = basename(directory);
const cases = {
  development: practiceCases('development'),
  evaluation: practiceCases('evaluation'),
  claimFixtures,
  dialogueFixtures,
};

async function hashes() {
  const files: string[] = ['package-lock.json'];
  async function walk(area: string) {
    for (const entry of await readdir(join(root, area), { withFileTypes: true })) {
      const path = join(area, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(ts|json|mjs|py)$/.test(path) && !path.endsWith('.test.ts')) files.push(path);
    }
  }
  for (const area of [
    'src',
    'server',
    'research/teaching-practice',
    'research/forge',
    'research/teacher-agent',
    'research/arrangement-agent',
    'research/coach-benchmark',
  ])
    await walk(area);
  return Promise.all(
    files.sort().map(async (path) => ({ path, sha256: digest(await readFile(join(root, path))) })),
  );
}
async function preflight() {
  if (!dataRoot || !legacy)
    throw new Error('Supply the canonical historical root and legacy demo receipt.');
  const prior = await reconcileHistoricalSpending(resolve(dataRoot), resolve(legacy));
  const blockers: string[] = [];
  for (const entry of await readdir(dataRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let value;
    try {
      value = JSON.parse(await readFile(join(dataRoot, entry.name, 'campaign.json'), 'utf8'));
    } catch {
      continue;
    }
    if (
      value.status === 'running' ||
      value.requests?.some((r: { status: string }) => r.status === 'started')
    )
      blockers.push(entry.name);
  }
  return { prior, blockers };
}
if (process.argv.includes('--prepare')) {
  await mkdir(directory, { recursive: false });
  const sources = await hashes();
  for (const source of sources) {
    await mkdir(dirname(join(directory, 'source', source.path)), { recursive: true });
    await writeFile(
      join(directory, 'source', source.path),
      await readFile(join(root, source.path)),
    );
  }
  const prepared = await preflight();
  const rows = cases.evaluation.map((c) => {
    const start = performance.now(),
      before = json(c.request),
      output = localTeacher(c.request);
    return {
      id: `authored:${c.id}`,
      taskId: c.id,
      contextId: c.contextId,
      scenario: c.scenario,
      arm: 'authored',
      trial: 0,
      request: c.request,
      output,
      scores: scorePractice(c.request, output, before === json(c.request)),
      executionMs: performance.now() - start,
      calls: [],
      tools: [],
      judge: null,
    };
  });
  await writeFile(join(directory, 'cases.json'), json(cases));
  await writeFile(
    join(directory, 'manifest.json'),
    json({
      protocol: 'teaching-practice-v1',
      project,
      preparedAt: new Date().toISOString(),
      sourceHashes: sources,
      casesHash: digest(json(cases)),
      currentPromptHash: digest(previous.prompt),
      revisedPromptHash: digest(TEACHER_SYSTEM_PROMPT),
      prices: PRICES,
      pricingCheckedAt: '2026-11-04',
      pricingSource: 'https://coreweave.com/forge-pricing/inference-agents',
      history: prepared.prior,
      blockers: prepared.blockers,
      releaseQualified: false,
    }),
  );
  await writeFile(
    join(directory, 'campaign.json'),
    json({
      protocol: 'teaching-practice-v1',
      status: prepared.blockers.length ? 'cloud-blocked-uncoordinated-campaign' : 'prepared',
      project,
      rows,
      requests: [],
      unexecuted: ['current-prompt', 'revised-prompt'],
      reason: prepared.blockers.length
        ? 'Active campaigns do not share an atomic reservation ledger.'
        : 'Requires shared budget, qualified actor/evaluator and project readback.',
    }),
  );
  console.log(
    json({
      prepared: directory,
      localRows: rows.length,
      structuralValid: rows.filter((r) => r.scores.executableActionsValid).length,
      blockers: prepared.blockers,
      paidCalls: 0,
      qualification: false,
    }),
  );
} else if (process.argv.includes('--run')) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (
    json(await hashes()) !== json(manifest.sourceHashes) ||
    digest(json(cases)) !== manifest.casesHash
  )
    throw new Error('Source or fixtures drifted. Prepare a new campaign.');
  const { prior, blockers } = await preflight();
  if (blockers.length)
    throw new Error(
      `Cannot guarantee shared authorization while nonparticipating campaigns run: ${blockers.join(', ')}`,
    );
  const ledgerPath = process.env.TTP_SHARED_INFERENCE_LEDGER;
  if (!ledgerPath || !process.env.TTP_BUDGET_PARTICIPANTS_RECEIPT)
    throw new Error(
      'A shared ledger and migration receipt for all concurrent campaigns are required.',
    );
  const participants = JSON.parse(
    await readFile(process.env.TTP_BUDGET_PARTICIPANTS_RECEIPT, 'utf8'),
  );
  if (
    participants.ledger !== resolve(ledgerPath) ||
    participants.historicalHash !== digest(json(prior)) ||
    participants.allCampaignsMigrated !== true
  )
    throw new Error('Budget adoption receipt does not match the reconciled history.');
  const budget = new SharedInferenceBudget(resolve(ledgerPath));
  budget.initialize(prior);
  const campaign = JSON.parse(await readFile(join(directory, 'campaign.json'), 'utf8'));
  if (campaign.requests.length)
    throw new Error('This campaign already started. Resolve recorded writes before a new attempt.');
  const persist = () => atomicJson(join(directory, 'campaign.json'), campaign);
  const model: Model = 'openai/gpt-oss-20b';
  const config = {
    ...readConfig(process.env),
    forgeModel: model,
    teacherCriticModel: model,
    tracingEnabled: true,
    forgeProject: project,
  };
  if (!config.forgeApiKey) throw new Error('Forge credentials unavailable.');
  const pool = await createInferencePool({ callerReserves: true });
  const capture = createLensCapture(join(directory, 'lens-capture'));
  let initialized = false;
  let identity = '';
  const boundedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.endsWith('/chat/completions')) return pool.fetch(request);
    const body = await request.clone().text(),
      decoded = JSON.parse(body);
    const id = `${campaignId}:${identity}:${campaign.requests.length}`;
    const reserved = budget.reserve(
      id,
      'teaching-practice-v1',
      decoded.model,
      Buffer.byteLength(body),
      decoded.max_tokens,
    );
    const receipt = { id, status: 'started', reservedDollars: reserved, model: decoded.model };
    campaign.requests.push(receipt);
    await persist();
    try {
      const response = await pool.fetch(request);
      const output = await response.clone().json();
      budget.settle(id, output.usage);
      Object.assign(receipt, {
        status: 'responded',
        usage: output.usage,
        httpStatus: response.status,
      });
      await persist();
      return response;
    } catch (error) {
      Object.assign(receipt, { status: 'failed', failure: String(error) });
      await persist();
      throw error;
    }
  };
  // Development, evaluator calibration, and held-out promotion are separate recorded gates.
  campaign.status = 'running';
  await persist();
  const execute = async (
    c: ReturnType<typeof practiceCases>[number],
    arm: string,
    trial: number,
    request = c.request,
    turn = 0,
  ) => {
    identity = `${arm}:${trial}:${c.id}:turn-${turn}`;
    let traceId: string | undefined;
    const trace = researchTrace(
      { campaign: campaignId, task: c.id, arm, trial, lesson: c.id, turn },
      (id) => {
        traceId = id;
      },
    );
    const agent = new ForgeTeacherAgent(
      config,
      boundedFetch,
      trace,
      arm === 'current-prompt' ? previous.prompt : undefined,
    );
    const before = json(request),
      start = performance.now();
    const result = await agent.run(request, AbortSignal.timeout(60000));
    const row = {
      id: identity,
      taskId: c.id,
      contextId: c.contextId,
      scenario: c.scenario,
      split: c.split,
      arm,
      trial,
      request,
      output: result.response,
      scores: scorePractice(
        request,
        result.response,
        before === json(request),
        result.calls.length,
        result.toolResults.length,
      ),
      executionMs: performance.now() - start,
      calls: result.calls,
      tools: result.toolResults,
      review: result.review,
      failure: result.failure,
      traceId,
      judge: null as JudgeResult | null,
    };
    campaign.rows.push(row);
    await persist();
    await agent.close();
    return row;
  };
  const judge = async (id: string, payload: unknown) => {
    identity = `judge:${id}`;
    let traceId: string | undefined;
    const tracer = researchTrace(
      {
        campaign: campaignId,
        task: id,
        arm: 'judge-20b',
        trial: 0,
        lesson: id,
        turn: 0,
      },
      (id) => {
        traceId = id;
      },
    );
    let result: JudgeResult | null = null,
      failure: string | undefined;
    try {
      result = await tracer.run(async (trace) => {
        const provider = new TeacherProvider(
          config,
          boundedFetch,
          trace,
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
        return validateJudgment(decoded.args, payload);
      });
    } catch (error) {
      failure = String(error);
    }
    campaign.judges ??= [];
    campaign.judges.push({ id, result, failure, traceId });
    await persist();
    return result;
  };
  try {
    await tracing.init(project, {
      apiKey: config.forgeApiKey,
      serviceName: 'tab-to-pitch-practice-research',
      spanProcessor: capture.spanProcessor,
    });
    initialized = true;
    const discovery = await pool.fetch(`${config.forgeBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.forgeApiKey}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!discovery.ok) throw new Error('Model discovery unavailable');
    const models = (await discovery.json()) as { data?: { id: string }[] };
    await atomicJson(join(directory, 'model-discovery.json'), models);
    if (!models.data?.some((item) => item.id === model))
      throw new Error('The pinned actor is not available for this account');
    for (const arm of ['current-prompt', 'revised-prompt'])
      for (let trial = 0; trial < 2; trial++)
        for (const c of cases.development) await execute(c, arm, trial);
    campaign.status = 'development-complete-unqualified';
    if (!process.argv.includes('--development')) {
      const calibration = [];
      for (const fixture of claimFixtures)
        calibration.push({
          fixture,
          result: await judge(fixture.id, {
            question: fixture.question,
            response: fixture.response,
            facts: fixture.facts,
          }),
        });
      const dialogue = [];
      for (const fixture of dialogueFixtures)
        dialogue.push({
          fixture,
          result: await judge(fixture.id, {
            question: fixture.question,
            response: fixture.response,
            facts: fixture.facts,
          }),
        });
      const qualification = judgeQualification(calibration);
      campaign.judgeQualification = {
        ...qualification,
        qualified:
          qualification.qualified &&
          dialogue.every(
            (r) =>
              r.fixture.expectedProblem !== 'instruction-takeover' ||
              scoreDialogueFixture(r.fixture, r.result).correct,
          ),
      };
      if (campaign.judgeQualification.qualified) {
        for (const row of campaign.rows)
          row.judge = await judge(row.id, {
            question: row.request.request,
            history: row.request.context.history,
            response: row.output.message,
            facts: createTeacherToolRuntime(row.request).facts,
            tools: row.tools,
            actions: row.output.actions,
          });
        campaign.actorQualification = {};
        for (const arm of ['current-prompt', 'revised-prompt']) {
          const development = campaign.rows.filter(
            (r: { arm: string; split: string }) => r.arm === arm && r.split === 'development',
          );
          campaign.actorQualification[arm] = canEvaluateHeldOut(development);
          if (!campaign.actorQualification[arm]) continue;
          for (let trial = 0; trial < 2; trial++)
            for (const c of cases.evaluation) {
              const row = await execute(c, arm, trial);
              row.judge = await judge(row.id, {
                question: row.request.request,
                history: row.request.context.history,
                response: row.output.message,
                facts: createTeacherToolRuntime(row.request).facts,
                tools: row.tools,
                actions: row.output.actions,
              });
              await persist();
            }
        }
        campaign.status = 'evaluation-complete';
      } else campaign.status = 'evaluator-unqualified';
    }
  } catch (error) {
    campaign.status = 'stopped';
    campaign.failure = String(error);
    throw error;
  } finally {
    campaign.sharedBudget = budget.read();
    budget.close();
    if (initialized) await tracing.shutdown();
    await capture.checkpoint();
    pool.close();
    await persist();
  }
} else throw new Error('Choose --prepare or --run --development.');
