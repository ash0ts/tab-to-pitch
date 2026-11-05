import { describe, expect, it } from 'vitest';
import { cases, fixture } from './teacher-cases';
import {
  localTeacher,
  resolveTeacherAction,
  createTeacherToolRuntime,
} from '../../src/engine/teacher';
import { aggregate, fixtures, replay } from './replay';

describe('live teacher fixtures', () => {
  for (const [index, c] of cases.entries())
    it(c.id, () => {
      const request = fixture(index),
        turn = localTeacher(request);
      expect(turn.message).not.toMatch(/you (mastered|used the|played perfectly)/i);
      if (c.outcome === 'unassessed' || c.outcome === 'interrupted')
        expect(turn.message).not.toContain('You played it incorrectly');
      if (c.id === 'stop' || c.id === 'help-active') expect(turn.actions).toEqual([]);
      if (c.id === 'change-goal') expect(turn.actions).toEqual([{ type: 'live', taskId: 'live-note' }]);
      if (c.id === 'retry') expect(turn.message).toContain('separate from unassisted first attempts');
      expect(resolveTeacherAction(request, { type: 'live', taskId: 'invented' })).toBeNull();
      if (!request.context.live!.active) {
        expect(resolveTeacherAction(request, { type: 'live', taskId: 'live-note' })).not.toBeNull();
        const tool = createTeacherToolRuntime(request).execute({
          name: 'inspect_live_input',
          args: {},
        });
        expect(tool.facts.some((f) => f.id === 'live-boundary')).toBe(true);
      }
    });
});
it('reports abstention separately from classification errors and preserves missing denominators', () => {
  const row = replay(fixtures().find((r) => r.condition === 'silence')!);
  const summary = aggregate([row])[0]!;
  expect(summary.precision).toBeNull();
  expect(summary.coverage).toBeNull();
  expect(summary.falseMatchesOnUnknown?.numerator).toBe(0);
});
