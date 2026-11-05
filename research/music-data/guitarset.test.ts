import { describe, expect, it } from 'vitest';
import { makeCoachCase, normalizeRecording, recordingIdentity } from './guitarset.js';
import { createExerciseBank } from '../../src/engine/exercises.js';

// Authored boundary fixtures, separate from the downloaded performance dataset.
function fixture(
  options: { sourceString?: number; pitch?: number; unstable?: boolean; start?: number } = {},
) {
  const sourceString = options.sourceString ?? 0;
  const pitch = options.pitch ?? 47.08;
  const start = options.start ?? 0.1;
  const annotations: unknown[] = [];
  for (let string = 0; string < 6; string++) {
    const active = string === sourceString;
    const time = active
      ? [start + 0.01, start + 0.03, start + 0.05, start + 0.07, start + 0.09]
      : [];
    annotations.push({
      namespace: 'pitch_contour',
      annotation_metadata: { data_source: String(string) },
      data: {
        time,
        duration: time.map(() => 0.01),
        value: time.map((_, i) => ({
          voiced: true,
          index: i,
          frequency: 440 * 2 ** ((pitch + (options.unstable ? i * 0.3 : 0) - 69) / 12),
        })),
      },
    });
    annotations.push({
      namespace: 'note_midi',
      annotation_metadata: { data_source: String(string) },
      data: active
        ? [start, start + 0.3].map((time) => ({
            time,
            duration: 0.2,
            value: pitch,
            confidence: null,
          }))
        : [],
    });
    // Both attacks must have contour support.
    if (active) {
      const contour = (
        annotations[annotations.length - 2] as {
          data: { time: number[]; duration: number[]; value: unknown[] };
        }
      ).data;
      contour.time.push(...time.map((t) => t + 0.3));
      contour.duration.push(...contour.duration);
      contour.value.push(...contour.value);
    }
  }
  annotations.push({
    namespace: 'tempo',
    annotation_metadata: { data_source: '' },
    data: [{ time: 0, duration: 2, value: 120, confidence: 1 }],
  });
  annotations.push({
    namespace: 'beat_position',
    annotation_metadata: { data_source: '' },
    data: [
      {
        time: 0,
        duration: 0,
        value: { position: 1, measure: 1, beat_units: 4, num_beats: 4 },
        confidence: null,
      },
    ],
  });
  return Buffer.from(
    JSON.stringify({
      file_metadata: { title: 'authored boundary fixture', duration: 2 },
      annotations,
    }),
  );
}

describe('GuitarSet research adapter', () => {
  it('maps source low E to physical string 6 without sorting tuning and retains fractional pitch', () => {
    const result = normalizeRecording('05_BN3-154-E_solo', fixture());
    expect(result.score.tracks[0]!.tuningMidi).toEqual([64, 59, 55, 50, 45, 40]);
    const note = result.score.tracks[0]!.notes[0]!;
    expect(note.position).toEqual({ string: 6, fret: 7 });
    expect(note.soundingMidi).toBe(47); // Independently known B2.
    expect(note.spelling).toBeNull();
    expect(note.onsetTicks).toBe(192); // 0.1 s at 120 BPM, 960 PPQ.
    expect(result.sourceNotes[0]!.observedMidi).toBe(47.08);
    expect(note.eligible).toBe(true);
  });
  it('maps source high E to string 1 and rejects a pitch below its open string', () => {
    const high = normalizeRecording(
      '05_BN3-154-E_solo',
      fixture({ sourceString: 5, pitch: 64.03 }),
    );
    expect(high.score.tracks[0]!.notes[0]!.position).toEqual({ string: 1, fret: 0 });
    const impossible = normalizeRecording(
      '05_BN3-154-E_solo',
      fixture({ sourceString: 5, pitch: 60.02 }),
    );
    expect(impossible.sourceNotes[0]!.exclusionReasons).toContain('outside-24-fret-neck');
    expect(makeCoachCase(impossible)).toBeNull();
  });
  it('does not round away a bent/unstable contour, off-grid pitch or negative attack', () => {
    expect(
      normalizeRecording('05_BN3-154-E_solo', fixture({ unstable: true })).sourceNotes[0]!
        .exclusionReasons,
    ).toContain('unstable-contour');
    expect(
      normalizeRecording('05_BN3-154-E_solo', fixture({ pitch: 47.4 })).sourceNotes[0]!
        .exclusionReasons,
    ).toContain('off-grid-pitch');
    const negative = normalizeRecording('05_BN3-154-E_solo', fixture({ start: -0.1 }));
    expect(negative.sourceNotes[0]!.exclusionReasons).toContain('outside-recording-time');
    expect(negative.score.tracks[0]!.notes.some((n) => n.onsetTicks < 0)).toBe(false);
  });
  it('withholds unsupported theory and keeps learner evidence empty', () => {
    const result = normalizeRecording('05_BN3-154-E_solo', fixture());
    const bank = createExerciseBank(result.score, 'guitarset-track');
    expect(new Set(bank.map((e) => e.kind))).toEqual(new Set(['note-name', 'note-location']));
    const context = makeCoachCase(result)!;
    expect(context.context.evidence).toEqual([]);
    expect(context.evidenceBasis).toBe('real-recorded-music-with-no-learner-history');
    expect(context.context.candidates.length).toBeGreaterThan(0);
  });
  it('excludes known errata without silently rewriting source observations', () => {
    const result = normalizeRecording('02_Funk2-119-G_comp', fixture());
    expect(result.split).toBe('upstream-erratum');
    expect(result.sourceNotes[0]!.exclusionReasons).toContain('upstream-erratum');
    expect(result.sourceNotes[0]!.timeSeconds).toBe(0.1);
    expect(makeCoachCase(result)).toBeNull();
  });
  it('keeps both performer and entire progression family out of other primary splits', () => {
    expect(recordingIdentity('00_BN1-129-Eb_comp').split).toBe('train');
    expect(recordingIdentity('04_Jazz2-110-Bb_solo').split).toBe('validation');
    expect(recordingIdentity('05_BN3-154-E_comp').split).toBe('test');
    expect(recordingIdentity('04_BN1-129-Eb_comp').split).toBe('cross-group');
    expect(recordingIdentity('00_BN3-154-E_comp').split).toBe('cross-group');
    expect(() => recordingIdentity('unknown')).toThrow('Unexpected GuitarSet');
  });
});
