import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
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
  createBudgetLedger,
  reserve,
  settle,
  digest,
  type Model,
} from '../research/teacher-agent/budget.js';
import { scoreListening } from '../research/listening-agent/contract.js';
const root = resolve('.'),
  directory = resolve('../tabtopitch-real-data/listening-demo-001');
const key = process.env.WANDB_API_KEY;
if (!key) throw new Error('Missing Forge credential');
const prior = await reconcileHistoricalSpending(
  resolve('../tabtopitch-real-data'),
  resolve('../tabtopitch-forge-demo/live-coach.json'),
);
const budget = createBudgetLedger(prior),
  spent = prior.sources
    .filter((s) => s.path.startsWith('listening-'))
    .reduce((n, s) => n + s.dollars, 0);
budget.campaignCeilingDollars = Math.min(budget.campaignCeilingDollars, 0.1, 15 - spent);
if (budget.campaignCeilingDollars <= 0) throw new Error('Listening campaign ceiling exhausted');
await mkdir(directory, { recursive: false });
const config = {
  ...readConfig({}),
  publicOrigin: 'http://127.0.0.1:5194',
  sessionSecret: newToken(),
  forgeApiKey: key,
  forgeProject: 'wandb/tab-to-pitch-public-data-research',
  cloudEnabled: true,
  teacherEnabled: true,
  teacherQualification: 'unqualified' as const,
  tracingEnabled: false,
  dailyTokenLimit: 1000000,
};
const campaign: any = {
  schemaVersion: 1,
  project: config.forgeProject,
  status: 'running',
  purpose: 'actual-local-UI-authored-demonstration',
  rows: [],
  requests: budget.requests,
  budget,
};
let writes = Promise.resolve();
const save = () =>
  (writes = writes.then(() => atomicJson(join(directory, 'campaign.json'), campaign)));
await save();
const pool = await createInferencePool(),
  capture = createLensCapture(join(directory, 'lens-capture'));
await tracing.init(config.forgeProject, {
  apiKey: key,
  serviceName: 'tabtopitch-listening-ui-demo',
  spanProcessor: capture.spanProcessor,
});
const fetcher: typeof fetch = async (input, init) => {
  if (String(input).endsWith('/models')) return pool.fetch(input, init);
  const body = String(init?.body),
    parsed = JSON.parse(body),
    receipt = reserve(budget, {
      identity: currentTurn,
      kind: parsed.tools[0].function.name === 'review_teacher_reply' ? 'runtime-critic' : 'actor',
      model: parsed.model as Model,
      body,
      maxOutputTokens: parsed.max_tokens,
      maxInputBytes: 32768,
    });
  await save();
  try {
    const response = await pool.fetch(input, init),
      raw = await response.text();
    await writeFile(join(directory, `response-${receipt.sequence}.json`), raw, {
      flag: 'wx',
      mode: 0o600,
    });
    settle(receipt, JSON.parse(raw), response.status);
    return new Response(raw, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    receipt.status = 'failed';
    receipt.failure = error instanceof Error ? error.message : 'Request failed';
    throw error;
  } finally {
    await save();
  }
};
let currentTurn = '',
  busy = false;
const agent: TeacherAgent = {
  async run(request, signal, options) {
    if (
      busy ||
      campaign.rows.length >= 3 ||
      !['original-c', 'original-g'].includes(request.context.listening?.passageId ?? '')
    )
      throw new Error('Demo permits at most three serialized original-study turns');
    busy = true;
    currentTurn = request.turnId;
    let traceId: string | undefined;
    const start = performance.now();
    try {
      const teacher = new ForgeTeacherAgent(
        config,
        fetcher,
        researchTrace(
          {
            campaign: 'listening-demo-001',
            task: request.turnId,
            arm: 'openai/gpt-oss-20b',
            trial: 0,
            lesson: request.lessonId,
            turn: campaign.rows.length,
          },
          (id) => (traceId = id),
        ),
      );
      const result = await teacher.run(request, signal, options);
      campaign.rows.push({
        id: request.turnId,
        taskId: request.turnId,
        contextId: request.context.listening!.passageId,
        suite: 'live-ui-demo',
        arm: config.forgeModel,
        trial: 0,
        turn: campaign.rows.length,
        request,
        output: result.response,
        scores: scoreListening(
          request,
          result.response,
          true,
          result.calls.length,
          result.toolResults.length,
        ),
        tools: result.toolResults,
        calls: result.calls,
        review: result.review ?? null,
        judges: [],
        traceId,
        failure: result.failure,
        elapsedMs: performance.now() - start,
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
await app.listen({ host: '127.0.0.1', port: 3000 });
await writeFile(
  resolve('../listening-implementation-baseline/demo-session.json'),
  JSON.stringify({
    token,
    directory,
    mode: 'loopback-only ephemeral demonstration; not production invitation storage',
  }),
  { mode: 0o600 },
);
await atomicJson(join(directory, 'manifest.json'), {
  source: 'original-study-only',
  createdAt: new Date().toISOString(),
  serverSha256: digest(await readFile(join(root, 'scripts/listening-demo-server.ts'))),
  ephemeralRepository: true,
  scope: 'Actual production route and teacher, test-only invitation persistence',
  noUserFiles: true,
});
console.info('Loopback demo ready. Session token kept in a private local file.');
async function close() {
  await app.close();
  process.exit(0);
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
