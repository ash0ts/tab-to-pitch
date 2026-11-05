import { describe, expect, it } from 'vitest';
import { createHarmonyExercises } from './harmony-exercises';
import { gradeExercise } from './assessment';
import { findNotePositions } from './exploration';
import { generateVoicings, parseChordSymbol } from './harmony';
import type { HarmonySpan, ProgressionVariation } from './harmony';
import { STANDARD_TUNING } from './theory';
import type { NoteEvent, ScoreDocument, ScoreTrack } from './types';

function fixture(symbols = ['Cmaj7', 'Dm7'], capo = 0) {
  const notes: NoteEvent[] = [];
  const spans: HarmonySpan[] = symbols.map((symbol, index) => {
    const chord = parseChordSymbol(symbol)!;
    const sourceNoteIds = chord.tones.map((tone, toneIndex) => {
      const midi = 48 + chord.rootPitchClass + tone.semitones;
      const id = `${index}:${toneIndex}`;
      notes.push({
        id,
        trackId: 'guitar',
        staffIndex: 0,
        voiceIndex: 0,
        measureIndex: index,
        beatId: `b${index}`,
        onsetTicks: index * 3840,
        durationTicks: 3840,
        soundingMidi: midi,
        spelling: null,
        position: findNotePositions(midi, STANDARD_TUNING, capo, { match: 'exact' })[0] ?? null,
        effects: {},
        eligible: true,
      });
      return id;
    });
    return {
      id: `s${index}`,
      startTick: index * 3840,
      endTick: (index + 1) * 3840,
      sourceNoteIds,
      chord,
      confirmation: 'confirmed',
      source: 'manual',
    };
  });
  const track: ScoreTrack = {
    id: 'guitar',
    index: 0,
    name: 'Guitar',
    tuningMidi: [...STANDARD_TUNING],
    capo,
    notes,
  };
  const score: ScoreDocument = {
    id: 'song',
    hash: 'songhash',
    title: 'Original test',
    tracks: [track],
    measures: symbols.map((_, index) => ({
      index,
      startTicks: index * 3840,
      durationTicks: 3840,
      tempoBpm: 90,
      meter: [4, 4],
    })),
  };
  return { score, track, spans };
}
function variant(symbol: string, span: HarmonySpan): ProgressionVariation {
  const voicing = generateVoicings(parseChordSymbol(symbol)!, STANDARD_TUNING, 0, { voiceCount: 4 })
    .voicings[0]!;
  return {
    id: 'changed',
    version: 'test',
    events: [{ spanId: span.id, startTick: span.startTick, endTick: span.endTick, voicing }],
    cost: 0,
    totalMotion: 0,
    commonTones: 0,
    maxFretJump: 0,
    omittedDegrees: voicing.omittedDegrees,
  };
}

describe('harmony exercise grading boundaries', () => {
  it('grades sevenths and extensions from confirmed context and preserves source data', () => {
    const data = fixture(['C9']);
    const before = structuredClone(data);
    const bank = createHarmonyExercises(data.score, data.track, data.spans);
    const seventh = bank.find(
      (exercise) =>
        exercise.kind === 'chord-tone' && exercise.explanation.includes('minor seventh'),
    )!;
    const ninth = bank.find(
      (exercise) => exercise.kind === 'chord-tone' && exercise.explanation.includes('ninth'),
    )!;
    expect(gradeExercise(seventh, 'b7').correct).toBe(true);
    expect(gradeExercise(seventh, 'major seventh').correct).toBe(false);
    expect(gradeExercise(ninth, 'ninth').correct).toBe(true);
    expect(gradeExercise(ninth, 'root').correct).toBe(false);
    expect(
      bank.every((exercise) =>
        exercise.mask.noteIds.every((id) => data.spans[0]!.sourceNoteIds.includes(id)),
      ),
    ).toBe(true);
    expect(data).toEqual(before);
  });
  it('does not turn suggested labels, unsupported notes, or empty source references into grading evidence', () => {
    const data = fixture(['Cmaj7']);
    data.spans[0]!.confirmation = 'suggested';
    expect(createHarmonyExercises(data.score, data.track, data.spans)).toEqual([]);
    data.spans[0]!.confirmation = 'confirmed';
    data.track.notes.forEach((note) => {
      note.effects.slide = true;
    });
    expect(createHarmonyExercises(data.score, data.track, data.spans)).toEqual([]);
    data.spans[0]!.sourceNoteIds = [];
    expect(createHarmonyExercises(data.score, data.track, data.spans)).toEqual([]);
  });
  it('accepts every valid next-chord target in the selected region, including capo and multiple octaves', () => {
    const data = fixture(['Cmaj7', 'Dm7'], 2);
    const target = createHarmonyExercises(data.score, data.track, data.spans, null, {
      minFret: 0,
      maxFret: 24,
    }).find((exercise) => exercise.kind === 'next-target')!;
    expect(target.answer.type).toBe('position');
    const expected = findNotePositions(65, data.track.tuningMidi, 2, { minFret: 0, maxFret: 24 });
    if (target.answer.type !== 'position') throw new Error('Expected position answer');
    expect(target.answer.positions).toEqual(expected);
    for (const position of expected)
      expect(gradeExercise(target, `${position.string}:${position.fret}`).correct).toBe(true);
    expect(gradeExercise(target, '1:0').correct).toBe(false);
    expect(target.mask.noteIds).toEqual([
      ...data.spans[0]!.sourceNoteIds,
      ...data.spans[1]!.sourceNoteIds,
    ]);
    expect(
      target.choices.filter((choice) => gradeExercise(target, choice.value).correct),
    ).toHaveLength(1);
  });
  it('withholds a next-target question when the next harmony is not confirmed', () => {
    const data = fixture();
    data.spans[1]!.confirmation = 'suggested';
    expect(
      createHarmonyExercises(data.score, data.track, data.spans).some(
        (exercise) => exercise.kind === 'next-target',
      ),
    ).toBe(false);
  });
  it('uses pitch-class grading for a genuinely added ninth and supplies bounded comparison audio', () => {
    const data = fixture(['Cmaj7']);
    const bank = createHarmonyExercises(
      data.score,
      data.track,
      data.spans,
      variant('Cmaj9', data.spans[0]!),
    );
    const exercise = bank.find((item) => item.kind === 'changed-tone')!;
    expect(gradeExercise(exercise, 'D').correct).toBe(true);
    expect(gradeExercise(exercise, 'D5').correct).toBe(true);
    expect(gradeExercise(exercise, 'C##').correct).toBe(true);
    expect(gradeExercise(exercise, 'Db').correct).toBe(false);
    expect(exercise.listeningExample).toHaveLength(2);
    expect(
      exercise
        .listeningExample!.flat()
        .every((midi) => Number.isInteger(midi) && midi >= 0 && midi <= 127),
    ).toBe(true);
  });
  it('does not present replacing a third as adding a note', () => {
    const data = fixture(['C']);
    const bank = createHarmonyExercises(
      data.score,
      data.track,
      data.spans,
      variant('Cm', data.spans[0]!),
    );
    expect(bank.some((exercise) => exercise.kind === 'changed-tone')).toBe(false);
  });
  it('does not present several additions as one uniquely identifiable added tone', () => {
    const data = fixture(['C']);
    const bank = createHarmonyExercises(
      data.score,
      data.track,
      data.spans,
      variant('Cmaj9', data.spans[0]!),
    );
    expect(bank.some((exercise) => exercise.kind === 'changed-tone')).toBe(false);
  });
});
