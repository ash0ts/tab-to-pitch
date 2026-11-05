import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES,
  analyzeHarmony,
  buildHarmonySpans,
  defineChord,
  extractMelodyAnchors,
  generateProgressionVariations,
  generateVoicings,
  harmonicFunction,
  parseChordSymbol,
  romanNumeral,
  scaleTones,
  voicingTransition,
} from './harmony';
import type { ChordDefinition, HarmonySpan } from './harmony';
import { parsePitch, pitchClass, STANDARD_TUNING } from './theory';
import type { NoteEvent, ScoreTrack } from './types';

function chord(symbol: string): ChordDefinition {
  const result = parseChordSymbol(symbol);
  if (!result) throw new Error(`Invalid test chord ${symbol}`);
  return result;
}
function note(midi: number, id = String(midi), onsetTicks = 0, durationTicks = 960): NoteEvent {
  return {
    id,
    trackId: 'guitar',
    staffIndex: 0,
    voiceIndex: 0,
    measureIndex: 0,
    beatId: `${onsetTicks}`,
    onsetTicks,
    durationTicks,
    soundingMidi: midi,
    spelling: null,
    position: { string: 1, fret: 0 },
    effects: {},
    eligible: true,
  };
}
function spans(symbols: string[]): HarmonySpan[] {
  return symbols.map((symbol, index) => ({
    id: `span${index}`,
    startTick: index * 960,
    endTick: (index + 1) * 960,
    sourceNoteIds: [`source${index}`],
    chord: chord(symbol),
    confirmation: 'confirmed',
    source: 'manual',
  }));
}

describe('general chord vocabulary', () => {
  it('constructs every supported chord with unique correctly spelled tones', () => {
    for (const template of CHORD_QUALITIES) {
      const value = defineChord('Bb', template.quality)!;
      expect(value.tones.length).toBe(template.degrees.length);
      expect(new Set(value.tones.map((tone) => tone.pitchClass)).size).toBe(value.tones.length);
      for (const tone of value.tones)
        expect(pitchClass(parsePitch(`${tone.noteName}4`)!)).toBe(tone.pitchClass);
      expect(parseChordSymbol(value.symbol)).toEqual(value);
    }
  });
  it('distinguishes added notes, dominant sevenths, and extended seventh qualities', () => {
    expect(chord('Cadd9').tones.map((tone) => tone.degree)).toEqual(['1', '3', '5', '9']);
    expect(chord('C9').tones.map((tone) => tone.degree)).toEqual(['1', '3', '5', 'b7', '9']);
    expect(chord('Cmaj9').tones.map((tone) => tone.degree)).toEqual(['1', '3', '5', '7', '9']);
    expect(chord('CmMaj7').tones.map((tone) => tone.degree)).toEqual(['1', 'b3', '5', '7']);
    expect(chord('Cdim7').tones.at(-1)).toMatchObject({
      degree: 'bb7',
      noteName: 'Bbb',
      pitchClass: 9,
    });
  });
  it('parses explicit slash bass and documented aliases without accepting arbitrary text', () => {
    expect(chord(' B♭m7/D♭ ')).toMatchObject({
      symbol: 'Bbm7/Db',
      rootPitchClass: 10,
      bassPitchClass: 1,
    });
    expect(chord('C6/9').quality).toBe('6/9');
    expect(chord('C6/9/E').bassName).toBe('E');
    expect(chord('Fø7').quality).toBe('m7b5');
    expect(chord('C+').quality).toBe('augmented');
    for (const invalid of ['H7', 'C7 go run this', 'Cwhatever', '', 'C/E/G', 'Cmaj99'])
      expect(parseChordSymbol(invalid)).toBeNull();
  });
  it('preserves accidental spelling through octave boundaries', () => {
    const value = defineChord('B#', 'major')!;
    expect(value.tones.map((tone) => tone.noteName)).toEqual(['B#', 'D##', 'F##']);
    const result = generateVoicings(value, [60, 64, 67], 0, {
      minFret: 0,
      maxFret: 0,
      voiceCount: 3,
      omitFifth: false,
    });
    expect(result.voicings[0]!.notes.map((item) => item.label)).toEqual(['B#3', 'D##4', 'F##4']);
  });
});

describe('analysis and source spans', () => {
  it('finds complete seventh and ninth chords without reducing them to triads', () => {
    expect(analyzeHarmony([60, 64, 67, 70].map((midi) => note(midi)))).toMatchObject({
      status: 'supported',
      interpretations: [{ chord: { symbol: 'C7' } }],
    });
    const ninth = analyzeHarmony([60, 64, 67, 70, 74].map((midi) => note(midi)));
    expect(ninth.interpretations.some((item) => item.chord.symbol === 'C9')).toBe(true);
  });
  it('reports ambiguous roots instead of selecting the first pitch-class match', () => {
    const result = analyzeHarmony([60, 64, 67, 69].map((midi) => note(midi)));
    expect(result.status).toBe('ambiguous');
    expect(result.interpretations.map((item) => item.chord.symbol)).toEqual(
      expect.arrayContaining(['C6', 'Am7']),
    );
    expect(analyzeHarmony([60, 64, 68].map((midi) => note(midi))).status).toBe('ambiguous');
    expect(analyzeHarmony([60, 62, 67].map((midi) => note(midi))).status).toBe('ambiguous');
  });
  it('labels omitted roots only under an explicit harmonic context', () => {
    const notes = [64, 67, 71].map((midi) => note(midi));
    expect(analyzeHarmony(notes).interpretations.map((item) => item.chord.symbol)).toEqual(['Em']);
    expect(analyzeHarmony(notes, chord('Cmaj7'))).toMatchObject({
      status: 'supported',
      interpretations: [{ contextual: true, omittedDegrees: ['1'], chord: { symbol: 'Cmaj7' } }],
    });
    expect(analyzeHarmony(notes, chord('C7')).status).toBe('unavailable');
  });
  it('excludes unsupported source articulations', () => {
    const bent = { ...note(64), effects: { bend: [{ offset: 0.5, semitones: 0.5 }] } };
    expect(analyzeHarmony([note(60), bent, note(67)]).status).toBe('unavailable');
  });
  it('uses overlapping durations and includes unsupported gaps and rests for confirmation', () => {
    const track: ScoreTrack = {
      id: 'guitar',
      index: 0,
      name: 'Guitar',
      tuningMidi: [...STANDARD_TUNING],
      capo: 0,
      notes: [note(60, 'c', 0, 960), note(64, 'e', 0, 480), note(67, 'g', 0, 480)],
    };
    const before = structuredClone(track);
    const result = buildHarmonySpans(track, 0, 1920);
    expect(result.map((span) => [span.startTick, span.endTick, span.confirmation])).toEqual([
      [0, 480, 'suggested'],
      [480, 960, 'unavailable'],
      [960, 1920, 'unavailable'],
    ]);
    expect(result[0]!.chord?.symbol).toBe('C');
    expect(result[2]!.sourceNoteIds).toEqual([]);
    expect(track).toEqual(before);
  });
  it('retains actual source bass in a suggested chord span', () => {
    const track: ScoreTrack = {
      id: 'g',
      index: 0,
      name: 'g',
      tuningMidi: [...STANDARD_TUNING],
      capo: 0,
      notes: [47, 50, 55, 62].map((midi) => note(midi)),
    };
    expect(buildHarmonySpans(track, 0, 960)[0]!.chord?.symbol).toBe('G/B');
  });
  it('does not union arpeggiated notes into an asserted chord', () => {
    const track: ScoreTrack = {
      id: 'g',
      index: 0,
      name: 'g',
      tuningMidi: [...STANDARD_TUNING],
      capo: 0,
      notes: [note(60, 'c', 0, 320), note(64, 'e', 320, 320), note(67, 'g', 640, 320)],
    };
    expect(buildHarmonySpans(track, 0, 960).every((span) => span.chord === null)).toBe(true);
    expect(buildHarmonySpans({ ...track, harmonySupported: false }, 0, 960)).toEqual([]);
  });
});

describe('bounded voicing generation', () => {
  it('supports 2–6 physical voices with no repeated string', () => {
    for (const voiceCount of [2, 3, 4, 5, 6] as const) {
      const result = generateVoicings(chord(voiceCount === 2 ? 'C5' : 'C'), STANDARD_TUNING, 0, {
        voiceCount,
        minFret: 0,
        maxFret: 12,
      });
      expect(result.status).toBe('ok');
      for (const voicing of result.voicings) {
        expect(voicing.notes.length).toBe(voiceCount);
        expect(new Set(voicing.notes.map((item) => item.position.string)).size).toBe(voiceCount);
        for (const item of voicing.notes)
          expect(item.midi).toBe(STANDARD_TUNING[item.position.string - 1]! + item.position.fret);
      }
    }
  });
  it('produces four-voice ninths and thirteenths with explicit omissions', () => {
    for (const symbol of ['Cmaj9', 'Dm9', 'G9', 'Dm11', 'Cmaj13', 'G13']) {
      const result = generateVoicings(chord(symbol), STANDARD_TUNING, 0, {
        minFret: 5,
        maxFret: 9,
        voiceCount: 4,
      });
      expect(result.status, symbol).toBe('ok');
      expect(
        result.voicings.every((voicing) =>
          voicing.presentDegrees.includes(chord(symbol).tones.at(-1)!.degree),
        ),
      ).toBe(true);
      expect(result.voicings.every((voicing) => voicing.omittedDegrees.includes('5'))).toBe(true);
    }
    expect(
      generateVoicings(chord('G9'), STANDARD_TUNING, 0, { voiceCount: 4, omitFifth: false }).status,
    ).toBe('no-match');
  });
  it('keeps rootless voicings contextual and refuses contradictory bass requirements', () => {
    const result = generateVoicings(chord('Cmaj9'), STANDARD_TUNING, 0, {
      rootless: true,
      voiceCount: 4,
      maxFret: 12,
    });
    expect(result.status).toBe('ok');
    expect(
      result.voicings.every(
        (voicing) => voicing.omittedDegrees.includes('1') && !voicing.presentDegrees.includes('1'),
      ),
    ).toBe(true);
    expect(generateVoicings(chord('C'), STANDARD_TUNING, 0, { rootless: true }).status).toBe(
      'no-match',
    );
    expect(
      generateVoicings(chord('Cmaj9'), STANDARD_TUNING, 0, { rootless: true, bass: '1' }).status,
    ).toBe('no-match');
  });
  it('preserves physical order, capo, and actual lowest pitch under reentrant tuning', () => {
    const tuning = [67, 59, 62];
    const original = [...tuning];
    const result = generateVoicings(chord('A/C#'), tuning, 2, {
      maxFret: 0,
      voiceCount: 3,
      omitFifth: false,
      bass: 'preserve',
    });
    expect(result.voicings[0]).toMatchObject({
      bassMidi: 61,
      bassDegree: '3',
      inversion: 'first inversion',
      notes: [{ midi: 69 }, { midi: 61 }, { midi: 64 }],
    });
    expect(tuning).toEqual(original);
  });
  it('supports seventh bass and names extension bass without inventing ordinal inversions', () => {
    const seventh = generateVoicings(chord('Cmaj7'), [59, 60, 64, 67], 0, {
      maxFret: 0,
      voiceCount: 4,
      bass: '7',
    });
    expect(seventh.voicings[0]!.inversion).toBe('third inversion');
    const ninth = generateVoicings(chord('C9'), [50, 60, 64, 70], 0, {
      maxFret: 0,
      voiceCount: 4,
      bass: '9',
    });
    expect(ninth.voicings[0]!.inversion).toBe('9 in bass');
  });
  it('treats open strings separately from finger span and honors an open-string exclusion', () => {
    const tuning = [67, 54, 57];
    const result = generateVoicings(chord('G'), tuning, 0, {
      maxFret: 5,
      voiceCount: 3,
      maxSpan: 0,
      omitFifth: false,
    });
    expect(
      result.voicings.some((voicing) =>
        voicing.notes.every((item, index) => item.position.fret === [0, 5, 5][index]),
      ),
    ).toBe(true);
    expect(
      generateVoicings(chord('G'), [67, 59, 62], 0, {
        maxFret: 0,
        voiceCount: 3,
        allowOpenStrings: false,
      }).status,
    ).toBe('no-match');
  });
  it('enforces exact melody register at the top and reports impossible constraints without relaxing them', () => {
    const result = generateVoicings(chord('C'), STANDARD_TUNING, 0, {
      maxFret: 12,
      voiceCount: 3,
      melodyMidi: 72,
    });
    expect(result.status).toBe('ok');
    expect(result.voicings.every((voicing) => voicing.topMidi === 72)).toBe(true);
    expect(generateVoicings(chord('C'), STANDARD_TUNING, 0, { melodyMidi: 61 }).status).toBe(
      'no-match',
    );
    expect(
      generateVoicings(chord('C'), STANDARD_TUNING, 0, { maxFret: 2, melodyMidi: 84 }).status,
    ).toBe('no-match');
  });
  it('bounds retained candidates and validates malformed coordinates', () => {
    const a = generateVoicings(chord('C13'), STANDARD_TUNING, 0, { maxCandidates: 1_000 });
    expect(a.voicings.length).toBeLessThanOrEqual(64);
    expect(a.visited).toBeLessThanOrEqual(150_001);
    expect(generateVoicings(chord('C'), STANDARD_TUNING, 0, { strings: [1, 1, 2] }).status).toBe(
      'invalid',
    );
    expect(generateVoicings(chord('C'), STANDARD_TUNING, 0, { maxFret: 25 }).status).toBe(
      'invalid',
    );
    expect(
      generateVoicings(chord('C'), STANDARD_TUNING, 0, { minFret: 9, maxFret: 5 }).status,
    ).toBe('invalid');
    expect(
      generateVoicings(chord('C'), STANDARD_TUNING, 0, { strings: [1, 2], voiceCount: 4 }).status,
    ).toBe('no-match');
    const corrupted = { ...chord('C'), rootPitchClass: 1 };
    expect(generateVoicings(corrupted, STANDARD_TUNING).status).toBe('invalid');
  });
});

describe('key, mode, and harmonic context', () => {
  it('spells modes from their tonic rather than the neck position', () => {
    expect(scaleTones({ tonic: 'D', mode: 'dorian' }).map((tone) => tone.noteName)).toEqual([
      'D',
      'E',
      'F',
      'G',
      'A',
      'B',
      'C',
    ]);
    expect(scaleTones({ tonic: 'D', mode: 'dorian' }).map((tone) => tone.label)).toEqual([
      '1',
      '2',
      'b3',
      '4',
      '5',
      '6',
      'b7',
    ]);
    expect(scaleTones({ tonic: 'F', mode: 'lydian' })[3]).toMatchObject({
      label: '#4',
      noteName: 'B',
    });
    expect(scaleTones({ tonic: 'B', mode: 'locrian' })[4]).toMatchObject({
      label: 'b5',
      noteName: 'F',
    });
  });
  it('distinguishes predominant and dominant instead of interchangeable scale-membership', () => {
    const key = { tonic: 'C', mode: 'ionian' as const };
    expect(romanNumeral(chord('Dm7'), key)).toBe('ii7');
    expect(romanNumeral(chord('G9'), key)).toBe('V9');
    expect(romanNumeral(chord('Bm7b5'), key)).toBe('viiø7');
    expect(harmonicFunction(chord('Dm7'), key)).toBe('predominant');
    expect(harmonicFunction(chord('Fmaj7'), key)).toBe('predominant');
    expect(harmonicFunction(chord('G7'), key)).toBe('dominant');
    expect(harmonicFunction(chord('Bm7b5'), key)).toBe('dominant');
    expect(harmonicFunction(chord('Cmaj7'), key)).toBe('tonic-area');
    expect(harmonicFunction(chord('D7'), key)).toBe('outside-selected-key');
    expect(harmonicFunction(chord('Dm7'), { tonic: 'D', mode: 'dorian' })).toBe(
      'context-dependent',
    );
    expect(romanNumeral(chord('Db7'), key)).toBeNull();
  });
});

describe('progression paths and melody anchors', () => {
  it('ranks three complete immutable paths and never silently skips an unconfirmed span', () => {
    const source = spans(['Dm7', 'G9', 'Cmaj13']);
    const before = structuredClone(source);
    const result = generateProgressionVariations(source, STANDARD_TUNING, 0, {
      minFret: 5,
      maxFret: 9,
      voiceCount: 4,
    });
    expect(result.status).toBe('ok');
    expect(result.variations).toHaveLength(3);
    expect(result.variations.map((variation) => variation.cost)).toEqual(
      [...result.variations.map((variation) => variation.cost)].sort((a, b) => a - b),
    );
    expect(result.variations.every((variation) => variation.events.length === 3)).toBe(true);
    expect(source).toEqual(before);
    expect(
      generateProgressionVariations(source, STANDARD_TUNING, 0, {
        minFret: 5,
        maxFret: 9,
        voiceCount: 4,
      }),
    ).toEqual(result);
    source[1]!.confirmation = 'suggested';
    expect(generateProgressionVariations(source, STANDARD_TUNING)).toMatchObject({
      status: 'incomplete',
      variations: [],
      issues: [{ spanId: 'span1' }],
    });
  });
  it('matches exhaustive path cost on a small two-chord candidate problem', () => {
    const source = spans(['Dm7', 'G7']);
    const options = { minFret: 5, maxFret: 8, strings: [1, 2, 3, 4], voiceCount: 4 as const };
    const banks = source.map(
      (span) => generateVoicings(span.chord!, STANDARD_TUNING, 0, options).voicings,
    );
    const costs = banks[0]!
      .flatMap((a) =>
        banks[1]!.map((b) => a.localCost * 0.1 + voicingTransition(a, b).cost + b.localCost * 0.1),
      )
      .sort((a, b) => a - b)
      .slice(0, 3);
    const result = generateProgressionVariations(source, STANDARD_TUNING, 0, options);
    expect(result.status).toBe('ok');
    expect(result.variations.map((variation) => variation.cost)).toEqual(costs);
  });
  it('reports impossible phrase constraints, invalid chronology, and missing melody separately', () => {
    expect(
      generateProgressionVariations(spans(['C9']), STANDARD_TUNING, 0, { voiceCount: 2 }).status,
    ).toBe('no-match');
    const reversed = spans(['C', 'G']).reverse();
    expect(generateProgressionVariations(reversed, STANDARD_TUNING).status).toBe('invalid');
    expect(
      generateProgressionVariations(spans(['C']), STANDARD_TUNING, 0, { preserveMelody: true })
        .status,
    ).toBe('incomplete');
    expect(generateProgressionVariations([], STANDARD_TUNING).status).toBe('invalid');
  });
  it('extracts ordinary monophonic anchors and rejects overlaps or unsupported notes', () => {
    const melody = [note(72, 'c', 0, 480), note(76, 'e', 480, 480)];
    expect(extractMelodyAnchors(melody, 0, 960).status).toBe('ok');
    expect(extractMelodyAnchors([melody[0]!, note(76, 'overlap', 240, 480)], 0, 960).status).toBe(
      'unavailable',
    );
    expect(extractMelodyAnchors([{ ...melody[0]!, effects: { slide: true } }], 0, 960).status).toBe(
      'unavailable',
    );
  });
  it('splits a held chord at melody changes while retaining the source span identity', () => {
    const source = spans(['C']);
    source[0]!.melodyAnchors = extractMelodyAnchors(
      [note(72, 'c', 0, 480), note(76, 'e', 480, 480)],
      0,
      960,
    ).anchors;
    const result = generateProgressionVariations(source, STANDARD_TUNING, 0, {
      preserveMelody: true,
      voiceCount: 3,
      maxFret: 12,
    });
    expect(result.status).toBe('ok');
    expect(
      result.variations[0]!.events.map((event) => [
        event.spanId,
        event.startTick,
        event.endTick,
        event.voicing.topMidi,
      ]),
    ).toEqual([
      ['span0', 0, 480, 72],
      ['span0', 480, 960, 76],
    ]);
    source[0]!.melodyAnchors[1]!.midi = 73;
    expect(
      generateProgressionVariations(source, STANDARD_TUNING, 0, {
        preserveMelody: true,
        voiceCount: 3,
      }).status,
    ).toBe('no-match');
  });
});
