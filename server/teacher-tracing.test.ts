import { expect, it, vi } from 'vitest';
import { readConfig } from './config.js';
import { teacherConversationId } from './teacher-identity.js';
import { createTraceRunner } from './tracing.js';

it('reconstructs private lesson identity after restart and isolates invitations and lessons', () => {
  const id = teacherConversationId('secret', 'invitation', 'lesson');
  expect(id).toMatch(/^[\da-f-]{36}$/);
  expect(teacherConversationId('secret', 'invitation', 'lesson')).toBe(id);
  expect(teacherConversationId('secret', 'other', 'lesson')).not.toBe(id);
  expect(teacherConversationId('secret', 'invitation', 'other')).not.toBe(id);
  expect(teacherConversationId('rotated', 'invitation', 'lesson')).not.toBe(id);
});

it('groups turns by opaque lesson identity while giving every request its own trace tree', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const spans: { attributes: Record<string, unknown>; traceId: string; parent?: string }[] = [];
  const config = {
    ...readConfig({}),
    cloudEnabled: true,
    tracingEnabled: true,
    forgeProject: 'test/project',
    forgeApiKey: 'test-key',
  };
  const runner = createTraceRunner(
    config,
    {
      spanProcessor: {
        onStart() {},
        onEnd(span) {
          spans.push({ attributes: { ...span.attributes }, traceId: span.spanContext().traceId });
        },
        async forceFlush() {},
        async shutdown() {},
      },
    },
    { agentName: 'tab-to-pitch-teacher', policy: 'teacher-v1', prompt: 'teacher-tools-v1' },
  );
  const lessonId = teacherConversationId('secret', 'invitation', 'private-lesson');
  const otherId = teacherConversationId('secret', 'invitation', 'other-lesson');
  try {
    for (const conversationId of [lessonId, lessonId, otherId]) {
      await runner.run(
        async (trace) => {
          expect(trace.id).toBe(conversationId);
          await trace.model(
            'actor-model',
            async () => ({ text: 'Private learner content' }),
            () => ({ inputTokens: 8 }),
          );
          trace.tool('inspect_harmony', () => ({ secret: 'private-song' }));
        },
        { conversationId },
      );
    }
    const turns = spans.filter(
      (span) => span.attributes['gen_ai.operation.name'] === 'invoke_agent',
    );
    expect(turns).toHaveLength(3);
    expect(turns.map((span) => span.attributes['gen_ai.conversation.id'])).toEqual([
      lessonId,
      lessonId,
      otherId,
    ]);
    expect(new Set(turns.map((span) => span.traceId)).size).toBe(3);
    expect(JSON.stringify(spans)).not.toMatch(
      /private-lesson|private-song|Private learner content/,
    );
  } finally {
    await runner.close();
    warning.mockRestore();
  }
});
