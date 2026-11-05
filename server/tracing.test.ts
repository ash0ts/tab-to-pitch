import { expect, it, vi } from 'vitest';
import { readConfig } from './config.js';
import { createTraceRunner } from './tracing.js';
import { COACH_POLICY_VERSION, COACH_PROMPT_VERSION } from '../src/shared/coach.js';

it('uses the installed Forge SDK to emit only metadata and fixed messages', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const spans: Record<string, unknown>[] = [];
  const config = {
    ...readConfig({}),
    cloudEnabled: true,
    tracingEnabled: true,
    forgeProject: 'test/project',
    forgeApiKey: 'test-key',
  };
  const runner = createTraceRunner(config, {
    spanProcessor: {
      onStart() {},
      onEnd(span) {
        spans.push({ ...span.attributes });
      },
      async forceFlush() {},
      async shutdown() {},
    },
  });
  try {
    const result = await runner.run(async (trace) => {
      expect(trace.id).toMatch(/^[\da-f-]{36}$/);
      const modelResult = await trace.model(
        'test-model',
        async () => ({ secret: 'learner-secret-song-title', tokens: 12 }),
        (value) => ({ inputTokens: value.tokens }),
      );
      return trace.tool('choose_drill', () => modelResult.secret);
    });
    expect(result).toBe('learner-secret-song-title');
    const serialized = JSON.stringify(spans);
    expect(spans.length).toBeGreaterThanOrEqual(3);
    expect(serialized).toContain('choose_drill');
    expect(serialized).toContain('test-model');
    expect(serialized).not.toContain('learner-secret');
    expect(serialized).not.toContain('test-key');
    expect(serialized).toContain('no-learner-content');
    expect(serialized).toContain(COACH_POLICY_VERSION);
    expect(serialized).toContain(COACH_PROMPT_VERSION);
  } finally {
    await runner.close();
    warning.mockRestore();
  }
});

it('marks post-model validation failures on the turn without tracing the original error', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const spans: {
    operation: unknown;
    status: { code: number; message?: string };
    attributes: unknown;
    events: unknown;
  }[] = [];
  const runner = createTraceRunner(
    {
      ...readConfig({}),
      cloudEnabled: true,
      tracingEnabled: true,
      forgeProject: 'test/project',
      forgeApiKey: 'test-key',
    },
    {
      spanProcessor: {
        onStart() {},
        onEnd(span) {
          spans.push({
            operation: span.attributes['gen_ai.operation.name'],
            status: { ...span.status },
            attributes: { ...span.attributes },
            events: span.events,
          });
        },
        async forceFlush() {},
        async shutdown() {},
      },
    },
  );
  const original = new Error('learner-secret-invalid-tool-arguments');
  try {
    await expect(
      runner.run(async (trace) => {
        await trace.model(
          'test-model',
          async () => ({}),
          () => ({ inputTokens: 8 }),
        );
        throw original;
      }),
    ).rejects.toBe(original);
    expect(spans.find((span) => span.operation === 'invoke_agent')?.status).toEqual({
      code: 2,
      message: 'Coach attempt failed',
    });
    expect(spans.find((span) => span.operation === 'chat')?.status.code).not.toBe(2);
    const serialized = JSON.stringify(spans);
    expect(serialized).toContain('Coach attempt failed');
    expect(serialized).not.toContain('learner-secret');
    expect(serialized).not.toContain('test-key');
  } finally {
    await runner.close();
    warning.mockRestore();
  }
});
