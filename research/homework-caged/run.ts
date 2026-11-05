import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { homeworkCases, type HomeworkCase } from './cases.js';
import { scoreHomeworkCase } from './contract.js';
import { localTeacher } from '../../src/engine/teacher.js';
import { ForgeTeacherAgent } from '../../server/teacher.js';
import { readConfig } from '../../server/config.js';
import { researchTrace } from '../teacher-agent/trace.js';
import { SharedInferenceBudget } from '../forge/shared-budget.js';
import {
  digest,
  json,
  reconcileHistoricalSpending,
  atomicJson,
  PRICES,
} from '../teacher-agent/budget.js';
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const dir = resolve(arg('--dir') ?? '../homework-caged-001');
const project = 'wandb/tab-to-pitch-public-data-research';
async function preflight() {
  const root = arg('--historical-root'),
    legacy = arg('--legacy-demo');
  if (!root || !legacy)
    throw new Error('Supply canonical historical spending and legacy demo receipts.');
  const prior = await reconcileHistoricalSpending(root, legacy),
    blockers: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let c;
    try {
      c = JSON.parse(await readFile(join(root, entry.name, 'campaign.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (
      c.status === 'running' ||
      c.requests?.some((r: { status: string }) => r.status === 'started')
    )
      blockers.push(entry.name);
  }
  return { prior, blockers };
}
async function sourceHashes() {
  const files = [
    'src/engine/caged.ts',
    'src/engine/exposure.ts',
    'src/engine/harmony.ts',
    'src/engine/theory.ts',
    'src/engine/homework.ts',
    'src/engine/homework-planner.ts',
    'src/engine/teacher.ts',
    'src/shared/homework.ts',
    'src/shared/teacher.ts',
    'src/shared/teacher-tools.ts',
    'server/teacher.ts',
    'server/teacher-provider.ts',
    'server/teacher-review.ts',
    'server/teacher-limits.ts',
    'research/homework-caged/cases.ts',
    'research/homework-caged/contract.ts',
    'research/homework-caged/run.ts',
    'research/forge/shared-budget.ts',
    'package-lock.json',
  ];
  async function collect(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((entry) => {
          const path = join(directory, entry.name);
          return entry.isDirectory()
            ? collect(path)
            : /\.(?:ts|tsx|json|mjs)$/.test(entry.name)
              ? [path]
              : [];
        }),
      )
    ).flat();
  }
  const dependencies = (
    await Promise.all(
      ['src', 'server', 'research/teacher-agent', 'research/forge', 'research/homework-caged'].map(
        collect,
      ),
    )
  ).flat();
  return Promise.all(
    [...new Set([...files, ...dependencies])]
      .sort()
      .map(async (path) => ({ path, sha256: digest(await readFile(path)) })),
  );
}
if (process.argv.includes('--prepare')) {
  const history = await preflight();
  await mkdir(dir, { recursive: false });
  const cases = {
    development: homeworkCases('development'),
    evaluation: homeworkCases('evaluation'),
  };
  const sources = await sourceHashes();
  for (const source of sources) {
    const destination = join(dir, 'sources', source.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(source.path));
  }
  const rows = cases.evaluation.map((c) => {
    const before = json(c.request),
      start = performance.now(),
      output = localTeacher(c.request);
    return {
      id: `authored:${c.id}`,
      taskId: c.id,
      contextId: c.contextId,
      arm: 'authored',
      output,
      scores: scoreHomeworkCase(c, output, before === json(c.request)),
      executionMs: performance.now() - start,
      calls: [],
      tools: [],
      traceId: null,
    };
  });
  await writeFile(join(dir, 'cases.json'), json(cases));
  await writeFile(
    join(dir, 'manifest.json'),
    json({
      protocol: 'homework-caged-v1',
      project,
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      createdAt: new Date().toISOString(),
      caseHash: digest(json(cases)),
      sources,
      history,
      qualification: false,
    }),
  );
  await writeFile(
    join(dir, 'campaign.json'),
    json({
      protocol: 'homework-caged-v1',
      project,
      status: history.blockers.length ? 'blocked-shared-budget' : 'prepared',
      rows,
      requests: [],
      unexecuted: [
        'forge-actor',
        'runtime-critic',
        'qualified-evaluator',
        'lens-readback',
        'weave-publication',
      ],
      qualification: false,
    }),
  );
  console.log(
    json({
      directory: dir,
      localRows: rows.length,
      valid: rows.filter(
        (r) => r.scores.contractValid && r.scores.executableActionsValid && r.scores.respectsStop,
      ).length,
      priorDollars: history.prior.dollars,
      blockers: history.blockers,
      paidCalls: 0,
    }),
  );
} else if (process.argv.includes('--run-development')) {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  if (json(await sourceHashes()) !== json(manifest.sources))
    throw new Error('Source changed after freezing. Prepare a new campaign.');
  const history = await preflight();
  if (history.blockers.length)
    throw new Error(`Other campaigns have unresolved requests: ${history.blockers.join(', ')}`);
  const ledger = process.env.TTP_SHARED_INFERENCE_LEDGER,
    receipt = process.env.TTP_BUDGET_PARTICIPANTS_RECEIPT;
  if (!ledger || !receipt)
    throw new Error(
      'Shared atomic budget and adoption receipt are required; no new allowance is created.',
    );
  const adoption = JSON.parse(await readFile(receipt, 'utf8'));
  if (
    adoption.ledger !== resolve(ledger) ||
    adoption.historicalHash !== digest(json(history.prior)) ||
    adoption.allCampaignsMigrated !== true
  )
    throw new Error('Concurrent campaign budget adoption is unverified.');
  const pricesReceipt = arg('--pricing-receipt');
  if (!pricesReceipt)
    throw new Error('Provide a fresh pricing-verification receipt before paid calls.');
  const prices = JSON.parse(await readFile(pricesReceipt, 'utf8'));
  if (
    prices.verified !== true ||
    JSON.stringify(prices.models) !== JSON.stringify(PRICES) ||
    !Number.isFinite(Date.parse(prices.checkedAt)) ||
    prices.source !== 'https://coreweave.com/forge-pricing/inference-agents' ||
    Date.now() - Date.parse(prices.checkedAt) > 86400000 ||
    Date.parse(prices.checkedAt) > Date.now()
  )
    throw new Error('Pricing verification is stale or invalid.');
  const config = {
    ...readConfig(process.env),
    forgeModel: 'openai/gpt-oss-20b',
    teacherCriticModel: 'openai/gpt-oss-20b',
    forgeProject: project,
    tracingEnabled: true,
  };
  if (!config.forgeApiKey) throw new Error('Forge credentials unavailable.');
  const budget = new SharedInferenceBudget(resolve(ledger));
  budget.initialize(history.prior);
  const cases = JSON.parse(await readFile(join(dir, 'cases.json'), 'utf8')) as {
    development: HomeworkCase[];
  };
  if (digest(await readFile(join(dir, 'cases.json'))) !== manifest.caseHash)
    throw new Error('Frozen case membership changed.');
  const campaign = JSON.parse(await readFile(join(dir, 'campaign.json'), 'utf8'));
  if (campaign.requests.length)
    throw new Error('Resolve existing calls before retrying a campaign.');
  let identity = '';
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.endsWith('/chat/completions')) return fetch(request);
    const body = await request.clone().text(),
      decoded = JSON.parse(body);
    const id = `homework-caged-v1:${identity}:${campaign.requests.length}`;
    const reserved = budget.reserve(
      id,
      'homework-caged-v1',
      decoded.model,
      Buffer.byteLength(body),
      decoded.max_tokens,
    );
    const r = { id, status: 'started', model: decoded.model, reservedDollars: reserved };
    campaign.requests.push(r);
    await atomicJson(join(dir, 'campaign.json'), campaign);
    try {
      const response = await fetch(request);
      const data = await response.clone().json();
      budget.settle(id, data.usage);
      Object.assign(r, { status: 'responded', usage: data.usage, httpStatus: response.status });
      await atomicJson(join(dir, 'campaign.json'), campaign);
      return response;
    } catch (error) {
      Object.assign(r, { status: 'failed', failure: String(error) });
      await atomicJson(join(dir, 'campaign.json'), campaign);
      throw error;
    }
  };
  campaign.status = 'running';
  await atomicJson(join(dir, 'campaign.json'), campaign);
  try {
    for (let trial = 0; trial < 2; trial++)
      for (const c of cases.development) {
        identity = `${c.id}:${trial}`;
        let traceId: string | undefined;
        const trace = researchTrace(
          {
            campaign: 'homework-caged-v1',
            task: c.id,
            arm: 'gpt-oss-20b',
            trial,
            lesson: c.contextId,
            turn: 0,
          },
          (id) => {
            traceId = id;
          },
        );
        const agent = new ForgeTeacherAgent(config, fetcher, trace),
          before = json(c.request),
          start = performance.now();
        const result = await agent.run(c.request, AbortSignal.timeout(60000));
        campaign.rows.push({
          id: identity,
          taskId: c.id,
          contextId: c.contextId,
          arm: 'gpt-oss-20b',
          trial,
          output: result.response,
          scores: scoreHomeworkCase(c, result.response, before === json(c.request)),
          executionMs: performance.now() - start,
          calls: result.calls,
          tools: result.toolResults,
          review: result.review,
          failure: result.failure,
          traceId,
        });
        await atomicJson(join(dir, 'campaign.json'), campaign);
        await agent.close();
      }
    campaign.status = 'development-complete-unqualified';
  } finally {
    campaign.sharedBudget = budget.read();
    budget.close();
    await atomicJson(join(dir, 'campaign.json'), campaign);
  }
} else
  throw new Error(
    'Use --prepare or --run-development. Held-out cloud promotion requires a qualified evaluator.',
  );
