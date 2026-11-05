import { it, expect } from 'vitest';
import { cases, requestFor } from './cases';
import { teacherRequestSchema } from '../../src/shared/teacher';
it('keeps arbitrary audio harmony unconfirmed and separates condition repetitions', () => {
  const original = { id: 'original', reference: [{ midi: 65, start: 0, end: 4 }], actual: [] };
  const sources = Array.from({ length: 12 }, (_, i) => ({
    id: 'recording-' + i,
    reference: [{ midi: 62, start: 1, end: 2 }],
    actual: [],
  }));
  const suite = cases(sources, original);
  expect(suite.development).toHaveLength(24);
  expect(suite.checkpoints).toHaveLength(144);
  expect(suite.episodes).toHaveLength(36);
  expect(suite.boundaries).toHaveLength(36);
  for (const c of [...suite.checkpoints, ...suite.episodes, ...suite.boundaries]) {
    const request = requestFor(c, c.id);
    expect(teacherRequestSchema.safeParse(request).success).toBe(true);
    expect(request.context.music.spans.every((s) => !s.confirmed && s.symbol === null)).toBe(true);
  }
  expect(new Set(suite.checkpoints.map((c) => c.contextId)).size).toBe(12);
});
