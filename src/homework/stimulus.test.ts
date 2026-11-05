import { describe, expect, it } from 'vitest';
import { playingPlan } from './planner';
import { homeworkConnections, homeworkHarmony, homeworkPositions } from './stimulus';
import { STANDARD_TUNING, noteAt } from '../engine/caged';
import { localTeacher, validateTeacherTurn } from '../engine/teacher';
import { guitarHomeworkCases } from '../../research/guitar-homework/cases';
import { playingContextSchema } from '../shared/homework-playing';

const plan = playingPlan(
  'original',
  STANDARD_TUNING,
  0,
  { minFret: 0, maxFret: 5 },
  ['C', 'F', 'G', 'C'].map((symbol) => ({ symbol, ticks: 3840 })),
  15,
);
const connection = plan.find((s) => s.objective === 'connection')!;
describe('one homework stimulus across explanation, diagram and playback', () => {
  it('uses G7 to Cmaj7 for the derived connection, without replacing the source progression', () => {
    expect(homeworkHarmony(connection).map((s) => s.symbol)).toEqual(['G7', 'Cmaj7']);
    expect(
      plan.find((s) => s.objective === 'progression')!.progression.map((s) => s.symbol),
    ).toEqual(['C', 'F', 'G', 'C']);
  });
  it('shows both endpoints and accepts only a descending semitone, including alternate registers', () => {
    const pairs = homeworkConnections(connection, STANDARD_TUNING, 0);
    expect(pairs.length).toBeGreaterThan(1);
    for (const pair of pairs) {
      expect(noteAt(pair.from, STANDARD_TUNING, 0)! % 12).toBe(5);
      expect(noteAt(pair.to, STANDARD_TUNING, 0)! - noteAt(pair.from, STANDARD_TUNING, 0)!).toBe(
        -1,
      );
    }
    expect(
      new Set(
        homeworkPositions(connection, STANDARD_TUNING, 0).map(
          (p) => noteAt(p, STANDARD_TUNING, 0)! % 12,
        ),
      ),
    ).toEqual(new Set([4, 5]));
    const capoPairs = homeworkConnections(connection, STANDARD_TUNING, 2);
    expect(capoPairs.length).toBeGreaterThan(0);
    expect(
      capoPairs.every(
        (p) => noteAt(p.to, STANDARD_TUNING, 2)! - noteAt(p.from, STANDARD_TUNING, 2)! === -1,
      ),
    ).toBe(true);
  });
  it('accepts older teacher clients and rejects a stimulus from another step', () => {
    const context = guitarHomeworkCases()[0]!.request.context.playingHomework!;
    expect(playingContextSchema.safeParse(context).success).toBe(true);
    expect(playingContextSchema.safeParse({ ...context, stimulus: connection }).success).toBe(
      false,
    );
  });
  it.each([
    ['Why is E the third of C major? Just explain.', /E is the major third of C/, /four semitones/],
    [
      'I found C but called it the root of F major. Is that role right?',
      /C is the fifth of F/,
      /F \(root\)/,
    ],
    [
      'Explain CAGED shape families without a quiz.',
      /parent shapes/,
      /sounding harmony stays the same/,
    ],
  ])('answers the musical question: %s', (question, answer, detail) => {
    const request = structuredClone(guitarHomeworkCases()[0]!.request);
    request.request = question;
    const turn = localTeacher(request);
    expect(turn.message).toMatch(answer);
    expect(turn.message).toMatch(detail);
    expect(turn.actions.some((a) => a.type === 'question')).toBe(false);
    expect(turn.message).not.toMatch(/^A sounding C does not establish|^Pick up the guitar/);
    expect(validateTeacherTurn(turn, request)).not.toBeNull();
  });
  it('does not reveal an explanation while an unassisted response is active', () => {
    const request = guitarHomeworkCases().find((c) => c.id === 'help-active')!.request;
    request.request = 'Why is E the third of C major?';
    expect(localTeacher(request).message).not.toContain('E is the third');
    expect(localTeacher(request).actions).toEqual([]);
  });
  it('explains both roles for the actual walkthrough question without treating a no-grading request as a playing claim', () => {
    const request = structuredClone(guitarHomeworkCases()[0]!.request);
    request.context.music.spans = homeworkHarmony(connection).map((span, index) => ({
      symbol: span.symbol,
      confirmed: true,
      startTick: index * 3840,
      endTick: (index + 1) * 3840,
      melody: [],
    }));
    request.context.music.selectedSpan = 0;
    request.context.bass = [];
    request.request =
      'I reported needs another pass. In G7 to Cmaj7, explain why F moves to E and show the two roles. Do not grade my playing.';
    const turn = localTeacher(request);
    expect(turn.message).toContain('F (minor seventh) can descend one semitone to E (major third)');
    expect(turn.actions).toEqual([
      { type: 'highlight', spanIndex: 0, degree: 'b7' },
      { type: 'highlight', spanIndex: 1, degree: '3' },
    ]);
    expect(validateTeacherTurn(turn, request)).not.toBeNull();
  });
});
