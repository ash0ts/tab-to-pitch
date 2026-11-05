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
