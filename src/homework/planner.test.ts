import { describe, it, expect } from 'vitest';
import { playingPlan, homeworkLiveTask, stepLiveTask } from './planner';
import { makeHomeworkTask } from '../engine/homework';
import { STANDARD_TUNING as tuning, noteAt } from '../engine/caged';
import { assessPerformance } from '../live/assessment';
import { LIVE_VERSION, type PerformanceObservation } from '../shared/live-guitar';
import { buildHomeworkStudy, homeworkVariation } from '../player/homework-study';
import { importer, model } from '@coderline/alphatab';
import { buildVariationScore } from '../player/variation';
import { playingStateSchema } from '../shared/homework-playing';
const region = { minFret: 0, maxFret: 5 };
const plan = playingPlan(
  'original-c-study',
  tuning,
  0,
  region,
  ['C', 'F', 'G', 'C'].map((symbol, i) => ({ symbol, ticks: 3840, startTick: i * 3840 })),
  15,
);
function observation(pitch: number, i: number): PerformanceObservation {
  return {
    version: LIVE_VERSION,
    sessionId: 'test',
    sequence: i,
    provider: 'browser-audio',
    detectorVersion: 'independent-fixture',
    captureMs: i * 100,
    receivedMs: i * 100,
    attackId: i,
    pitches: [pitch],
    chords: [],
    kind: 'note',
    stable: true,
    rms: 0.1,
    clarity: 0.99,
    problems: [],
  };
}
function result(index: number, pitches: number[]) {
  const t = stepLiveTask(plan[index]!)!;
  return assessPerformance(t, pitches.map(observation), t.sourceRevision).outcome;
}
describe('guitar homework musical contracts', () => {
  it('asks for one pitch class rather than every accepted coordinate', () => {
    const old = makeHomeworkTask('locate', 'C', 'A', region, tuning, 0)!;
    const task = homeworkLiveTask(old, 'source')!;
    expect(task.pitches).toHaveLength(1);
    expect(result(0, [48])).toBe('match');
    expect(result(0, [72])).toBe('match');
    expect(result(0, [49])).toBe('discrepancy');
    expect(homeworkLiveTask({ ...old, variant: null }, 'source')).toBeNull();
  });
  it('accepts every ordering of the selected triad, but rejects a missing or duplicated tone', () => {
    const i = plan.findIndex((s) => s.objective === 'fragment'),
      p = plan[i]!.pitches;
    expect(new Set(p.map((n) => n % 12))).toEqual(new Set([0, 4, 7]));
    for (const permutation of [
      [p[2]!, p[0]!, p[1]!],
      [p[1]! + 12, p[2]!, p[0]!],
    ])
      expect(result(i, permutation)).toBe('match');
    expect(result(i, [p[0]!, p[0]!, p[2]!])).toBe('discrepancy');
    expect(result(i, p.slice(0, 2))).toBe('unassessed');
    expect(result(i, [...p, p[0]!])).toBe('discrepancy');
  });
  it('requires F to the E below, while allowing a different register', () => {
    const i = plan.findIndex((s) => s.objective === 'connection');
    expect(result(i, [53, 52])).toBe('match');
    expect(result(i, [53, 64])).toBe('discrepancy');
    expect(result(i, [64, 65])).toBe('discrepancy');
  });
  it('retains two regions and keeps creative playing outside sound grading', () => {
    expect(plan.filter((s) => s.objective === 'progression').map((s) => s.region)).toEqual([
      region,
      { minFret: 5, maxFret: 9 },
    ]);
    expect(stepLiveTask(plan.find((s) => s.objective === 'phrase')!)).toBeNull();
  });
  it('accounts for capo and does not invent CAGED for an incompatible tuning', () => {
    for (const capo of [0, 2])
      for (const step of playingPlan('capo', tuning, capo, region, [], 15))
        for (const [i, p] of step.fragment.entries())
          expect(noteAt(p, tuning, capo)).toBe(step.pitches[i]);
    expect(
      playingPlan('drop-d', [64, 59, 55, 50, 45, 38], 0, region, [], 15).some((s) => s.family),
    ).toBe(false);
  });
  it('preserves source backing, meter and chord timing in progression play-along', () => {
    const step = plan.find((s) => s.objective === 'progression')!;
    const study = {
      step,
      tuning,
      capo: 0,
      tempo: 84,
      example: false,
      countIn: true,
      responseMeasures: 1 as const,
      restMeasures: 1,
    };
    const source = importer.ScoreLoader.loadAlphaTex(
      '\\tempo 84 \\track "Guitar" \\instrument 25 . 0.6.1 | 0.6.1 | 0.6.1 | 0.6.1 \\track "Backing" . 0.5.1 | 0.5.1 | 0.5.1 | 0.5.1',
    );
    const before = model.JsonConverter.scoreToJsObject(source);
    const derived = buildVariationScore(source, 0, homeworkVariation(study)!);
    expect(model.JsonConverter.scoreToJsObject(source)).toEqual(before);
    expect(
      derived.tracks[1]!.staves[0]!.bars.map((b) => b.voices[0]!.beats[0]!.notes[0]!.realValue),
    ).toEqual([45, 45, 45, 45]);
    expect(derived.masterBars.map((b) => b.calculateDuration())).toEqual([3840, 3840, 3840, 3840]);
    const pitches = derived.tracks[0]!.staves[0]!.bars.map(
      (b) => new Set(b.voices[0]!.beats[0]!.notes.map((n) => n.realValue % 12)),
    );
    expect(pitches).toEqual([
      new Set([0, 4, 7]),
      new Set([5, 9, 0]),
      new Set([7, 11, 2]),
      new Set([0, 4, 7]),
    ]);
  });
  it('auditions proposed coordinates intact and adds explicit rest measures', () => {
    const step = plan.find((s) => s.objective === 'progression')!;
    const score = buildHomeworkStudy({
      step,
      tuning,
      capo: 0,
      tempo: 84,
      example: true,
      countIn: true,
      responseMeasures: 1,
      restMeasures: 2,
    });
    expect(score.masterBars).toHaveLength(6);
    const notes = score.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes;
    expect(notes.map((n) => ({ string: 7 - n.string, fret: n.fret }))).toEqual(
      step.progression[0]!.positions,
    );
    expect(score.tracks[0]!.staves[0]!.bars.at(-1)!.voices[0]!.beats.every((b) => b.isRest)).toBe(
      true,
    );
  });
  it('rejects an out-of-range resume index', () => {
    expect(
      playingStateSchema.safeParse({
        version: 'homework-playing-v1',
        steps: plan,
        index: 999,
        method: 'self-report',
        labels: true,
        countIn: true,
        responseMeasures: 1,
        restMeasures: 1,
        status: 'ready',
        episodeId: crypto.randomUUID(),
        responseIndex: 0,
        startedAt: null,
        support: [],
        attemptIds: [],
      }).success,
    ).toBe(false);
  });
});
