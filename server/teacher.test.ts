import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../src/shared/arrangements.js';
import {
  CURRICULUM_VERSION,
  TEACHER_PROMPT_VERSION,
  TEACHER_VERSION,
  type TeacherRequest,
  teacherRequestSchema,
} from '../src/shared/teacher.js';
import { readConfig } from './config.js';
import { ForgeTeacherAgent, TEACHER_TOKEN_RESERVATION } from './teacher.js';

export function teacherFixture(): TeacherRequest {
  return {
    schemaVersion: TEACHER_VERSION,
    requestId: randomUUID(),
    lessonId: randomUUID(),
    turnId: randomUUID(),
    contextVersion: 'test-context-1',
    request: 'Can you explain what we can work on?',
    context: {
      objective: 'foundations',
      music: {
        tuning: [64, 59, 55, 50, 45, 40],
        capo: 0,
        key: { tonic: 'C', mode: 'ionian' },
        selectedSpan: 0,
        spans: ['Dm7', 'G7', 'Cmaj7', 'Am7'].map((symbol, i) => ({
          symbol,
          confirmed: true,
          startTick: i * 3840,
          endTick: (i + 1) * 3840,
          melody: [],
        })),
      },
      constraints: { ...DEFAULT_ARRANGEMENT_CONSTRAINTS },
      bass: [
        { spanIndex: 0, midi: 38, source: 'authored' },
        { spanIndex: 1, midi: 43, source: 'authored' },
        { spanIndex: 2, midi: 36, source: 'authored' },
        { spanIndex: 3, midi: 45, source: 'authored' },
      ],
      evidence: [],
      history: [],
      exposures: [],
      activeQuestion: null,
    },
  };
}
const config = {
  ...readConfig({}),
  forgeApiKey: 'test-key',
  forgeProject: 'test/project',
  tracingEnabled: false,
};
const final = {
  kind: 'final',
  message: 'Would you like to explore the chord tones or hear a comparison?',
  actions: [],
  factRefs: [],
  referenceIds: [],
  claims: [],
};
const accepted = { approved: true, issues: [] };

it('refuses conflicting bass/evidence facts and requires assisted help before inference', async () => {
  const duplicateBass = teacherFixture();
  duplicateBass.context.bass.push(duplicateBass.context.bass[0]!);
  expect(teacherRequestSchema.safeParse(duplicateBass).success).toBe(false);
  const collision = teacherFixture();
  collision.context.evidence.push({
    id: 'harmony:0',
    kind: 'chord-tone',
    outcome: 'correct',
    assisted: false,
    response: 'F',
    mode: 'recall',
    elapsedDays: 0,
  });
  expect(teacherRequestSchema.safeParse(collision).success).toBe(false);
  const request = teacherFixture();
  request.context.activeQuestion = { id: 'question', kind: 'chord-tone', assisted: false };
  const fetcher = vi.fn();
  const result = await new ForgeTeacherAgent(config, fetcher).run(
    request,
    AbortSignal.timeout(2000),
  );
  expect(result.failure).toBe('assistance-required');
  expect(result.chargedTokens).toBe(0);
  expect(result.response.actions).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
function completion(value: unknown, knownUsage = true) {
  return Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
    ...(knownUsage
      ? { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }
      : {}),
  });
}
function modelFetcher(values: unknown[], bodies: unknown[] = []) {
  let index = 0;
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/models'))
      return Response.json({ data: [{ id: config.forgeModel }] });
    bodies.push(JSON.parse(String(init?.body)));
    return completion(values[index++]);
  });
}

it('runs free-form teaching with deterministic inspection followed by an independent critic', async () => {
  const bodies: unknown[] = [];
  const fetcher = modelFetcher(
    [{ kind: 'tools', calls: [{ name: 'inspect_music', args: {} }] }, final, accepted],
    bodies,
  );
  const agent = new ForgeTeacherAgent(config, fetcher);
  const result = await agent.run(teacherFixture(), AbortSignal.timeout(2000));
  expect(result.response).toMatchObject({
    source: 'forge',
    review: { status: 'passed' },
    versions: {
      policy: TEACHER_VERSION,
      prompt: TEACHER_PROMPT_VERSION,
      curriculum: CURRICULUM_VERSION,
    },
  });
  expect(result.calls.map((call) => call.role)).toEqual(['actor', 'actor', 'critic']);
  expect(result.toolResults[0]?.result.status).toBe('ok');
  expect(result.chargedTokens).toBe(450);
  expect(JSON.stringify(bodies[2])).toContain(final.message);
  expect(JSON.stringify(bodies[2])).toContain('verifiedFacts');
  const first = bodies[0] as { messages: { content: string }[] };
  const grounded = JSON.parse(first.messages[1]!.content);
  expect(grounded.verifiedFacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'instrument' }),
      expect.objectContaining({ id: 'harmony:0' }),
      expect.objectContaining({ id: 'tone:0:b7' }),
    ]),
  );
  const second = bodies[1] as { messages: { content: string }[] };
  const results = JSON.parse(second.messages.at(-1)!.content).result;
  expect(results[0].result.facts.some((fact: { id: string }) => fact.id === 'instrument')).toBe(
    false,
  );
  expect(results[0].result.factRefs).toContain('instrument');
  await agent.close();
});

it.each([
  { kind: 'final', message: 'Would you like to inspect this chord?' },
  { ...final, message: '' },
])('repairs an incomplete final envelope once without bypassing its critic', async (malformed) => {
  const bodies: unknown[] = [];
  const result = await new ForgeTeacherAgent(
    config,
    modelFetcher([malformed, final, accepted], bodies),
  ).run(teacherFixture(), AbortSignal.timeout(2000));
  expect(result.response.source).toBe('forge');
  expect(result.calls.map((call) => call.role)).toEqual(['actor', 'actor', 'critic']);
  expect(result.calls[0]).toMatchObject({ status: 'failed', failure: 'schema-validation' });
  expect(result.chargedTokens).toBe(450);
  expect(JSON.stringify(bodies[1])).toContain('final-envelope');
  expect(JSON.stringify(bodies[2])).toContain(final.message);
});

it('does not repair twice or repair invalid musical action fields', async () => {
  const malformed = { kind: 'final', message: 'An incomplete response.' };
  const twice = await new ForgeTeacherAgent(
    config,
    modelFetcher([malformed, malformed, final, accepted]),
  ).run(teacherFixture(), AbortSignal.timeout(2000));
  expect(twice.failure).toBe('invalid-response');
  expect(twice.calls).toHaveLength(2);
  const invalidAction = await new ForgeTeacherAgent(
    config,
    modelFetcher([{ ...final, actions: [{ type: 'overwrite-score' }] }, final, accepted]),
  ).run(teacherFixture(), AbortSignal.timeout(2000));
  expect(invalidAction.failure).toBe('invalid-response');
  expect(invalidAction.calls).toHaveLength(1);
});

it('counts a format repair against the four-call budget and does not retry null provider output', async () => {
  const step = { kind: 'tools', calls: [{ name: 'inspect_music', args: {} }] };
  const exhausted = await new ForgeTeacherAgent(
    config,
    modelFetcher([step, step, step, { kind: 'final', message: '' }, final, accepted]),
  ).run(teacherFixture(), AbortSignal.timeout(2000));
  expect(exhausted.failure).toBe('invalid-response');
  expect(exhausted.calls).toHaveLength(4);
  const fetcher: typeof fetch = async (url) =>
    String(url).endsWith('/models')
      ? Response.json({ data: [{ id: config.forgeModel }] })
      : Response.json({
          choices: [{ finish_reason: null, message: { content: null } }],
          usage: { prompt_tokens: 2480, completion_tokens: 17, total_tokens: 2497 },
        });
  const empty = await new ForgeTeacherAgent(config, fetcher).run(
    teacherFixture(),
    AbortSignal.timeout(2000),
  );
  expect(empty.failure).toBe('invalid-response');
  expect(empty.calls).toHaveLength(1);
  expect(empty.chargedTokens).toBe(2497);
});

it('withholds prose rejected by the critic and preserves the failure alongside fallback', async () => {
  const actor = { ...final, message: 'Playing in a new position always changes the mode.' };
  const fetcher = modelFetcher([
    actor,
    {
      approved: false,
      issues: [
        {
          excerpt: actor.message,
          code: 'unsupported-claim',
          reason: 'Mode also needs a tonal center.',
          evidenceRefs: [],
        },
      ],
    },
  ]);
  const result = await new ForgeTeacherAgent(config, fetcher).run(
    teacherFixture(),
    AbortSignal.timeout(2000),
  );
  expect(result.response.source).toBe('local');
  expect(result.response.message).not.toBe(actor.message);
  expect(result.failure).toMatch(/critic-rejected|invalid-response/);
  expect(result.response.review.status).toBe('withheld');
});

it('counts tools across actor calls and rejects the ninth before executing it', async () => {
  const step = {
    kind: 'tools',
    calls: Array.from({ length: 3 }, () => ({ name: 'inspect_music', args: {} })),
  };
  const fetcher = modelFetcher([step, step, step]);
  const result = await new ForgeTeacherAgent(config, fetcher).run(
    teacherFixture(),
    AbortSignal.timeout(2000),
  );
  expect(result.failure).toBe('tool-limit');
  expect(result.toolResults).toHaveLength(6);
  expect(result.calls).toHaveLength(3);
});

it('does not spend critic credits on structurally invalid or invented actions', async () => {
  const fetcher = modelFetcher([
    { ...final, actions: [{ type: 'highlight', spanIndex: 7, degree: '9' }] },
  ]);
  const result = await new ForgeTeacherAgent(config, fetcher).run(
    teacherFixture(),
    AbortSignal.timeout(2000),
  );
  expect(result.failure).toBe('invalid-response');
  expect(result.calls.map((call) => call.role)).toEqual(['actor']);
});

it('keeps all-call reservation when critic usage is missing and otherwise accepts its valid review', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url) =>
    String(url).endsWith('/models')
      ? Response.json({ data: [{ id: config.forgeModel }] })
      : completion(++calls === 1 ? final : accepted, calls === 1);
  const result = await new ForgeTeacherAgent(config, fetcher).run(
    teacherFixture(),
    AbortSignal.timeout(2000),
  );
  expect(result.response.source).toBe('forge');
  expect(result.chargedTokens).toBe(TEACHER_TOKEN_RESERVATION);
});

it('exhausts four actor calls without turning a missing final response into a success', async () => {
  const step = { kind: 'tools', calls: [{ name: 'inspect_music', args: {} }] };
  const fetcher = modelFetcher([step, step, step, step]);
  const result = await new ForgeTeacherAgent(config, fetcher).run(
    teacherFixture(),
    AbortSignal.timeout(2000),
  );
  expect(result.failure).toBe('actor-limit');
  expect(result.calls).toHaveLength(4);
  expect(result.response.source).toBe('local');
});

it('retains a validated demonstration when the critic fails while withholding actor prose', async () => {
  const action = { type: 'highlight', spanIndex: 0, degree: 'b3' };
  const fetcher = modelFetcher([
    { kind: 'tools', calls: [{ name: 'demonstrate', args: { action } }] },
    { ...final, actions: [action] },
    {
      approved: true,
      issues: [
        {
          excerpt: 'fabricated excerpt',
          code: 'contradiction',
          reason: 'Unsupported',
          evidenceRefs: [],
        },
      ],
    },
  ]);
  const result = await new ForgeTeacherAgent(config, fetcher).run(
    teacherFixture(),
    AbortSignal.timeout(2000),
  );
  expect(result.failure).toBe('invalid-response');
  expect(result.response.actions).toEqual([action]);
  expect(result.response.message).not.toBe(final.message);
  expect(result.response.review.status).toBe('withheld');
});

it('cancels an in-flight critic and charges its unknown usage conservatively', async () => {
  const controller = new AbortController();
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/models'))
      return Response.json({ data: [{ id: config.forgeModel }] });
    if (++calls === 1) return completion(final);
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
      started();
    });
  };
  const running = new ForgeTeacherAgent(config, fetcher).run(teacherFixture(), controller.signal);
  await waiting;
  controller.abort();
  const result = await running;
  expect(result.failure).toBe('cancelled-or-timeout');
  expect(result.chargedTokens).toBe(TEACHER_TOKEN_RESERVATION);
  expect(result.calls.map((call) => call.status)).toEqual(['received', 'failed']);
});

it('keeps a voicing continuation inside the bounded request envelope', async () => {
  const request = teacherFixture(),
    bodies: unknown[] = [];
  const intent = {
    action: 'propose',
    reason: 'requested',
    operation: 'move',
    targetQuality: null,
    substituteSymbol: null,
    constraints: { ...request.context.constraints },
  };
  const fetcher = modelFetcher(
    [{ kind: 'tools', calls: [{ name: 'explore_voicings', args: { intent } }] }, final, accepted],
    bodies,
  );
  const result = await new ForgeTeacherAgent(config, fetcher).run(
    request,
    AbortSignal.timeout(2000),
  );
  expect(result.response.source).toBe('forge');
  expect(result.toolResults[0]?.result.status).toBe('ok');
  expect(bodies.length).toBe(3);
  expect(bodies.every((body) => Buffer.byteLength(JSON.stringify(body)) <= 32768)).toBe(true);
});


it('negotiates integrated capabilities without changing legacy requests', () => {
  const legacy = teacherFixture();
  expect(teacherRequestSchema.safeParse(legacy).success).toBe(true);
  const integrated = { ...legacy, schemaVersion: 'teacher-v5', capabilities: [] };
  expect(teacherRequestSchema.safeParse(integrated).success).toBe(true);
  expect(teacherRequestSchema.safeParse({ ...integrated, capabilities: undefined }).success).toBe(false);
  expect(teacherRequestSchema.safeParse({ ...integrated, capabilities: ['listening-v1'] }).success).toBe(false);
  expect(teacherRequestSchema.safeParse({ ...integrated, capabilities: ['practice-stage-v1', 'practice-stage-v1'] }).success).toBe(false);
});

it('keeps live help behind assistance and advertises eligible live tools within the existing request budget', async () => {
  const { fixture } = await import('../research/live-guitar-v1/teacher-cases.js');
  const fetcher = vi.fn();
  const blocked = await new ForgeTeacherAgent(config, fetcher).run(
    fixture(11),
    AbortSignal.timeout(2000),
  );
  expect(blocked.failure).toBe('assistance-required');
  expect(fetcher).not.toHaveBeenCalled();
  const bodies: unknown[] = [];
  const result = await new ForgeTeacherAgent(config, modelFetcher([final, accepted], bodies)).run(
    fixture(0),
    AbortSignal.timeout(2000),
  );
  expect(result.response.source).toBe('forge');
  const body = bodies[0] as { tools: { function: { name: string } }[] };
  expect(body.tools.map((t) => t.function.name)).toContain('inspect_live_input');
  expect(body.tools.map((t) => t.function.name)).toContain('live_activity');
  expect(body.tools.map((t) => t.function.name)).not.toContain('homework_map');
});

it('withholds invented fingering claims when the independent reviewer rejects them', async () => {
  const { fixture } = await import('../research/live-guitar-v1/teacher-cases.js');
  const message = 'You used the E shape and every string sounded clean.';
  const result = await new ForgeTeacherAgent(
    config,
    modelFetcher([
      { ...final, message },
      {
        approved: false,
        issues: [
          {
            code: 'unsupported-claim',
            excerpt: message,
            evidenceRefs: ['live-boundary'],
            reason: 'Experimental pitch detection cannot establish fret positions or technique.',
          },
        ],
      },
    ]),
  ).run(fixture(1), AbortSignal.timeout(2000));
  expect(result.failure).toBe('critic-rejected');
  expect(result.response.source).toBe('local');
  expect(result.response.review.status).toBe('withheld');
  expect(result.response.message).not.toContain('every string sounded clean');
});
