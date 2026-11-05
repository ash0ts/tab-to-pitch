import { describe, expect, it } from 'vitest';
import {
  displayNoteLabel,
  findNotePositions,
  formatPitch,
  generateTriadVoicings,
} from './exploration';
import { parsePitch, parsePitchClass, pitchClass, STANDARD_TUNING } from './theory';
import type { TriadAnalysis, TriadQuality } from './theory';
import type { NoteEvent } from './types';

function triad(rootPitchClass = 7, rootName = 'G', quality: TriadQuality = 'major'): TriadAnalysis {
  return { rootPitchClass, rootName, quality, roles: {}, bassRole: 'root', noteIds: [] };
}

function note(midi: number | null, spelling: string | null = null): NoteEvent {
  return {
    id: 'note',
    trackId: 'track',
    staffIndex: 0,
    voiceIndex: 0,
    measureIndex: 0,
    beatId: 'beat',
    onsetTicks: 0,
    durationTicks: 960,
    soundingMidi: midi,
    spelling,
    position: { string: 1, fret: 0 },
    effects: {},
    eligible: true,
  };
}

describe('note display', () => {
  it('makes the octave optional without concealing pitch offsets', () => {
    expect(formatPitch(47)).toBe('B');
    expect(formatPitch(47, true)).toBe('B2');
    expect(formatPitch(60.25)).toBe('C+25¢');
    expect(formatPitch(60.25, true)).toBe('C4+25¢');
    expect(formatPitch(59.9)).toBe('C-10¢');
    expect(formatPitch(0)).toBe('C');
    expect(formatPitch(0, true)).toBe('C-1');
    expect(formatPitch(Number.NaN)).toBe('?');
  });

  it('preserves valid enharmonic spelling across written octave boundaries', () => {
    expect(displayNoteLabel(note(60, 'B#3'))).toBe('B#');
    expect(displayNoteLabel(note(60, 'B#3'), true)).toBe('B#3');
    expect(displayNoteLabel(note(59, 'Cb4'))).toBe('Cb');
    expect(displayNoteLabel(note(59, 'Cb4'), true)).toBe('Cb4');
    expect(displayNoteLabel(note(60.25, 'B#3'))).toBe('B#+25¢');
    expect(displayNoteLabel(note(60.25, 'B#3'), true)).toBe('B#3+25¢');
    expect(displayNoteLabel(note(59, 'C4'))).toBe('B');
    expect(displayNoteLabel(note(59, 'C4'), true)).toBe('B3');
    expect(displayNoteLabel({ ...note(null), effects: { dead: true } })).toBe('×');
    expect(displayNoteLabel(note(null))).toBe('?');
  });
});

describe('note positions', () => {
  it('finds B across octaves by default and restricts to B2 only when requested', () => {
    const positions = findNotePositions(47, STANDARD_TUNING);
    expect(positions).toEqual([
      { string: 1, fret: 7 },
      { string: 1, fret: 19 },
      { string: 2, fret: 0 },
      { string: 2, fret: 12 },
      { string: 2, fret: 24 },
      { string: 3, fret: 4 },
      { string: 3, fret: 16 },
      { string: 4, fret: 9 },
      { string: 4, fret: 21 },
      { string: 5, fret: 2 },
      { string: 5, fret: 14 },
      { string: 6, fret: 7 },
      { string: 6, fret: 19 },
    ]);
    expect(findNotePositions(47, STANDARD_TUNING, 0, { match: 'exact' })).toEqual([
      { string: 5, fret: 2 },
      { string: 6, fret: 7 },
    ]);
    expect(findNotePositions(59, STANDARD_TUNING)).toEqual(positions);
  });

  it('uses physical string order under reentrant tuning and applies capo once', () => {
    const tuning = [69, 64, 60, 67];
    expect(findNotePositions(69, tuning, 2, { match: 'exact' })).toEqual([
      { string: 2, fret: 3 },
      { string: 3, fret: 7 },
      { string: 4, fret: 0 },
    ]);
    expect(findNotePositions(62, [64, 59, 55, 50, 45, 38], 2, { match: 'exact' })).toContainEqual({
      string: 6,
      fret: 22,
    });
    expect(tuning).toEqual([69, 64, 60, 67]);
  });

  it('honors the selected fret window and bounds invalid or unsupported searches', () => {
    expect(findNotePositions(47, STANDARD_TUNING, 0, { minFret: 5, maxFret: 9 })).toEqual([
      { string: 1, fret: 7 },
      { string: 4, fret: 9 },
      { string: 6, fret: 7 },
    ]);
    expect(findNotePositions(47, STANDARD_TUNING, 0, { minFret: 25, maxFret: 100 })).toEqual([]);
    expect(findNotePositions(47, STANDARD_TUNING, 0, { maxFret: 1_000 })).toEqual(
      findNotePositions(47, STANDARD_TUNING),
    );
    for (const midi of [Number.NaN, Infinity, 47.5, -1, 128])
      expect(findNotePositions(midi, STANDARD_TUNING)).toEqual([]);
    expect(findNotePositions(47, STANDARD_TUNING, -1)).toEqual([]);
    expect(findNotePositions(47, [64, Number.NaN])).toEqual([]);
    expect(findNotePositions(47, STANDARD_TUNING, 0, { minFret: 8, maxFret: 4 })).toEqual([]);
  });
});

describe('triad exploration', () => {
  it('finds familiar G shapes with a complete triad and the correct inversion', () => {
    const result = generateTriadVoicings(triad(), STANDARD_TUNING, 0, {
      strings: [1, 2, 3],
      maxFret: 12,
    });
    const firstInversion = result.find((voicing) =>
      voicing.notes.every((note, i) => note.position.fret === [3, 3, 4][i]),
    );
    expect(firstInversion).toMatchObject({
      chordName: 'G/B',
      bassRole: 'third',
      inversion: 'first inversion',
      span: 1,
      notes: [
        { midi: 67, noteName: 'G', role: 'root', position: { string: 1, fret: 3 } },
        { midi: 62, noteName: 'D', role: 'fifth', position: { string: 2, fret: 3 } },
        { midi: 59, noteName: 'B', role: 'third', position: { string: 3, fret: 4 } },
      ],
    });
    expect(result.some((voicing) => voicing.chordName === 'G')).toBe(true);
    expect(result.some((voicing) => voicing.chordName === 'G/D')).toBe(true);
  });

  it('derives bass from sounding pitch rather than the last physical string', () => {
    const [voicing] = generateTriadVoicings(triad(), [67, 59, 62], 0, { maxFret: 0 });
    expect(voicing).toMatchObject({
      bassRole: 'third',
      inversion: 'first inversion',
      chordName: 'G/B',
      notes: [{ midi: 67 }, { midi: 59 }, { midi: 62 }],
    });
    const [capoVoicing] = generateTriadVoicings(triad(9, 'A'), [67, 59, 62], 2, { maxFret: 0 });
    expect(capoVoicing).toMatchObject({
      chordName: 'A/C#',
      notes: [{ midi: 69 }, { midi: 61 }, { midi: 64 }],
    });
  });

  it('spells chord tones from the root and quality, including enharmonic roots', () => {
    const [minor] = generateTriadVoicings(triad(5, 'F', 'minor'), [65, 60, 56], 0, { maxFret: 0 });
    expect(minor?.notes.map((note) => note.noteName)).toEqual(['F', 'C', 'Ab']);
    expect(minor?.chordName).toBe('Fm/Ab');
    const [enharmonic] = generateTriadVoicings(triad(11, 'Cb'), [59, 63, 66], 0, { maxFret: 0 });
    expect(enharmonic?.notes.map((note) => note.noteName)).toEqual(['Cb', 'Eb', 'Gb']);
    expect(enharmonic?.notes.map((note) => note.label)).toEqual(['Cb4', 'Eb4', 'Gb4']);
    const [boundary] = generateTriadVoicings(triad(0, 'B#'), [60, 64, 67], 0, { maxFret: 0 });
    expect(boundary?.notes.map((note) => note.label)).toEqual(['B#3', 'D##4', 'F##4']);
    const [unicode] = generateTriadVoicings(triad(10, 'B♭'), [58, 62, 65], 0, { maxFret: 0 });
    expect(unicode?.notes.map((note) => note.noteName)).toEqual(['Bb', 'D', 'F']);
  });

  it('bounds fretting stretch while retaining open-string combinations', () => {
    const tuning = [67, 54, 57];
    const options = { maxFret: 5, strings: [1, 2, 3] };
    const findOpenShape = (maxSpan: number) =>
      generateTriadVoicings(triad(), tuning, 0, { ...options, maxSpan }).find((voicing) =>
        voicing.notes.every((note, i) => note.position.fret === [0, 5, 5][i]),
      );
    expect(findOpenShape(0)).toMatchObject({ minFret: 0, maxFret: 5, span: 0 });
    const result = generateTriadVoicings(triad(), STANDARD_TUNING, 0, {
      minFret: 5,
      maxFret: 9,
      maxSpan: 2,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every((voicing) => voicing.span <= 2 && voicing.minFret >= 5 && voicing.maxFret <= 9),
    ).toBe(true);
  });

  it('searches adjacent groups by default and keeps explicit string groups deterministic', () => {
    const result = generateTriadVoicings(triad(), STANDARD_TUNING);
    expect(result.length).toBeGreaterThan(0);
    for (const voicing of result) {
      const strings = voicing.notes.map((note) => note.position.string);
      expect(strings).toEqual([strings[0], strings[0]! + 1, strings[0]! + 2]);
    }
    expect(generateTriadVoicings(triad(), STANDARD_TUNING, 0, { strings: [6, 2, 4] })).toEqual(
      generateTriadVoicings(triad(), STANDARD_TUNING, 0, { strings: [2, 4, 6] }),
    );
    expect(result).toEqual(generateTriadVoicings(triad(), STANDARD_TUNING));
    expect(new Set(result.map((voicing) => voicing.id)).size).toBe(result.length);
    expect(result.map((voicing) => voicing.maxFret)).toEqual(
      result.map((voicing) => voicing.maxFret).sort((a, b) => a - b),
    );
  });

  it('produces complete, bounded voicings across keys, qualities, capo, and tunings', () => {
    for (const tuning of [STANDARD_TUNING, [64, 59, 55, 50, 45, 38], [69, 64, 60, 67]]) {
      for (const capo of [0, 2]) {
        for (let root = 0; root < 12; root += 1) {
          for (const quality of ['major', 'minor'] as const) {
            const third = quality === 'major' ? 4 : 3;
            const allowed = new Set([root, (root + third) % 12, (root + 7) % 12]);
            const result = generateTriadVoicings(
              triad(root, formatPitch(root), quality),
              tuning,
              capo,
            );
            expect(result.length).toBeGreaterThan(0);
            for (const voicing of result) {
              expect(new Set(voicing.notes.map((note) => note.role))).toEqual(
                new Set(['root', 'third', 'fifth']),
              );
              expect(new Set(voicing.notes.map((note) => pitchClass(note.midi)))).toEqual(allowed);
              expect(voicing.span).toBeLessThanOrEqual(4);
              expect(voicing.maxFret).toBeLessThanOrEqual(24);
              for (const note of voicing.notes) {
                expect(note.midi).toBe(
                  tuning[note.position.string - 1]! + capo + note.position.fret,
                );
                expect(parsePitchClass(note.noteName)).toBe(pitchClass(note.midi));
                expect(parsePitch(note.label)).toBe(note.midi);
              }
            }
          }
        }
      }
    }
  });

  it('rejects incomplete groups and malformed constraints', () => {
    for (const strings of [
      [1, 2],
      [1, 1, 3],
      [1, 2, 7],
      [1, 2, 3.5],
    ])
      expect(generateTriadVoicings(triad(), STANDARD_TUNING, 0, { strings })).toEqual([]);
    expect(generateTriadVoicings(triad(), [64, 59])).toEqual([]);
    expect(generateTriadVoicings(triad(), STANDARD_TUNING, 0, { maxSpan: -1 })).toEqual([]);
    expect(
      generateTriadVoicings(triad(), STANDARD_TUNING, 0, { minFret: 25, maxFret: 30 }),
    ).toEqual([]);
    expect(generateTriadVoicings(triad(12), STANDARD_TUNING)).toEqual([]);
    expect(generateTriadVoicings(triad(), [127, 126, 125], 2)).toEqual([]);
  });
});
