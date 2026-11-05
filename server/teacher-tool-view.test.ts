import { expect, it } from 'vitest';
import { teacherToolView } from './teacher-tool-view.js';
import { createTeacherToolRuntime } from '../src/engine/teacher.js';
import { requestFor, developmentCases } from '../research/listening-agent/cases.js';
it('preserves physical notes, spelling and omissions while dropping repeated voicing identifiers', () => {
  const request = requestFor(developmentCases[0]!, 'projection');
  const result = createTeacherToolRuntime(request).execute({
    name: 'explore_voicings',
    args: {
      intent: {
        action: 'propose',
        reason: 'requested',
        operation: 'move',
        targetQuality: null,
        substituteSymbol: null,
        constraints: request.context.constraints,
      },
    },
  });
  expect(result.status).toBe('ok');
  const projected = teacherToolView('explore_voicings', result);
  expect(projected.facts).toEqual(result.facts);
  expect(projected.actions).toEqual(result.actions);
  const full = result.data as any,
    compact = projected.data as any;
  compact.candidates.forEach((candidate: any, i: number) =>
    candidate.events.forEach((event: any, j: number) =>
      event.notes.forEach((note: any, k: number) => {
        const expected = full.candidates[i].events[j].notes[k];
        expect(note).toEqual({
          string: expected.position.string,
          fret: expected.position.fret,
          midi: expected.midi,
          degree: expected.degree,
          noteName: expected.noteName,
        });
      }),
    ),
  );
  expect(JSON.stringify(projected).length).toBeLessThan(JSON.stringify(result).length);
});

it('bounds history while preserving current musical facts and separate evidence', async () => {
  const { teacherContextView } = await import('./teacher-tool-view');
  const { guitarHomeworkCases } = await import('../research/guitar-homework/cases');
  const context = guitarHomeworkCases()[0]!.request.context;
  context.history = Array.from({ length: 8 }, (_, i) => ({
    role: 'user' as const,
    text: `Question ${i}: ` + 'x'.repeat(2000),
  }));
  const view = teacherContextView(context);
  expect(view.history).toHaveLength(4);
  expect(view.history[0]!.text).toContain('Question 4:');
  expect(view.historyIsExcerpt).toBe(true);
  expect(view.history.every((m) => m.text.length < 650)).toBe(true);
  expect(view.music).toEqual(context.music);
  expect(view.evidence).toEqual(context.evidence);
  expect(context.history).toHaveLength(8);
});
