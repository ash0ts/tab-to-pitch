import { describe, it, expect } from 'vitest';
import {
  scoreRun,
  personalBestKey,
  STAGE_POLICY,
  practiceSetSchema,
  defaultPracticeSet,
  type StageRun,
} from './contracts';
import { timelineEvents, visibleEvents } from './timeline-events';
import { backupSchema } from '../storage';
import type { AttemptRecord, ScoreDocument, ScoreTrack } from '../engine/types';
const run: StageRun = {
  id: 'r',
  mode: 'challenge',
  policy: STAGE_POLICY,
  sourceId: 'score',
  taskVersion: 'note-name:v1',
  input: 'screen',
  tempo: 1,
  support: 'hidden',
  startedAt: 100,
  capability: { qualified: true, timingQualified: false },
  targetExerciseIds: ['a', 'b', 'c'],
  attemptIds: ['a', 'b', 'c'],
  assisted: false,
};
function attempt(id: string, outcome: AttemptRecord['outcome'] = 'correct'): AttemptRecord {
  return {
    id,
    exerciseId: id,
    scoreId: 'score',
    trackId: 'track',
    skillId: 'note-name',
    kind: 'note-name',
    noteIds: [],
    response: 'C',
    outcome,
    assisted: false,
    hintsUsed: [],
    startedAt: 110,
    answeredAt: 120,
    responseMs: 10,
    mode: 'recall',
    partition: 'practice',
    evidence: 'answer',
    episodeId: id,
    responseIndex: 0,
  };
}
describe('practice-stage-v1: evidence integrity', () => {
  it('scores fixed targets once, without multipliers, and keeps timing unqualified', () => {
    const s = scoreRun(
      { ...run, attemptIds: ['a', 'a', 'b', 'c'] },
      ['a', 'b', 'c'].map((id) => attempt(id)),
    );
    expect(s).toMatchObject({ points: 300, combo: 3, bestCombo: 3, ranked: true });
    expect(run.capability.timingQualified).toBe(false);
  });
  it('keeps the first error when a retry is correct', () => {
    const s = scoreRun({ ...run, attemptIds: ['a', 'retry', 'b', 'c'] }, [
      attempt('a', 'incorrect'),
      { ...attempt('retry'), exerciseId: 'a', episodeId: 'a', responseIndex: 1, assisted: true },
      attempt('b'),
      attempt('c'),
    ]);
    expect(s.points).toBe(200);
    expect(s.incorrect).toBe(1);
    expect(s.bestCombo).toBe(2);
    expect(s.ranked).toBe(false);
  });
  it('withholds a ranked result for unknown, stale, missing or assisted evidence', () => {
    for (const bad of [
      { ...attempt('b'), scoreId: 'old' },
      { ...attempt('b'), startedAt: 20 },
      { ...attempt('b'), assisted: true },
      { ...attempt('b'), outcome: 'interrupted' as const },
    ])
      expect(scoreRun(run, [attempt('a'), bad, attempt('c')]).ranked).toBe(false);
    expect(scoreRun(run, [attempt('a'), attempt('c')]).unassessed).toBe(1);
    expect(
      scoreRun(
        { ...run, assisted: true },
        ['a', 'b', 'c'].map((id) => attempt(id)),
      ).ranked,
    ).toBe(false);
  });
  it('never counts self-reported playing as knowledge success', () => {
    expect(
      scoreRun(run, [{ ...attempt('a', 'self-reported'), evidence: 'self-report' }]).points,
    ).toBe(0);
  });
  it('requires the entire same target set for a personal best', () => {
    expect(scoreRun({ ...run, attemptIds: ['a'] }, [attempt('a')]).ranked).toBe(false);
    for (const changed of [
      { ...run, tempo: 0.75 },
      { ...run, taskVersion: 'other' },
      { ...run, targetExerciseIds: ['other'] },
    ])
      expect(personalBestKey(changed)).not.toBe(personalBestKey(run));
  });
  it('preserves older backups and validates additive studio data', () => {
    const backup = {
      schemaVersion: 4,
      exportedAt: 'now',
      attempts: [],
      variations: [],
      lessons: [],
      lessonEvents: [],
      exerciseDefinitions: [],
    };
    expect(backupSchema.safeParse(backup).success).toBe(true);
    expect(
      backupSchema.safeParse({ ...backup, studio: defaultPracticeSet(), stageRuns: [run] }).success,
    ).toBe(true);
    expect(practiceSetSchema.safeParse({ ...defaultPracticeSet(), workload: 999 }).success).toBe(
      false,
    );
  });
});
describe('playback timeline', () => {
  const track: ScoreTrack = {
    id: 't',
    index: 0,
    name: 'guitar',
    tuningMidi: [64, 59, 55, 50, 45, 40],
    capo: 0,
    notes: [
      {
        id: 'n',
        trackId: 't',
        staffIndex: 0,
        voiceIndex: 0,
        measureIndex: 1,
        beatId: 'b',
        onsetTicks: 4800,
        durationTicks: 960,
        soundingMidi: 60,
        spelling: 'C4',
        position: { string: 2, fret: 1 },
        effects: {},
        eligible: true,
      },
    ],
  };
  const score: ScoreDocument = {
    id: 's',
    hash: 's',
    title: 'repeat',
    tracks: [track],
    measures: [{ index: 1, startTicks: 3840, durationTicks: 3840, tempoBpm: 100, meter: [4, 4] }],
    playbackOccurrences: [
      { measureIndex: 1, occurrence: 0, startTick: 3840, endTick: 7680 },
      { measureIndex: 1, occurrence: 1, startTick: 7680, endTick: 11520 },
    ],
  };
  it('uses repeat occurrences and keeps physical string identity', () => {
    expect(timelineEvents(score, track, false).map((e) => [e.tick, e.string, e.label])).toEqual([
      [4800, 2, 'C'],
      [8640, 2, 'C'],
    ]);
  });
  it('includes sustained notes in a bounded event window', () => {
    const events = [
      { tick: 0, duration: 5000 },
      { tick: 100, duration: 10 },
      { tick: 4000, duration: 100 },
      { tick: 7000, duration: 100 },
    ];
    expect(visibleEvents(events, 3900, 4500, 5000)).toEqual([events[0], events[2]]);
  });
  it('leaves unknown positions unassigned', () => {
    const result = timelineEvents(
      score,
      { ...track, notes: track.notes.map((n) => ({ ...n, position: null })) },
      true,
    );
    expect(result[0]).toMatchObject({ string: null, fret: null, label: 'C4' });
  });
});
