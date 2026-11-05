import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { localTeacher } from '../src/engine/teacher.js';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../src/shared/arrangements.js';
import { TEACHER_VERSION, type TeacherRequest } from '../src/shared/teacher.js';
import { buildApp } from './app.js';
import { invitationHash, newToken } from './auth.js';
import { readConfig } from './config.js';
import { InMemoryTestRepository } from './test-repository.js';
import { TEACHER_TOKEN_RESERVATION, type TeacherAgent } from './teacher.js';

const config = {
  ...readConfig({ NODE_ENV: 'test' }),
  cloudEnabled: true,
  teacherEnabled: true,
  databaseUrl: 'test-only',
  sessionSecret: 's'.repeat(32),
};
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function request(): TeacherRequest {
  return {
    schemaVersion: TEACHER_VERSION,
    requestId: randomUUID(),
    lessonId: randomUUID(),
    turnId: randomUUID(),
    contextVersion: 'context-1',
    request: 'Explain D minor seventh.',
    context: {
      objective: 'foundations',
      constraints: { ...DEFAULT_ARRANGEMENT_CONSTRAINTS },
      music: {
        tuning: [64, 59, 55, 50, 45, 40],
        capo: 0,
        key: { tonic: 'C', mode: 'ionian' },
        selectedSpan: 0,
        spans: [{ symbol: 'Dm7', confirmed: true, startTick: 0, endTick: 3840, melody: [] }],
      },
      bass: [],
      evidence: [],
      history: [],
      exposures: [],
      activeQuestion: null,
    },
  };
}
function cloudResult(r: TeacherRequest) {
  const response = localTeacher(r);
  response.source = 'forge';
  response.review = { status: 'passed', reasons: [] };
  response.versions.model = config.forgeModel;
  delete response.fallbackReason;
  return { response, chargedTokens: 250, calls: [], toolResults: [] };
}
async function setup(
  options: { agent?: TeacherAgent; maxTokens?: number; teacherEnabled?: boolean } = {},
) {
  const repository = new InMemoryTestRepository(),
    token = newToken(),
    id = randomUUID();
  await repository.createInvitation({
    id,
    tokenHash: invitationHash(token),
    expiresAt: new Date('2030-01-01'),
    maxTokens: options.maxTokens ?? 2_000_000,
  });
  const agent = options.agent ?? {
    run: vi.fn(async (r: TeacherRequest) => cloudResult(r)),
    close: async () => {},
  };
  const app = await buildApp({
    config: { ...config, teacherEnabled: options.teacherEnabled ?? true },
    repository,
    teacherAgent: agent,
    agent: { run: vi.fn(), close: async () => {} },
    arrangementAgent: { run: vi.fn(), close: async () => {} },
  });
  apps.push(app);
  const exchange = await app.inject({
    method: 'POST',
    url: '/api/invitations/exchange',
    headers: { origin: config.publicOrigin },
    payload: { invitation: token },
  });
  const cookie = String(exchange.headers['set-cookie']).split(';')[0]!;
  const submit = (r: TeacherRequest) =>
    app.inject({
      method: 'POST',
      url: '/api/teacher/next',
      headers: { origin: config.publicOrigin, cookie },
      payload: r,
    });
  return { app, repository, id, agent, cookie, submit };
}

it('requires teacher opt-in, a session, strict privacy context and the allowed origin', async () => {
  const disabled = await setup({ teacherEnabled: false });
  expect((await disabled.submit(request())).json().fallbackReason).toBe('disabled');
  expect(disabled.agent.run).not.toHaveBeenCalled();
  const { app, agent, cookie, submit } = await setup();
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/teacher/next',
        headers: { origin: config.publicOrigin },
        payload: request(),
      })
    ).json().fallbackReason,
  ).toBe('session-required');
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/%61pi/teacher/next',
        headers: { origin: 'https://elsewhere.example', cookie },
        payload: request(),
      })
    ).statusCode,
  ).toBe(403);
  const invalid = request();
  Object.assign(invalid.context, { filename: 'private-song.gp' });
  expect((await submit(invalid)).statusCode).toBe(400);
  expect(agent.run).not.toHaveBeenCalled();
});

it('deduplicates turns, accounts for both models, and does not return internal tool results', async () => {
  const { submit, repository, id, agent } = await setup();
  const r = request();
  const response = (await submit(r)).json();
  expect(response.source).toBe('forge');
  expect(response).not.toHaveProperty('toolResults');
  expect(response).not.toHaveProperty('calls');
  expect(repository.invitations.get(id)).toMatchObject({ used: 250, reserved: 0 });
  expect((await submit(r)).json().fallbackReason).toBe('duplicate');
  expect(agent.run).toHaveBeenCalledTimes(1);
  const options = vi.mocked(agent.run).mock.calls[0]![2];
  expect(options?.conversationId).toMatch(/^[a-f0-9-]{36}$/);
  expect(options?.conversationId).not.toBe(r.lessonId);
});

it('does not increase old invitation allowances to fit teacher reservations', async () => {
  const { submit, repository, id, agent } = await setup({ maxTokens: 100_000 });
  expect((await submit(request())).json().fallbackReason).toBe('budget');
  expect(repository.invitations.get(id)).toMatchObject({ maxTokens: 100_000, used: 0 });
  expect(agent.run).not.toHaveBeenCalled();
});

it('rejects stale responses and rechecks invitation revocation after generation', async () => {
  const stale = {
    run: vi.fn(async (r: TeacherRequest) => {
      const result = cloudResult(r);
      result.response.contextVersion = 'old';
      return result;
    }),
    close: async () => {},
  };
  const first = await setup({ agent: stale });
  expect((await first.submit(request())).json().fallbackReason).toBe('invalid-response');
  let revoke = () => {};
  const revoked = {
    run: vi.fn(async (r: TeacherRequest) => {
      revoke();
      return cloudResult(r);
    }),
    close: async () => {},
  };
  const second = await setup({ agent: revoked });
  revoke = () => {
    second.repository.invitations.delete(second.id);
  };
  expect((await second.submit(request())).json().fallbackReason).toBe('session-required');
});

it('reserves concurrent requests atomically and retains failed settlements', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const agent = {
    run: vi.fn(async (r: TeacherRequest) => {
      started();
      await pending;
      return cloudResult(r);
    }),
    close: async () => {},
  };
  const { submit, repository, id } = await setup({ agent, maxTokens: TEACHER_TOKEN_RESERVATION });
  const first = submit(request());
  await began;
  expect((await submit(request())).json().fallbackReason).toBe('budget');
  repository.settleBudget = async () => {
    throw new Error('Database unavailable');
  };
  release();
  expect((await first).json().source).toBe('forge');
  expect(repository.invitations.get(id)).toMatchObject({
    used: 0,
    reserved: TEACHER_TOKEN_RESERVATION,
  });
});

it('fails closed on invalid returned accounting', async () => {
  const agent = {
    run: vi.fn(async (r: TeacherRequest) => ({ ...cloudResult(r), chargedTokens: -1 })),
    close: async () => {},
  };
  const { submit, repository, id } = await setup({ agent });
  expect((await submit(request())).json().source).toBe('local');
  expect(repository.invitations.get(id)).toMatchObject({
    used: TEACHER_TOKEN_RESERVATION,
    reserved: 0,
  });
});
