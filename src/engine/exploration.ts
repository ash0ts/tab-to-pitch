import { Note as TonalNote } from 'tonal';
import { midiToSpn, parsePitch, parsePitchClass, pitchClass } from './theory.js';
import type { TriadAnalysis, TriadQuality, TriadRole } from './theory.js';
import type { FretPosition, NoteEvent } from './types.js';

const MAX_FRET = 24;
const MAX_STRINGS = 12;

export interface NotePositionOptions {
  match?: 'pitch-class' | 'exact';
  minFret?: number;
  maxFret?: number;
}

export interface TriadVoicingOptions {
  minFret?: number;
  maxFret?: number;
  /** Exactly three physical strings. Omit to search every adjacent three-string group. */
  strings?: readonly number[];
  /** Maximum distance between fretted notes; open strings do not require a fretting finger. */
  maxSpan?: number;
}

export interface TriadVoicingNote {
  position: FretPosition;
  midi: number;
  noteName: string;
  /** Scientific pitch notation with the chord's spelling and correct written octave. */
  label: string;
  role: TriadRole;
}

export interface TriadVoicing {
  id: string;
  rootName: string;
  quality: TriadQuality;
  chordName: string;
  notes: TriadVoicingNote[];
  bassRole: TriadRole;
  inversion: 'root position' | 'first inversion' | 'second inversion';
  minFret: number;
  maxFret: number;
  /** Open strings are excluded; minFret and maxFret still describe every played string. */
  span: number;
}

function omitOctave(label: string): string {
  return label.replace(/^([A-G](?:#{1,2}|b{1,2}|♯{1,2}|♭{1,2})?)-?\d+/, '$1');
}

export function formatPitch(midi: number, showOctave = false): string {
  const label = midiToSpn(midi);
  return showOctave ? label : omitOctave(label);
}

export function displayNoteLabel(note: NoteEvent, showOctave = false): string {
  const midi = note.soundingMidi;
  if (midi === null) return note.effects.dead ? '×' : '?';
  const nearest = Math.round(midi);
  if (note.spelling && parsePitch(note.spelling) === nearest) {
    const cents = Math.round((midi - nearest) * 100);
    const label = showOctave ? note.spelling : omitOctave(note.spelling);
    return cents === 0 ? label : `${label}${cents > 0 ? '+' : ''}${cents}¢`;
  }
  return formatPitch(midi, showOctave);
}

function validFretboard(tuning: readonly number[], capo: number): boolean {
  return (
    tuning.length > 0 &&
    tuning.length <= MAX_STRINGS &&
    Number.isInteger(capo) &&
    capo >= 0 &&
    capo <= MAX_FRET &&
    tuning.every((midi) => Number.isInteger(midi) && midi >= 0 && midi + capo <= 127)
  );
}

function fretRange(options: { minFret?: number; maxFret?: number }): [number, number] | null {
  const min = options.minFret ?? 0;
  const max = options.maxFret ?? MAX_FRET;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) return null;
  return min > MAX_FRET ? null : [min, Math.min(max, MAX_FRET)];
}

/** Ordinary fretted positions, measured relative to the capo. This does not refinger harmonics. */
export function findNotePositions(
  midi: number,
  tuning: readonly number[],
  capo = 0,
  options: NotePositionOptions = {},
): FretPosition[] {
  const range = fretRange(options);
  const match = options.match ?? 'pitch-class';
  if (
    !range ||
    !validFretboard(tuning, capo) ||
    !Number.isInteger(midi) ||
    midi < 0 ||
    midi > 127 ||
    (match !== 'pitch-class' && match !== 'exact')
  )
    return [];
  const result: FretPosition[] = [];
  for (let string = 1; string <= tuning.length; string += 1) {
    for (let fret = range[0]; fret <= range[1]; fret += 1) {
      const candidate = tuning[string - 1]! + capo + fret;
      if (
        candidate <= 127 &&
        (match === 'exact' ? candidate === midi : pitchClass(candidate) === pitchClass(midi))
      )
        result.push({ string, fret });
    }
  }
  return result;
}

function stringGroups(count: number, selected?: readonly number[]): number[][] {
  if (!selected)
    return Array.from({ length: Math.max(0, count - 2) }, (_, index) => [
      index + 1,
      index + 2,
      index + 3,
    ]);
  if (
    selected.length !== 3 ||
    new Set(selected).size !== 3 ||
    selected.some((string) => !Number.isInteger(string) || string < 1 || string > count)
  )
    return [];
  return [[...selected].sort((a, b) => a - b)];
}

function spelledLabel(name: string, midi: number): string {
  const atOctaveFour = parsePitch(`${name}4`);
  if (atOctaveFour === null) return midiToSpn(midi);
  const octave = 4 + (midi - atOctaveFour) / 12;
  const label = `${name}${octave}`;
  return parsePitch(label) === midi ? label : midiToSpn(midi);
}

/** Three different strings, one root, one third, and one fifth. Fingering comfort is not assessed. */
export function generateTriadVoicings(
  triad: TriadAnalysis,
  tuning: readonly number[],
  capo = 0,
  options: TriadVoicingOptions = {},
): TriadVoicing[] {
  const range = fretRange(options);
  const maxSpan = options.maxSpan ?? 4;
  const root = triad.rootPitchClass;
  if (
    !range ||
    !validFretboard(tuning, capo) ||
    !Number.isInteger(root) ||
    root < 0 ||
    root > 11 ||
    !['major', 'minor'].includes(triad.quality) ||
    !Number.isInteger(maxSpan) ||
    maxSpan < 0 ||
    maxSpan > MAX_FRET
  )
    return [];

  const rootName = parsePitchClass(triad.rootName) === root ? triad.rootName : formatPitch(root);
  const third = triad.quality === 'major' ? 4 : 3;
  const toneNames = new Map<number, { role: TriadRole; name: string }>();
  for (const [interval, role, semitones] of [
    ['1P', 'root', 0],
    [triad.quality === 'major' ? '3M' : '3m', 'third', third],
    ['5P', 'fifth', 7],
  ] as const) {
    const toneClass = pitchClass(root + semitones);
    const spelling = omitOctave(
      TonalNote.transpose(`${rootName.replaceAll('♯', '#').replaceAll('♭', 'b')}4`, interval),
    );
    toneNames.set(toneClass, {
      role,
      name: parsePitchClass(spelling) === toneClass ? spelling : formatPitch(toneClass),
    });
  }

  const candidates = tuning.map((openMidi, stringIndex) => {
    const notes: TriadVoicingNote[] = [];
    for (let fret = range[0]; fret <= range[1]; fret += 1) {
      const midi = openMidi + capo + fret;
      const tone = toneNames.get(pitchClass(midi));
      if (tone && midi <= 127)
        notes.push({
          position: { string: stringIndex + 1, fret },
          midi,
          noteName: tone.name,
          label: spelledLabel(tone.name, midi),
          role: tone.role,
        });
    }
    return notes;
  });
  const voicings: TriadVoicing[] = [];
  for (const group of stringGroups(tuning.length, options.strings)) {
    for (const first of candidates[group[0]! - 1]!) {
      for (const second of candidates[group[1]! - 1]!) {
        if (first.role === second.role) continue;
        for (const thirdNote of candidates[group[2]! - 1]!) {
          if (thirdNote.role === first.role || thirdNote.role === second.role) continue;
          const notes = [first, second, thirdNote];
          const frets = notes.map((note) => note.position.fret);
          const fretted = frets.filter((fret) => fret > 0);
          const span = fretted.length < 2 ? 0 : Math.max(...fretted) - Math.min(...fretted);
          if (span > maxSpan) continue;
          const bass = notes.reduce((lowest, note) => (note.midi < lowest.midi ? note : lowest));
          const chordName = `${rootName}${triad.quality === 'minor' ? 'm' : ''}${bass.role === 'root' ? '' : `/${bass.noteName}`}`;
          voicings.push({
            id: `${root}:${triad.quality}:${capo}:${notes.map((note) => `${note.position.string}.${note.position.fret}.${note.midi}`).join('-')}`,
            rootName,
            quality: triad.quality,
            chordName,
            notes,
            bassRole: bass.role,
            inversion:
              bass.role === 'root'
                ? 'root position'
                : bass.role === 'third'
                  ? 'first inversion'
                  : 'second inversion',
            minFret: Math.min(...frets),
            maxFret: Math.max(...frets),
            span,
          });
        }
      }
    }
  }
  return voicings.sort(
    (a, b) =>
      a.maxFret - b.maxFret ||
      a.span - b.span ||
      a.notes[0]!.position.string - b.notes[0]!.position.string ||
      a.notes[0]!.position.fret - b.notes[0]!.position.fret ||
      a.notes[1]!.position.fret - b.notes[1]!.position.fret ||
      a.notes[2]!.position.fret - b.notes[2]!.position.fret,
  );
}
