import { describe, it, expect } from 'vitest';
import { guitarHomeworkCases } from './cases';
import { teacherRequestSchema } from '../../src/shared/teacher';
import { localTeacher, resolveTeacherAction, validateTeacherTurn } from '../../src/engine/teacher';
describe('guitar-homework-v1 frozen boundaries', () => {
  for (const c of guitarHomeworkCases())
    it(c.id, () => {
      const before = JSON.stringify(c.request),
        turn = localTeacher(c.request);
      expect(validateTeacherTurn(turn, c.request)).not.toBeNull();
      expect(JSON.stringify(c.request)).toBe(before);
      expect(turn.actions.every((a) => !!resolveTeacherAction(c.request, a))).toBe(true);
      if (c.id === 'stop-quizzing' || c.id === 'help-active') expect(turn.actions).toEqual([]);
      if (c.id === 'after-playing') expect(turn.message).toContain('does not verify');
      expect(
        resolveTeacherAction(c.request, {
          type: 'playing-homework',
          operation: 'retry',
          stepId: 'invented',
        }),
      ).toBeNull();
    });
  it('requires explicit v5 negotiation and rejects an active action', () => {
    const request = guitarHomeworkCases()[0]!.request;
    expect(
      teacherRequestSchema.safeParse({ ...request, schemaVersion: 'teacher-v4' }).success,
    ).toBe(false);
    expect(
      teacherRequestSchema.safeParse({ ...request, capabilities: ['teaching-practice-v1'] })
        .success,
    ).toBe(false);
    request.context.playingHomework!.active = true;
    expect(
      resolveTeacherAction(request, {
        type: 'playing-homework',
        operation: 'retry',
        stepId: 'authored-c-f',
      }),
    ).toBeNull();
  });
});
