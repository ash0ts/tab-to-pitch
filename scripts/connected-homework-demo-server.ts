import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tracing } from '@coreweave/forge-sdk/agentlens';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { InMemoryTestRepository } from '../server/test-repository.js';
import { newToken, invitationHash } from '../server/auth.js';
import { ForgeTeacherAgent, type TeacherAgent } from '../server/teacher.js';
import { createInferencePool } from '../research/arrangement-agent/inference-pool.js';
import { createLensCapture } from '../research/coach-benchmark/lens-capture.js';
import { researchTrace } from '../research/teacher-agent/trace.js';
import {
  atomicJson,
  reconcileHistoricalSpending,
  digest,
  validUsage,
  PRICES,
  type Model,
} from '../research/teacher-agent/budget.js';
import { SharedInferenceBudget } from '../research/forge/shared-budget.js';
import { DEMO_PROMPTS, PROTOCOL, scoreDemo } from '../research/connected-homework/protocol.js';

const directory = resolve(process.env.TTP_DEMO_DIRECTORY ?? '../connected-homework-demo-001');
const ledgerPath = process.env.TTP_SHARED_INFERENCE_LEDGER;
const historicalRoots = JSON.parse(process.env.TTP_HISTORICAL_ROOTS ?? '[]') as string[];
const legacyDemo = process.env.TTP_LEGACY_DEMO;
if (!ledgerPath || !historicalRoots.length || !legacyDemo || !process.env.WANDB_API_KEY)
  throw new Error(
    'Supply the canonical shared ledger, historical root, legacy receipt and Forge credential.',
  );
const prior = {
  sources: [] as Awaited<ReturnType<typeof reconcileHistoricalSpending>>['sources'],
  calls: 0,
  dollars: 0,
  unknownUsage: 0,
};
for (const [index, root] of historicalRoots.entries()) {
  const ledger = await reconcileHistoricalSpending(root, legacyDemo);
  for (const source of ledger.sources) {
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
const budget = new SharedInferenceBudget(ledgerPath);
budget.initialize(prior);
await mkdir(directory, { recursive: false });
const campaignName = directory.split('/').at(-1)!;
const files = [
  'package-lock.json',
  'scripts/connected-homework-demo-server.ts',
  'scripts/capture-connected-homework.ts',
  'research/connected-homework/protocol.ts',
  'src/shared/teacher.ts',
  'src/shared/homework-playing.ts',
  'src/engine/teacher.ts',
  'src/engine/teacher-prose.ts',
  'src/homework/explain.ts',
  'src/homework/stimulus.ts',
  'src/ui/TeacherPanel.tsx',
  'src/ui/GuitarHomeworkPanel.tsx',
  'server/teacher.ts',
  'server/teacher-provider.ts',
  'server/teacher-tool-view.ts',
  'server/teacher-review.ts',
];
const sourceHashes = [];
for (const path of files) {
  const bytes = await readFile(path);
  await mkdir(dirname(join(directory, 'source', path)), { recursive: true });
  await writeFile(join(directory, 'source', path), bytes);
  sourceHashes.push({ path, sha256: digest(bytes) });
}
await atomicJson(join(directory, 'manifest.json'), {
  protocol: PROTOCOL,
  createdAt: new Date().toISOString(),
  sourceHashes,
  prompts: DEMO_PROMPTS,
  models: ['openai/gpt-oss-20b'],
  trials: 1,
  cases: 3,
  ceilingDollars: 0.1,
  sharedLedger: ledgerPath,
  historical: prior,
  prices: PRICES,
  pricingVerifiedAt: '2026-11-05',
  pricingSource: 'https://coreweave.com/forge-pricing/inference-agents',
  qualified: false,
  limitations:
    'Original authored UI smoke demonstration. No learner outcomes; keyword checks are not a quality judge. Test-only invitation storage.',
});
const config = {
  ...readConfig({}),
  publicOrigin: 'http://127.0.0.1:5420',
  sessionSecret: newToken(),
  forgeApiKey: process.env.WANDB_API_KEY,
  forgeProject: 'wandb/tab-to-pitch-public-data-research',
  forgeModel: 'openai/gpt-oss-20b',
  teacherCriticModel: 'openai/gpt-oss-20b',
  cloudEnabled: true,
  teacherEnabled: true,
  teacherQualification: 'unqualified' as const,
  tracingEnabled: false,
  dailyTokenLimit: 1000000,
};
const campaign: any = {
  protocol: PROTOCOL,
  project: config.forgeProject,
  status: 'running',
  rows: [],
  requests: [],
  qualified: false,
  budget: { ceilingDollars: 0.1, sharedLedger: ledgerPath },
};
const save = () => atomicJson(join(directory, 'campaign.json'), campaign);
await save();
const pool = await createInferencePool({ callerReserves: true });
await atomicJson(join(directory, 'transport-probes.json'), {
  probes: pool.probes,
  address: pool.address,
});
const capture = createLensCapture(join(directory, 'lens-capture'));
await tracing.init(config.forgeProject, {
  apiKey: config.forgeApiKey,
  serviceName: 'tabtopitch-connected-homework-demo',
  spanProcessor: capture.spanProcessor,
});
let currentTurn = '',
  busy = false;
const fetcher: typeof fetch = async (input, init) => {
  if (String(input).endsWith('/models')) return pool.fetch(input, init);
  const body = String(init?.body),
    parsed = JSON.parse(body),
    sequence = campaign.requests.length;
  const model = parsed.model as Model;
  const worstCase =
    ((Buffer.byteLength(body) + 128) * PRICES[model].input +
      parsed.max_tokens * PRICES[model].output) /
    1e6;
  const accounted = campaign.requests.reduce(
    (n: number, r: any) => n + (r.costDollars ?? r.reservedDollars),
    0,
  );
  if (accounted + worstCase > 0.1) throw new Error('Demo cap reached');
  const id = `${campaignName}:${sequence}`;
  const reservedDollars = budget.reserve(
    id,
    campaignName,
    model,
    Buffer.byteLength(body),
    parsed.max_tokens,
  );
  const receipt: any = {
    id,
    identity: currentTurn,
    sequence,
    model,
    kind: parsed.tools[0].function.name === 'review_teacher_reply' ? 'runtime-critic' : 'actor',
    reservedDollars,
    status: 'started',
  };
  campaign.requests.push(receipt);
  await save();
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
    receipt.failure = error instanceof Error ? error.message : 'Request failed';
    throw error;
  } finally {
    budget.settle(id, usage);
    await save();
  }
};
const agent: TeacherAgent = {
  async run(request, signal, options) {
    const index = campaign.rows.length;
    if (
      busy ||
      index >= 3 ||
      request.request !== DEMO_PROMPTS[index] ||
      !request.context.playingHomework?.stimulus
    )
      throw new Error('Only the frozen three original homework prompts are allowed');
    if (index === 1 && request.context.music.spans.map((s) => s.symbol).join(',') !== 'G7,Cmaj7')
      throw new Error('Demo context differs from the frozen connection');
    busy = true;
    currentTurn = request.turnId;
    const before = JSON.stringify(request),
      start = performance.now();
    let traceId: string | undefined;
    try {
      const teacher = new ForgeTeacherAgent(
        config,
        fetcher,
        researchTrace(
          {
            campaign: campaignName,
            task: `turn-${index}`,
            arm: config.forgeModel,
            trial: 0,
            lesson: request.lessonId,
            turn: index,
          },
          (id) => (traceId = id),
        ),
      );
      const result = await teacher.run(request, signal, options);
      campaign.rows.push({
        id: request.turnId,
        taskId: `turn-${index}`,
        contextId: request.context.playingHomework.stimulus.stimulusId,
        suite: 'authored-ui-smoke',
        arm: config.forgeModel,
        trial: 0,
        turn: index,
        request,
        output: result.response,
        calls: result.calls,
        tools: result.toolResults,
        review: result.review ?? null,
        failure: result.failure ?? null,
        traceId,
        elapsedMs: performance.now() - start,
        scores: {
          ...scoreDemo(request, result.response, result.calls.length, result.toolResults.length),
          sourceUnchanged: before === JSON.stringify(request),
        },
      });
      await save();
      return result;
    } finally {
      busy = false;
    }
  },
  async close() {
    await tracing.shutdown();
    pool.close();
    campaign.status = 'execution-complete';
    await atomicJson(join(directory, 'budget-readback.json'), budget.read());
    budget.close();
    await save();
  },
};
const repository = new InMemoryTestRepository(),
  token = newToken();
await repository.createInvitation({
  id: randomUUID(),
  tokenHash: invitationHash(token),
  expiresAt: new Date(Date.now() + 3600000),
  maxTokens: 1000000,
});
const app = await buildApp({ config, repository, teacherAgent: agent });
await app.listen({ host: '127.0.0.1', port: 3001 });
await writeFile(join(directory, 'demo-session.json'), JSON.stringify({ token }), { mode: 0o600 });
console.info('Original-homework demo ready at loopback port 3001; three turns, $0.10 cap.');
async function close() {
  await app.close();
  process.exit(0);
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
