import { Interval, Note as TonalNote } from 'tonal';
import type { FretPosition, NoteEvent } from './types.js';

export const STANDARD_TUNING = [64, 59, 55, 50, 45, 40] as const;
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NATURAL_PITCHES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const pitchClass = (midi: number): number => ((midi % 12) + 12) % 12;

export function midiToSpn(midi: number, preferFlats = false): string {
  if (!Number.isFinite(midi)) return '?';
  const nearest = Math.round(midi);
  const name = `${(preferFlats ? FLATS : SHARPS)[pitchClass(nearest)]}${Math.floor(nearest / 12) - 1}`;
  const cents = Math.round((midi - nearest) * 100);
  return cents === 0 ? name : `${name}${cents > 0 ? '+' : ''}${cents}¢`;
}

/** Parse SPN rather than pitch-class alone, so an octave mistake is not accepted. */
export function parsePitch(text: string): number | null {
  const match = text
    .trim()
    .replaceAll('♯', '#')
    .replaceAll('♭', 'b')
    .match(/^([a-g])((?:#{1,2}|b{1,2})?)(-?\d+)$/i);
  if (!match) return null;
  const letter = match[1]!.toUpperCase();
  const accidental = [...match[2]!].reduce((value, char) => value + (char === '#' ? 1 : -1), 0);
  const midi = (Number(match[3]) + 1) * 12 + NATURAL_PITCHES[letter]! + accidental;
  return Number.isInteger(midi) && midi >= 0 && midi <= 127 ? midi : null;
}

export function parsePitchClass(text: string): number | null {
  const normalized = text.trim().replaceAll('♯', '#').replaceAll('♭', 'b');
  if (!/^[a-g](?:#{1,2}|b{1,2})?$/i.test(normalized)) return null;
  const midi = parsePitch(`${normalized}4`);
  return midi === null ? null : pitchClass(midi);
}

export function noteLabel(note: NoteEvent): string {
  if (note.soundingMidi === null) return note.effects.dead ? '×' : '?';
  if (note.spelling && parsePitch(note.spelling) === note.soundingMidi) return note.spelling;
  return midiToSpn(note.soundingMidi);
}

export function findUnisons(
  midi: number,
  tuningMidi: readonly number[],
  capo = 0,
  maxFret = 24,
): FretPosition[] {
  if (!Number.isInteger(midi)) return [];
  return tuningMidi.flatMap((openMidi, index) => {
    const fret = midi - openMidi - capo;
    return Number.isInteger(fret) && fret >= 0 && fret <= maxFret
      ? [{ string: index + 1, fret }]
      : [];
  });
}

export function isQuizEligible(note: NoteEvent): boolean {
  const effects = note.effects;
  return (
    note.eligible &&
    note.soundingMidi !== null &&
    Number.isInteger(note.soundingMidi) &&
    note.soundingMidi >= 0 &&
    note.soundingMidi <= 127 &&
    !effects.dead &&
    !effects.tieDestination &&
    !effects.slide &&
    !effects.bend?.length &&
    !effects.unsupported?.length &&
    (!effects.harmonic || effects.harmonic === 'none')
  );
}

export interface SpelledInterval {
  name: string;
  symbol: string;
  semitones: number;
}

export function spelledInterval(first: NoteEvent, second: NoteEvent): SpelledInterval | null {
  if (
    !first.spelling ||
    !second.spelling ||
    parsePitch(first.spelling) !== first.soundingMidi ||
    parsePitch(second.spelling) !== second.soundingMidi
  )
    return null;
  const symbol = Interval.distance(first.spelling, second.spelling);
  const interval = Interval.get(symbol);
  const numberNames = [
    '',
    'unison',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'octave',
  ];
  const qualityNames: Record<string, string> = {
    P: 'perfect',
    M: 'major',
    m: 'minor',
    A: 'augmented',
    d: 'diminished',
  };
  const number = Math.abs(interval.num);
  if (interval.empty || !number || number > 8 || !qualityNames[interval.q]) return null;
  const name =
    number === 1 && interval.q === 'P'
      ? 'unison'
      : number === 8 && interval.q === 'P'
        ? 'octave'
        : `${qualityNames[interval.q]} ${numberNames[number]}`;
  return { name, symbol: symbol.replace(/^-/, ''), semitones: Math.abs(interval.semitones) };
}

export type TriadQuality = 'major' | 'minor';
export type TriadRole = 'root' | 'third' | 'fifth';
export interface TriadAnalysis {
  rootPitchClass: number;
  rootName: string;
  quality: TriadQuality;
  roles: Record<string, TriadRole>;
  bassRole: TriadRole;
  noteIds: string[];
}

/** Only exact major/minor pitch-class sets are classified. No root guessing. */
export function analyzeTriad(notes: readonly NoteEvent[]): TriadAnalysis | null {
  const pitched = notes.filter(isQuizEligible);
  if (pitched.length !== notes.length || pitched.length < 3) return null;
  const classes = new Set(pitched.map((note) => pitchClass(note.soundingMidi!)));
  if (classes.size !== 3) return null;
  for (const root of classes) {
    for (const quality of ['major', 'minor'] as const) {
      const third = quality === 'major' ? 4 : 3;
      if (!classes.has((root + third) % 12) || !classes.has((root + 7) % 12)) continue;
      const roles: Record<string, TriadRole> = {};
      for (const note of pitched) {
        const interval = pitchClass(note.soundingMidi! - root);
        roles[note.id] = interval === 0 ? 'root' : interval === third ? 'third' : 'fifth';
      }
      const bass = pitched.reduce((lowest, note) =>
        note.soundingMidi! < lowest.soundingMidi! ? note : lowest,
      );
      const spelledRoot = pitched.find(
        (note) =>
          pitchClass(note.soundingMidi!) === root &&
          note.spelling &&
          parsePitch(note.spelling) === note.soundingMidi,
      );
      const rootName = spelledRoot?.spelling?.replace(/-?\d+$/, '') ?? SHARPS[root]!;
      return {
        rootPitchClass: root,
        rootName,
        quality,
        roles,
        bassRole: roles[bass.id]!,
        noteIds: pitched.map((note) => note.id),
      };
    }
  }
  return null;
}

export interface DerivedTriad {
  sourceNoteIds: string[];
  sourceQuality: TriadQuality;
  quality: TriadQuality;
  rootPitchClass: number;
  pitches: { sourceNoteId: string; midi: number; label: string; changed: boolean }[];
}

/** Creates a listening example. It never changes the imported score or promises fingering. */
export function deriveTriad(
  notes: readonly NoteEvent[],
  quality: TriadQuality,
): DerivedTriad | null {
  const original = analyzeTriad(notes);
  if (!original) return null;
  const shift = original.quality === quality ? 0 : quality === 'major' ? 1 : -1;
  return {
    sourceNoteIds: original.noteIds,
    sourceQuality: original.quality,
    quality,
    rootPitchClass: original.rootPitchClass,
    pitches: notes.map((note) => {
      const changed = original.roles[note.id] === 'third' && shift !== 0;
      const midi = note.soundingMidi! + (changed ? shift : 0);
      const spelled = changed
        ? TonalNote.transpose(noteLabel(note), shift > 0 ? '1A' : '1d')
        : noteLabel(note);
      return {
        sourceNoteId: note.id,
        midi,
        label: parsePitch(spelled) === midi ? spelled : midiToSpn(midi),
        changed,
      };
    }),
  };
}

export function soundingAt(notes: readonly NoteEvent[], tick: number): NoteEvent[] {
  return notes.filter(
    (note) =>
      !note.effects.tieDestination &&
      note.onsetTicks <= tick &&
      tick < note.onsetTicks + note.durationTicks,
  );
}
