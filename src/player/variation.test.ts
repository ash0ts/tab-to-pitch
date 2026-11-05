import { describe, expect, it } from 'vitest';
import { importer, model } from '@coderline/alphatab';
import { buildVariationScore } from './variation';
import { DEMO_ALPHATEX } from './demo';
import { adaptScore } from '../engine/adapter';
import { generateVoicings, parseChordSymbol } from '../engine/harmony';
import type { ProgressionVariation, VariationEvent } from '../engine/harmony';

function source(): model.Score {
  return importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX);
}
function event(
  score: model.Score,
  startTick: number,
  endTick: number,
  symbol = 'G',
  melodyMidi?: number,
): VariationEvent {
  const staff = score.tracks[0]!.staves[0]!;
  const voicing = generateVoicings(parseChordSymbol(symbol)!, staff.tuning, staff.capo, {
    voiceCount: 3,
    omitFifth: false,
    melodyMidi,
  }).voicings[0];
  if (!voicing) throw new Error('Test voicing unavailable');
  return { spanId: `${startTick}-${endTick}`, startTick, endTick, voicing };
}
function variation(events: VariationEvent[]): ProgressionVariation {
  return {
    id: 'test',
    version: 'test',
    events,
    cost: 0,
    totalMotion: 0,
    commonTones: 0,
    maxFretJump: 0,
    omittedDegrees: [],
  };
}
function json(score: model.Score): { masterBars: unknown[]; tracks: unknown[] } {
  return JSON.parse(model.JsonConverter.scoreToJson(score));
}
function beats(score: model.Score, bar = 0) {
  return score.tracks[0]!.staves[0]!.bars[bar]!.voices[0]!.beats;
}

describe('derived alphaTab variation score', () => {
  it('preserves the original, every backing track, unselected bars, and repeat/tempo metadata', () => {
    const original = importer.ScoreLoader.loadAlphaTex(String.raw`\tempo 90
\track "Guitar" \instrument 25 \tuning E4 B3 G3 D3 A2 E2
. \ro 0.1.1 | \tempo 120 \ae 1 \rc 2 1.1.1 | \ae 2 2.1.1
\track "Bass" \instrument 33 \tuning G2 D2 A1 E1
0.4.1 | 3.4.1 | 0.3.1`);
    const before = model.JsonConverter.scoreToJson(original);
    const derived = buildVariationScore(original, 0, variation([event(original, 3840, 7680, 'C')]));
    expect(model.JsonConverter.scoreToJson(original)).toBe(before);
    expect(derived === original).toBe(false);
    expect(json(derived).masterBars).toEqual(json(original).masterBars);
    expect(json(derived).tracks[1]).toEqual(json(original).tracks[1]);
    for (const index of [0, 2]) {
      expect(
        beats(derived, index).map((beat) =>
          beat.notes.map((note) => [note.string, note.fret, note.realValue]),
        ),
      ).toEqual(
        beats(original, index).map((beat) =>
          beat.notes.map((note) => [note.string, note.fret, note.realValue]),
        ),
      );
    }
    const from = adaptScore(original, 'source');
    const to = adaptScore(derived, 'derived');
    expect(to.playbackOccurrences).toEqual(from.playbackOccurrences);
    expect(to.tempoEvents).toEqual(from.tempoEvents);
  });
  it('resolves real alphaTab ties across barlines without adding another note attack', () => {
    const original = source();
    const derived = buildVariationScore(original, 0, variation([event(original, 0, 7680)]));
    const first = beats(derived, 0)[0]!;
    const second = beats(derived, 1)[0]!;
    expect(first.playbackDuration).toBe(3840);
    expect(second.playbackDuration).toBe(3840);
    for (const destination of second.notes) {
      expect(destination.isTieDestination).toBe(true);
      expect(destination.tieOrigin).toBe(
        first.notes.find((note) => note.string === destination.string),
      );
      expect(destination.tieOrigin?.tieDestination).toBe(destination);
    }
    const notes = adaptScore(derived, 'derived').tracks[0]!.notes;
    expect(
      notes.filter((note) => note.onsetTicks === 0).every((note) => note.durationTicks === 7680),
    ).toBe(true);
    expect(
      notes.filter((note) => note.onsetTicks === 3840).every((note) => note.effects.tieDestination),
    ).toBe(true);
  });
  it('preserves exact unusual durations and melody changes through alphaTab serialization', () => {
    const original = source();
    const events = [
      event(original, 0, 360, 'C', 72),
      event(original, 360, 1000, 'C', 76),
      event(original, 1000, 3840, 'C', 79),
    ];
    const derived = buildVariationScore(original, 0, variation(events));
    expect(
      beats(derived).map((beat) => [beat.absolutePlaybackStart, beat.playbackDuration]),
    ).toEqual([
      [0, 360],
      [360, 640],
      [1000, 2840],
    ]);
    expect(
      beats(derived).map((beat) => Math.max(...beat.notes.map((note) => note.realValue))),
    ).toEqual([72, 76, 79]);
    expect(
      beats(derived)
        .flatMap((beat) => beat.notes)
        .every((note) => !note.isTieDestination),
    ).toBe(true);
  });
  it('retains automation at an interior source beat and ties the continuing harmony', () => {
    const original = source();
    const automation = new model.Automation();
    automation.type = model.AutomationType.Volume;
    automation.value = 70;
    beats(original)[1]!.automations.push(automation);
    const before = model.JsonConverter.scoreToJson(original);
    const derived = buildVariationScore(original, 0, variation([event(original, 0, 3840)]));
    expect(beats(derived).map((beat) => beat.absolutePlaybackStart)).toEqual([0, 960]);
    expect(beats(derived)[1]!.automations).toHaveLength(1);
    expect(beats(derived)[1]!.automations[0]).toMatchObject({
      type: model.AutomationType.Volume,
      value: 70,
    });
    expect(
      beats(derived)[1]!.notes.every((note) => note.isTieDestination && note.tieOrigin !== null),
    ).toBe(true);
    expect(model.JsonConverter.scoreToJson(original)).toBe(before);
  });
  it('maps physical string order and applies capo exactly once to actual sounding pitch', () => {
    const original = source();
    original.tracks[0]!.staves[0]!.capo = 2;
    const selected = event(original, 0, 3840, 'A');
    const derived = buildVariationScore(original, 0, variation([selected]));
    for (const expected of selected.voicing.notes) {
      const actual = beats(derived)[0]!.notes.find(
        (note) => note.string === 7 - expected.position.string,
      )!;
      expect(actual.fret).toBe(expected.position.fret);
      expect(actual.realValue).toBe(expected.midi);
    }
    expect(derived.tracks[0]!.staves[0]!.capo).toBe(2);
  });
  it('inserts a timed rest for a gap instead of sustaining across it', () => {
    const original = source();
    const derived = buildVariationScore(
      original,
      0,
      variation([event(original, 0, 960), event(original, 1920, 3840)]),
    );
    expect(
      beats(derived).map((beat) => [
        beat.absolutePlaybackStart,
        beat.playbackDuration,
        beat.isRest,
      ]),
    ).toEqual([
      [0, 960, false],
      [960, 960, true],
      [1920, 1920, false],
    ]);
    expect(beats(derived)[2]!.notes.every((note) => !note.isTieDestination)).toBe(true);
  });
  it('rejects partial bars, out-of-score spans, noninteger ticks, and overlapping events', () => {
    const original = source();
    for (const events of [
      [event(original, 1, 3840)],
      [event(original, 0, 3839)],
      [event(original, 0, 16000)],
      [event(original, 20000, 24000)],
      [event(original, 0, Number.NaN)],
      [event(original, 0, 3840.5)],
      [event(original, 0, 3840), event(original, 1920, 7680)],
    ]) {
      expect(() => buildVariationScore(original, 0, variation(events))).toThrow();
    }
  });
  it('rejects colliding strings, mismatched tuning, unsupported instruments, and transposition', () => {
    const original = source();
    const selected = event(original, 0, 3840);
    const duplicate = structuredClone(selected);
    duplicate.voicing.notes[1]!.position.string = duplicate.voicing.notes[0]!.position.string;
    expect(() => buildVariationScore(original, 0, variation([duplicate]))).toThrow(
      /distinct physical strings/,
    );
    const wrongPitch = structuredClone(selected);
    wrongPitch.voicing.notes[0]!.midi += 12;
    expect(() => buildVariationScore(original, 0, variation([wrongPitch]))).toThrow(/tuning/);
    expect(() => buildVariationScore(original, 1, variation([selected]))).toThrow(/six-string/);
    original.tracks[0]!.staves[0]!.transpositionPitch = 12;
    expect(() => buildVariationScore(original, 0, variation([selected]))).toThrow(/transposition/);
  });
});
