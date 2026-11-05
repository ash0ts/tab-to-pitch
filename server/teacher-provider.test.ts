import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { readConfig } from './config.js';
import { TeacherProvider, teacherProviderSchema } from './teacher-provider.js';
import { TEACHER_TOKEN_RESERVATION } from './teacher-limits.js';

const config = { ...readConfig({}), forgeProject: 'test/project', forgeApiKey: 'secret' };
const trace = {
  model: async <T>(_name: string, work: () => Promise<T>) => work(),
  tool: <T>(_name: string, work: () => T) => work(),
};
const schema = z.object({ value: z.string() }).strict();
const result = (usage = true) =>
  Response.json({
    choices: [{ finish_reason: 'stop', message: { content: '{"value":"ok"}' } }],
    ...(usage ? { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } } : {}),
  });

it('projects the provider grammar while keeping runtime key validation intact', () => {
  const keyed = z.object({ args: z.record(z.string().regex(/^allowed$/), z.number()) }).strict();
  expect(JSON.stringify(teacherProviderSchema(keyed))).not.toContain('propertyNames');
  expect(() => keyed.parse({ args: { forbidden: 1 } })).toThrow();
});

it('shares the reservation across four actors and one critic and refuses extra calls', async () => {
  const fetcher = vi.fn(async () => result());
  const provider = new TeacherProvider(config, fetcher, trace, AbortSignal.timeout(1000));
  for (let i = 0; i < 4; i++) await provider.complete('actor', [], schema);
  await provider.complete('critic', [], schema);
  await expect(provider.complete('actor', [], schema)).rejects.toThrow();
  await expect(provider.complete('critic', [], schema)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(provider.chargedTokens).toBe(750);
  expect(provider.calls.map((call) => call.role)).toEqual([
    'actor',
    'actor',
    'actor',
    'actor',
    'critic',
  ]);
});

it('reserves unknown critic usage and refuses oversized messages before inference', async () => {
  let count = 0;
  const fetcher = vi.fn(async () => result(++count === 1));
  const provider = new TeacherProvider(config, fetcher, trace, AbortSignal.timeout(1000));
  await provider.complete('actor', [], schema);
  await provider.complete('critic', [], schema);
  expect(provider.chargedTokens).toBe(TEACHER_TOKEN_RESERVATION);
  const large = new TeacherProvider(config, fetcher, trace, AbortSignal.timeout(1000));
  await expect(
    large.complete('actor', [{ role: 'user', content: 'é'.repeat(20_000) }], schema),
  ).rejects.toThrow();
  expect(large.chargedTokens).toBe(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('retains reservation for network failures and rejects pre-cancelled requests without a call', async () => {
  const fetcher = vi.fn(async () => {
    throw new Error('network');
  });
  const provider = new TeacherProvider(config, fetcher, trace, AbortSignal.timeout(1000));
  await expect(provider.complete('actor', [], schema)).rejects.toThrow('network');
  expect(provider.chargedTokens).toBe(TEACHER_TOKEN_RESERVATION);
  const cancelled = new TeacherProvider(config, fetcher, trace, AbortSignal.abort());
  await expect(cancelled.complete('actor', [], schema)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(cancelled.chargedTokens).toBe(0);
});
