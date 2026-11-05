import { Note as TonalNote } from 'tonal';
import { isQuizEligible, parsePitch, parsePitchClass, pitchClass, soundingAt } from './theory.js';
import type { FretPosition, NoteEvent, ScoreTrack } from './types.js';

export const HARMONY_VERSION = 'harmony-v1';
export type ChordDegree =
  | '1'
  | 'b3'
  | '3'
  | '2'
  | '4'
  | 'b5'
  | '5'
  | '#5'
  | '6'
  | 'bb7'
  | 'b7'
  | '7'
  | '9'
  | '11'
  | '13';
export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented'
  | 'sus2'
  | 'sus4'
  | 'power'
  | 'maj7'
  | 'm7'
  | '7'
  | 'm7b5'
  | 'dim7'
  | 'mMaj7'
  | '6'
  | 'm6'
  | 'add9'
  | 'madd9'
  | '6/9'
  | 'maj9'
  | 'm9'
  | '9'
  | 'm11'
  | 'maj13'
  | '13';
export interface ChordTemplate {
  quality: ChordQuality;
  suffix: string;
  label: string;
  degrees: readonly ChordDegree[];
  optionalDegrees: readonly ChordDegree[];
}
export interface ChordTone {
  degree: ChordDegree;
  semitones: number;
  pitchClass: number;
  noteName: string;
}
export interface ChordDefinition {
  id: string;
  symbol: string;
  rootName: string;
  rootPitchClass: number;
  quality: ChordQuality;
  tones: ChordTone[];
  bassName?: string;
  bassPitchClass?: number;
}
export interface ChordInterpretation {
  chord: ChordDefinition;
  roles: Record<string, ChordDegree>;
  bassDegree: ChordDegree | null;
  bassMidi: number;
  omittedDegrees: ChordDegree[];
  contextual: boolean;
}
export interface HarmonyAnalysis {
  status: 'supported' | 'ambiguous' | 'unavailable';
  interpretations: ChordInterpretation[];
  noteIds: string[];
  reason?: string;
}
export type ModeName =
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'locrian';
export interface HarmonicContext {
  tonic: string;
  mode: ModeName;
}
export interface ScaleTone {
  degree: number;
  alteration: number;
  label: string;
  noteName: string;
  pitchClass: number;
}
export interface MelodyAnchor {
  noteId: string;
  startTick: number;
  endTick: number;
  midi: number;
}
export interface HarmonySpan {
  id: string;
  startTick: number;
  endTick: number;
  sourceNoteIds: string[];
  chord: ChordDefinition | null;
  confirmation: 'confirmed' | 'suggested' | 'unavailable';
  source: 'manual' | 'inferred' | 'imported' | 'catalog';
  alternatives?: ChordDefinition[];
  melodyAnchors?: MelodyAnchor[];
}
export interface VoicingNote {
  position: FretPosition;
  midi: number;
  noteName: string;
  label: string;
  degree: ChordDegree;
}
export interface Voicing {
  id: string;
  chord: ChordDefinition;
  notes: VoicingNote[];
  presentDegrees: ChordDegree[];
  omittedDegrees: ChordDegree[];
  bassDegree: ChordDegree;
  bassMidi: number;
  topMidi: number;
  bassLabel: string;
  inversion: string;
  minFret: number;
  maxFret: number;
  span: number;
  localCost: number;
}
export interface VoicingOptions {
  minFret?: number;
  maxFret?: number;
  strings?: readonly number[];
  voiceCount?: 2 | 3 | 4 | 5 | 6;
  maxSpan?: number;
  allowOpenStrings?: boolean;
  omitFifth?: boolean;
  rootless?: boolean;
  bass?: 'any' | 'preserve' | ChordDegree;
  melodyMidi?: number;
  maxCandidates?: number;
}
export interface VoicingResult {
  status: 'ok' | 'no-match' | 'invalid' | 'incomplete';
  voicings: Voicing[];
  reason?: string;
  truncated: boolean;
  visited: number;
}
export interface ProgressionOptions extends VoicingOptions {
  preserveMelody?: boolean;
  maxPaths?: number;
}
export interface VariationEvent {
  spanId: string;
  startTick: number;
  endTick: number;
  voicing: Voicing;
}
export interface ProgressionVariation {
  id: string;
  version: string;
  events: VariationEvent[];
  cost: number;
  totalMotion: number;
  commonTones: number;
  maxFretJump: number;
  omittedDegrees: ChordDegree[];
}
export interface ProgressionResult {
  status: 'ok' | 'incomplete' | 'no-match' | 'invalid';
  variations: ProgressionVariation[];
  issues: { spanId: string; reason: string }[];
  candidateCounts: number[];
}

const DEGREE_DATA: Record<ChordDegree, { semitones: number; interval: string }> = {
  '1': { semitones: 0, interval: '1P' },
  '2': { semitones: 2, interval: '2M' },
  b3: { semitones: 3, interval: '3m' },
  '3': { semitones: 4, interval: '3M' },
  '4': { semitones: 5, interval: '4P' },
  b5: { semitones: 6, interval: '5d' },
  '5': { semitones: 7, interval: '5P' },
  '#5': { semitones: 8, interval: '5A' },
  '6': { semitones: 9, interval: '6M' },
  bb7: { semitones: 9, interval: '7d' },
  b7: { semitones: 10, interval: '7m' },
  '7': { semitones: 11, interval: '7M' },
  '9': { semitones: 14, interval: '9M' },
  '11': { semitones: 17, interval: '11P' },
  '13': { semitones: 21, interval: '13M' },
};
function template(
  quality: ChordQuality,
  suffix: string,
  label: string,
  degrees: ChordDegree[],
  optionalDegrees: ChordDegree[] = [],
): ChordTemplate {
  return { quality, suffix, label, degrees, optionalDegrees };
}
export const CHORD_QUALITIES: readonly ChordTemplate[] = [
  template('major', '', 'Major', ['1', '3', '5']),
  template('minor', 'm', 'Minor', ['1', 'b3', '5']),
  template('diminished', 'dim', 'Diminished', ['1', 'b3', 'b5']),
  template('augmented', 'aug', 'Augmented', ['1', '3', '#5']),
  template('sus2', 'sus2', 'Suspended second', ['1', '2', '5']),
  template('sus4', 'sus4', 'Suspended fourth', ['1', '4', '5']),
  template('power', '5', 'Power chord', ['1', '5']),
  template('maj7', 'maj7', 'Major seventh', ['1', '3', '5', '7']),
  template('m7', 'm7', 'Minor seventh', ['1', 'b3', '5', 'b7']),
  template('7', '7', 'Dominant seventh', ['1', '3', '5', 'b7']),
  template('m7b5', 'm7b5', 'Half-diminished seventh', ['1', 'b3', 'b5', 'b7']),
  template('dim7', 'dim7', 'Diminished seventh', ['1', 'b3', 'b5', 'bb7']),
  template('mMaj7', 'mMaj7', 'Minor major seventh', ['1', 'b3', '5', '7']),
  template('6', '6', 'Major sixth', ['1', '3', '5', '6']),
  template('m6', 'm6', 'Minor sixth', ['1', 'b3', '5', '6']),
  template('add9', 'add9', 'Added ninth', ['1', '3', '5', '9']),
  template('madd9', 'madd9', 'Minor added ninth', ['1', 'b3', '5', '9']),
  template('6/9', '6/9', 'Sixth and ninth', ['1', '3', '5', '6', '9']),
  template('maj9', 'maj9', 'Major ninth', ['1', '3', '5', '7', '9']),
  template('m9', 'm9', 'Minor ninth', ['1', 'b3', '5', 'b7', '9']),
  template('9', '9', 'Dominant ninth', ['1', '3', '5', 'b7', '9']),
  template('m11', 'm11', 'Minor eleventh', ['1', 'b3', '5', 'b7', '9', '11'], ['9']),
  template(
    'maj13',
    'maj13',
    'Major thirteenth',
    ['1', '3', '5', '7', '9', '11', '13'],
    ['9', '11'],
  ),
  template('13', '13', 'Dominant thirteenth', ['1', '3', '5', 'b7', '9', '11', '13'], ['9', '11']),
];
function normalizeName(name: string): string {
  const value = name.trim().replaceAll('♯', '#').replaceAll('♭', 'b');
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
}
function noteNameAt(root: string, interval: string): string {
  return TonalNote.transpose(`${root}4`, interval).replace(/-?\d+$/, '');
}
function spelledPitch(name: string, midi: number): string {
  const reference = parsePitch(`${name}4`);
  return reference === null ? '?' : `${name}${4 + (midi - reference) / 12}`;
}
export function defineChord(
  rootName: string,
  quality: ChordQuality,
  bassName?: string,
): ChordDefinition | null {
  const root = normalizeName(rootName);
  const rootPitchClass = parsePitchClass(root);
  const selected = CHORD_QUALITIES.find((item) => item.quality === quality);
  const bass = bassName === undefined ? undefined : normalizeName(bassName);
  const bassPitchClass = bass === undefined ? undefined : parsePitchClass(bass);
  if (rootPitchClass === null || !selected || bassPitchClass === null) return null;
  const tones = selected.degrees.map((degree) => {
    const data = DEGREE_DATA[degree];
    return {
      degree,
      semitones: data.semitones,
      pitchClass: pitchClass(rootPitchClass + data.semitones),
      noteName: noteNameAt(root, data.interval),
    };
  });
  if (tones.some((tone) => parsePitchClass(tone.noteName) !== tone.pitchClass)) return null;
  const symbol = `${root}${selected.suffix}${bass === undefined ? '' : `/${bass}`}`;
  return {
    id: `${HARMONY_VERSION}:${symbol}`,
    symbol,
    rootName: root,
    rootPitchClass,
    quality,
    tones,
    ...(bass === undefined ? {} : { bassName: bass, bassPitchClass: bassPitchClass! }),
  };
}
export function parseChordSymbol(text: string): ChordDefinition | null {
  if (text.length > 40) return null;
  const value = text.trim().replaceAll('♯', '#').replaceAll('♭', 'b');
  const match = /^([A-Ga-g](?:#{1,2}|b{1,2})?)(.*)$/.exec(value);
  if (!match) return null;
  let suffix = match[2]!;
  let bass: string | undefined;
  const slash = /\/([A-Ga-g](?:#{1,2}|b{1,2})?)$/.exec(suffix);
  if (slash) {
    bass = slash[1];
    suffix = suffix.slice(0, -slash[0].length);
  }
  const aliases: Record<string, ChordQuality> = {
    maj: 'major',
    M: 'major',
    min: 'minor',
    '-': 'minor',
    '+': 'augmented',
    '°': 'diminished',
    o: 'diminished',
    '°7': 'dim7',
    o7: 'dim7',
    ø7: 'm7b5',
    ø: 'm7b5',
    'm7(b5)': 'm7b5',
    M7: 'maj7',
    Δ7: 'maj7',
    mM7: 'mMaj7',
    m6: 'm6',
    '69': '6/9',
  };
  const selected =
    CHORD_QUALITIES.find((item) => item.suffix === suffix)?.quality ?? aliases[suffix];
  return selected ? defineChord(match[1]!, selected, bass) : null;
}
function validChord(chord: ChordDefinition): ChordDefinition | null {
  const canonical = defineChord(chord.rootName, chord.quality, chord.bassName);
  if (
    !canonical ||
    canonical.rootPitchClass !== chord.rootPitchClass ||
    canonical.bassPitchClass !== chord.bassPitchClass ||
    canonical.tones.length !== chord.tones.length
  )
    return null;
  return canonical.tones.every(
    (tone, index) =>
      tone.degree === chord.tones[index]?.degree &&
      tone.pitchClass === chord.tones[index]?.pitchClass,
  )
    ? canonical
    : null;
}
function interpretation(
  chord: ChordDefinition,
  notes: readonly NoteEvent[],
  contextual: boolean,
): ChordInterpretation {
  const roles: Record<string, ChordDegree> = {};
  const present = new Set<ChordDegree>();
  for (const note of notes) {
    const tone = chord.tones.find((item) => item.pitchClass === pitchClass(note.soundingMidi!));
    if (tone) {
      roles[note.id] = tone.degree;
      present.add(tone.degree);
    }
  }
  const bass = notes.reduce((lowest, note) =>
    note.soundingMidi! < lowest.soundingMidi! ? note : lowest,
  );
  return {
    chord,
    roles,
    bassDegree: roles[bass.id] ?? null,
    bassMidi: bass.soundingMidi!,
    omittedDegrees: chord.tones
      .filter((tone) => !present.has(tone.degree))
      .map((tone) => tone.degree),
    contextual,
  };
}
/** Exact sets may have multiple roots. Omitted tones are accepted only under an explicit chord context. */
export function analyzeHarmony(
  notes: readonly NoteEvent[],
  contextChord?: ChordDefinition,
): HarmonyAnalysis {
  const noteIds = notes.map((note) => note.id);
  const unavailable = (reason: string): HarmonyAnalysis => ({
    status: 'unavailable',
    interpretations: [],
    noteIds,
    reason,
  });
  if (notes.length < 2 || notes.some((note) => !isQuizEligible(note)))
    return unavailable('Select at least two stable, ordinary pitched notes.');
  const observed = new Set(notes.map((note) => pitchClass(note.soundingMidi!)));
  if (contextChord) {
    const chord = validChord(contextChord);
    if (!chord || [...observed].some((pc) => !chord.tones.some((tone) => tone.pitchClass === pc)))
      return unavailable('The sounding notes do not fit the selected chord context.');
    return { status: 'supported', interpretations: [interpretation(chord, notes, true)], noteIds };
  }
  const interpretations: ChordInterpretation[] = [];
  for (const rootPitchClass of [...observed].sort((a, b) => a - b)) {
    const spelling = notes
      .find(
        (note) =>
          pitchClass(note.soundingMidi!) === rootPitchClass &&
          note.spelling &&
          parsePitch(note.spelling) === note.soundingMidi,
      )
      ?.spelling?.replace(/-?\d+$/, '');
    const root =
      spelling ??
      ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][rootPitchClass]!;
    for (const selected of CHORD_QUALITIES) {
      if (selected.degrees.length !== observed.size) continue;
      const chord = defineChord(root, selected.quality);
      if (chord && chord.tones.every((tone) => observed.has(tone.pitchClass)))
        interpretations.push(interpretation(chord, notes, false));
    }
  }
  return interpretations.length
    ? { status: interpretations.length === 1 ? 'supported' : 'ambiguous', interpretations, noteIds }
    : unavailable('No supported complete chord identity fits this set of notes.');
}
/** Suggestions are exact simultaneous sets, never an automatic analysis of an arpeggiated bar. */
export function buildHarmonySpans(
  track: ScoreTrack,
  startTick: number,
  endTick: number,
): HarmonySpan[] {
  if (
    !Number.isFinite(startTick) ||
    !Number.isFinite(endTick) ||
    endTick <= startTick ||
    track.harmonySupported === false
  )
    return [];
  const boundaries = new Set([startTick, endTick]);
  for (const note of track.notes) {
    for (const tick of [note.onsetTicks, note.onsetTicks + note.durationTicks])
      if (tick > startTick && tick < endTick) boundaries.add(tick);
  }
  const ticks = [...boundaries].sort((a, b) => a - b);
  const result: HarmonySpan[] = [];
  for (let index = 0; index < ticks.length - 1; index++) {
    const start = ticks[index]!;
    const notes = soundingAt(track.notes, start);
    const analysis = analyzeHarmony(notes);
    const established = analysis.status === 'supported' ? analysis.interpretations[0]! : null;
    const sourceBass = established?.chord.tones.find(
      (tone) => tone.degree === established.bassDegree,
    );
    const chord = established
      ? defineChord(
          established.chord.rootName,
          established.chord.quality,
          sourceBass && sourceBass.degree !== '1' ? sourceBass.noteName : undefined,
        )
      : null;
    const sourceNoteIds = notes.map((note) => note.id).sort();
    const previous = result.at(-1);
    if (
      previous &&
      previous.endTick === start &&
      previous.chord?.id === chord?.id &&
      previous.sourceNoteIds.join('|') === sourceNoteIds.join('|')
    ) {
      previous.endTick = ticks[index + 1]!;
      continue;
    }
    result.push({
      id: `${track.id}:${start}:${ticks[index + 1]}`,
      startTick: start,
      endTick: ticks[index + 1]!,
      sourceNoteIds,
      chord,
      confirmation: chord ? 'suggested' : 'unavailable',
      source: 'inferred',
      alternatives: analysis.interpretations.map((item) => item.chord),
    });
  }
  return result;
}

const MODE_STEPS: Record<ModeName, readonly number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};
export const MODE_NAMES = Object.keys(MODE_STEPS) as ModeName[];
/** Positions never determine the mode: the tonic and interval collection do. */
export function scaleTones(context: HarmonicContext): ScaleTone[] {
  const tonic = normalizeName(context.tonic);
  const root = parsePitchClass(tonic);
  const steps = MODE_STEPS[context.mode];
  if (root === null || !steps) return [];
  const major = MODE_STEPS.ionian;
  return steps.map((step, index) => {
    const alteration = step - major[index]!;
    const number = index + 1;
    const perfect = [1, 4, 5].includes(number);
    const quality =
      alteration === 0 ? (perfect ? 'P' : 'M') : alteration === 1 ? 'A' : perfect ? 'd' : 'm';
    return {
      degree: number,
      alteration,
      label: `${alteration < 0 ? 'b' : alteration > 0 ? '#' : ''}${number}`,
      noteName: noteNameAt(tonic, `${number}${quality}`),
      pitchClass: pitchClass(root + step),
    };
  });
}
export function romanNumeral(chord: ChordDefinition, context: HarmonicContext): string | null {
  const tones = scaleTones(context);
  const degree = tones.findIndex((tone) => tone.pitchClass === chord.rootPitchClass);
  if (degree < 0) return null;
  const lower = chord.tones.some((tone) => tone.degree === 'b3');
  const numeral = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree]!;
  const suffixes: Record<ChordQuality, string> = {
    major: '',
    minor: '',
    diminished: '°',
    augmented: '+',
    sus2: 'sus2',
    sus4: 'sus4',
    power: '5',
    maj7: 'maj7',
    m7: '7',
    '7': '7',
    m7b5: 'ø7',
    dim7: '°7',
    mMaj7: 'maj7',
    '6': '6',
    m6: '6',
    add9: 'add9',
    madd9: 'add9',
    '6/9': '6/9',
    maj9: 'maj9',
    m9: '9',
    '9': '9',
    m11: '11',
    maj13: 'maj13',
    '13': '13',
  };
  return `${lower ? numeral.toLowerCase() : numeral}${suffixes[chord.quality]}`;
}
export type HarmonicFunction =
  | 'tonic-area'
  | 'predominant'
  | 'dominant'
  | 'context-dependent'
  | 'outside-selected-key';
/** A conventional major-key family, not proof of a chord's function in a phrase. */
export function harmonicFunction(
  chord: ChordDefinition,
  context: HarmonicContext,
): HarmonicFunction {
  const scale = scaleTones(context);
  const classes = new Set(scale.map((tone) => tone.pitchClass));
  if (!scale.length || chord.tones.some((tone) => !classes.has(tone.pitchClass)))
    return 'outside-selected-key';
  if (context.mode !== 'ionian') return 'context-dependent';
  const degree = scale.findIndex((tone) => tone.pitchClass === chord.rootPitchClass) + 1;
  const degrees = new Set(chord.tones.map((tone) => tone.degree));
  if (
    (degree === 5 && degrees.has('3')) ||
    (degree === 7 && degrees.has('b3') && degrees.has('b5'))
  )
    return 'dominant';
  if (degree === 2 || degree === 4) return 'predominant';
  if ([1, 3, 6].includes(degree)) return 'tonic-area';
  return 'context-dependent';
}

const MAX_CANDIDATES = 64;
const MAX_SEARCH_NODES = 150_000;
const MAX_SPANS = 64;
function integer(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
function compareVoicings(a: Voicing, b: Voicing): number {
  return a.localCost - b.localCost || a.id.localeCompare(b.id);
}
function inversionName(degree: ChordDegree): string {
  if (degree === '1') return 'root position';
  if (degree === '3' || degree === 'b3') return 'first inversion';
  if (['5', 'b5', '#5'].includes(degree)) return 'second inversion';
  if (['7', 'b7', 'bb7'].includes(degree)) return 'third inversion';
  return `${degree} in bass`;
}
/** Bounded physical-coordinate search. It validates tones and span, not human fingering comfort. */
export function generateVoicings(
  inputChord: ChordDefinition,
  tuning: readonly number[],
  capo = 0,
  options: VoicingOptions = {},
): VoicingResult {
  const failure = (status: 'invalid' | 'no-match', reason: string): VoicingResult => ({
    status,
    voicings: [],
    reason,
    truncated: false,
    visited: 0,
  });
  const checkedChord = validChord(inputChord);
  if (!checkedChord) return failure('invalid', 'The chord definition is invalid.');
  const chord: ChordDefinition = checkedChord;
  const selected = CHORD_QUALITIES.find((item) => item.quality === chord.quality)!;
  const minFret = options.minFret ?? 0;
  const maxFret = options.maxFret ?? 24;
  const maxSpan = options.maxSpan ?? 4;
  const count = options.voiceCount ?? Math.min(4, chord.tones.length);
  const limit = Math.min(MAX_CANDIDATES, options.maxCandidates ?? MAX_CANDIDATES);
  const strings = options.strings ? [...options.strings] : tuning.map((_, index) => index + 1);
  if (
    !integer(tuning.length, 2, 6) ||
    !integer(capo, 0, 24) ||
    tuning.some((midi) => !integer(midi, 0, 127 - capo)) ||
    !integer(minFret, 0, 24) ||
    !integer(maxFret, minFret, 24) ||
    !integer(maxSpan, 0, 24) ||
    !integer(count, 2, 6) ||
    !integer(limit, 1, MAX_CANDIDATES) ||
    !strings.length ||
    new Set(strings).size !== strings.length ||
    strings.some((string) => !integer(string, 1, tuning.length))
  )
    return failure(
      'invalid',
      'Use distinct physical strings, 2–6 voices, frets 0–24, and valid tuning/capo.',
    );
  if (options.melodyMidi !== undefined && !integer(options.melodyMidi, 0, 127))
    return failure('invalid', 'The melody anchor must be an exact MIDI pitch.');
  strings.sort((a, b) => a - b);
  if (strings.length < count)
    return failure('no-match', 'There are fewer selected strings than requested voices.');
  const rootless = options.rootless ?? false;
  const seventh = chord.tones.some((tone) => ['7', 'b7', 'bb7'].includes(tone.degree));
  if (rootless && !seventh)
    return failure(
      'no-match',
      'Rootless studies require an explicitly selected seventh or extended chord context.',
    );
  const optional = new Set(selected.optionalDegrees);
  if (options.omitFifth !== false && chord.quality !== 'power') optional.add('5');
  const permittedTones = chord.tones.filter((tone) => !rootless || tone.degree !== '1');
  const required = new Set(
    permittedTones.filter((tone) => !optional.has(tone.degree)).map((tone) => tone.degree),
  );
  if (required.size > count)
    return failure(
      'no-match',
      'This voice count cannot contain the required chord tones. Allow the fifth to be omitted or add a voice.',
    );
  let bassClass: number | undefined;
  if (options.bass === 'preserve') bassClass = chord.bassPitchClass ?? chord.rootPitchClass;
  else if (options.bass && options.bass !== 'any') {
    const tone = chord.tones.find((item) => item.degree === options.bass);
    if (!tone) return failure('no-match', 'The requested bass degree is not in this chord.');
    bassClass = tone.pitchClass;
  }
  if (rootless && bassClass === chord.rootPitchClass)
    return failure(
      'no-match',
      'A rootless guitar voicing cannot also put the root in its guitar bass.',
    );
  if (bassClass !== undefined && !permittedTones.some((tone) => tone.pitchClass === bassClass))
    return failure('no-match', 'The requested bass is outside the supported chord tones.');
  if (
    options.melodyMidi !== undefined &&
    !permittedTones.some((tone) => tone.pitchClass === pitchClass(options.melodyMidi!))
  )
    return failure(
      'no-match',
      'The melody is not a permitted tone of this chord. It has not been changed.',
    );
  const candidates = strings.map((string) => {
    const result: VoicingNote[] = [];
    for (let fret = minFret; fret <= maxFret; fret++) {
      if (fret === 0 && options.allowOpenStrings === false) continue;
      const midi = tuning[string - 1]! + capo + fret;
      const tone = permittedTones.find((item) => item.pitchClass === pitchClass(midi));
      if (!tone || midi > 127 || (options.melodyMidi !== undefined && midi > options.melodyMidi))
        continue;
      result.push({
        position: { string, fret },
        midi,
        noteName: tone.noteName,
        label: spelledPitch(tone.noteName, midi),
        degree: tone.degree,
      });
    }
    return result;
  });
  const voicings: Voicing[] = [];
  let visited = 0;
  let matches = 0;
  let exhausted = false;
  const path: VoicingNote[] = [];
  function visit(index: number, lowestFret: number, highestFret: number): void {
    if (++visited > MAX_SEARCH_NODES) {
      exhausted = true;
      return;
    }
    if (path.length === count) {
      const presentDegrees = [...new Set(path.map((note) => note.degree))];
      if ([...required].some((degree) => !presentDegrees.includes(degree))) return;
      const bass = path.reduce((a, b) => (a.midi <= b.midi ? a : b));
      const topMidi = Math.max(...path.map((note) => note.midi));
      if (
        (bassClass !== undefined && pitchClass(bass.midi) !== bassClass) ||
        (options.melodyMidi !== undefined && topMidi !== options.melodyMidi)
      )
        return;
      const notes = path.map((note) => ({ ...note, position: { ...note.position } }));
      const frets = notes.map((note) => note.position.fret);
      const span = lowestFret === Infinity ? 0 : highestFret - lowestFret;
      const min = Math.min(...frets);
      const max = Math.max(...frets);
      const id = `${chord.id}:${notes.map((note) => `${note.position.string}.${note.position.fret}.${note.midi}`).join('-')}`;
      const voicing: Voicing = {
        id,
        chord,
        notes,
        presentDegrees,
        omittedDegrees: chord.tones
          .filter((tone) => !presentDegrees.includes(tone.degree))
          .map((tone) => tone.degree),
        bassDegree: bass.degree,
        bassMidi: bass.midi,
        topMidi,
        bassLabel: bass.noteName,
        inversion: rootless
          ? `${bass.degree} in guitar bass; root omitted`
          : inversionName(bass.degree),
        minFret: min,
        maxFret: max,
        span,
        localCost: span * 2 + max * 0.15 + (max - min) * 0.05,
      };
      matches++;
      voicings.push(voicing);
      voicings.sort(compareVoicings);
      if (voicings.length > limit) voicings.pop();
      return;
    }
    if (index >= strings.length || path.length + strings.length - index < count || exhausted)
      return;
    const missing = [...required].filter((degree) => !path.some((note) => note.degree === degree));
    if (
      missing.length > count - path.length ||
      missing.some(
        (degree) =>
          !candidates.slice(index).some((items) => items.some((note) => note.degree === degree)),
      )
    )
      return;
    for (const note of candidates[index]!) {
      const fret = note.position.fret;
      const nextMin = fret ? Math.min(lowestFret, fret) : lowestFret;
      const nextMax = fret ? Math.max(highestFret, fret) : highestFret;
      if (nextMin !== Infinity && nextMax - nextMin > maxSpan) continue;
      path.push(note);
      visit(index + 1, nextMin, nextMax);
      path.pop();
      if (exhausted) break;
    }
    if (!exhausted) visit(index + 1, lowestFret, highestFret);
  }
  visit(0, Infinity, 0);
  return {
    status: voicings.length ? 'ok' : exhausted ? 'incomplete' : 'no-match',
    voicings,
    truncated: exhausted || matches > limit,
    visited,
    ...(exhausted
      ? {
          reason:
            'The bounded search stopped early; these candidates do not prove global optimality.',
        }
      : !voicings.length
        ? { reason: 'No voicing satisfies all current constraints. None were relaxed.' }
        : {}),
  };
}

export function extractMelodyAnchors(
  notes: readonly NoteEvent[],
  startTick: number,
  endTick: number,
): { status: 'ok' | 'unavailable'; anchors: MelodyAnchor[]; reason?: string } {
  const sounding = notes
    .filter(
      (note) =>
        !note.effects.tieDestination &&
        note.onsetTicks < endTick &&
        note.onsetTicks + note.durationTicks > startTick,
    )
    .sort((a, b) => a.onsetTicks - b.onsetTicks || a.id.localeCompare(b.id));
  if (
    !Number.isFinite(startTick) ||
    !Number.isFinite(endTick) ||
    endTick <= startTick ||
    !sounding.length ||
    sounding.some((note) => !isQuizEligible(note) || !note.position)
  )
    return {
      status: 'unavailable',
      anchors: [],
      reason: 'Select an ordinary fretted monophonic melody voice with stable pitches.',
    };
  const anchors = sounding.map((note) => ({
    noteId: note.id,
    startTick: Math.max(startTick, note.onsetTicks),
    endTick: Math.min(endTick, note.onsetTicks + note.durationTicks),
    midi: note.soundingMidi!,
  }));
  if (anchors.some((anchor, index) => index > 0 && anchor.startTick < anchors[index - 1]!.endTick))
    return {
      status: 'unavailable',
      anchors: [],
      reason: 'The selected melody voice contains overlapping notes. Select a monophonic voice.',
    };
  return { status: 'ok', anchors };
}
export interface VoicingTransition {
  motion: number;
  commonTones: number;
  fretJump: number;
  cost: number;
}
/** A reproducible movement heuristic. It does not estimate musical taste or human comfort. */
export function voicingTransition(from: Voicing, to: Voicing): VoicingTransition {
  const a = from.notes.map((note) => note.midi).sort((x, y) => x - y);
  const b = to.notes.map((note) => note.midi).sort((x, y) => x - y);
  let motion = Math.abs(a.length - b.length) * 12;
  for (let index = 0; index < Math.min(a.length, b.length); index++)
    motion += Math.abs(a[index]! - b[index]!);
  const commonTones = new Set(
    a.map(pitchClass).filter((pc) => b.some((midi) => pitchClass(midi) === pc)),
  ).size;
  const center = (voicing: Voicing) => {
    const frets = voicing.notes
      .filter((note) => note.position.fret > 0)
      .map((note) => note.position.fret);
    return frets.length ? frets.reduce((sum, fret) => sum + fret, 0) / frets.length : 0;
  };
  const fretJump = Math.abs(center(from) - center(to));
  return {
    motion,
    commonTones,
    fretJump,
    cost: motion + 2 * fretJump + Math.abs(from.topMidi - to.topMidi) * 0.5 - commonTones * 0.25,
  };
}
function stableId(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++)
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
interface Path {
  voicings: Voicing[];
  cost: number;
  totalMotion: number;
  commonTones: number;
  maxFretJump: number;
}
function comparePaths(a: Path, b: Path): number {
  return (
    a.cost - b.cost ||
    a.voicings
      .map((item) => item.id)
      .join('|')
      .localeCompare(b.voicings.map((item) => item.id).join('|'))
  );
}
/** Top paths among the bounded candidates, using confirmed chords and immutable source references. */
export function generateProgressionVariations(
  spans: readonly HarmonySpan[],
  tuning: readonly number[],
  capo = 0,
  options: ProgressionOptions = {},
): ProgressionResult {
  const issues: ProgressionResult['issues'] = [];
  const empty = (status: ProgressionResult['status'], reason: string): ProgressionResult => ({
    status,
    variations: [],
    issues: [{ spanId: '', reason }],
    candidateCounts: [],
  });
  if (!spans.length || spans.length > MAX_SPANS)
    return empty('invalid', 'Select between one and 64 harmonic spans.');
  if (new Set(spans.map((span) => span.id)).size !== spans.length)
    return empty('invalid', 'Harmonic span IDs must be unique.');
  const limit = Math.min(3, options.maxPaths ?? 3);
  if (!integer(limit, 1, 3)) return empty('invalid', 'Choose one to three progression paths.');
  const events: { span: HarmonySpan; startTick: number; endTick: number; melodyMidi?: number }[] =
    [];
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index]!;
    if (
      !Number.isFinite(span.startTick) ||
      !Number.isFinite(span.endTick) ||
      span.endTick <= span.startTick ||
      (index > 0 && span.startTick < spans[index - 1]!.endTick)
    )
      return empty(
        'invalid',
        'Harmonic spans must be ordered, nonoverlapping, and have positive duration.',
      );
    if (span.confirmation !== 'confirmed' || !span.chord) {
      issues.push({
        spanId: span.id,
        reason: 'Confirm a chord for this span before generating a variation.',
      });
      continue;
    }
    if (!options.preserveMelody) {
      events.push({ span, startTick: span.startTick, endTick: span.endTick });
      continue;
    }
    const anchors = [...(span.melodyAnchors ?? [])].sort((a, b) => a.startTick - b.startTick);
    if (
      !anchors.length ||
      anchors.some(
        (anchor, anchorIndex) =>
          !anchor.noteId ||
          !integer(anchor.midi, 0, 127) ||
          !Number.isFinite(anchor.startTick) ||
          !Number.isFinite(anchor.endTick) ||
          anchor.startTick < span.startTick ||
          anchor.endTick > span.endTick ||
          anchor.endTick <= anchor.startTick ||
          (anchorIndex > 0 && anchor.startTick < anchors[anchorIndex - 1]!.endTick),
      )
    ) {
      issues.push({
        spanId: span.id,
        reason:
          'Preserving melody requires explicit, nonoverlapping ordinary melody anchors in this span.',
      });
      continue;
    }
    const boundaries = [
      ...new Set([
        span.startTick,
        span.endTick,
        ...anchors.flatMap((anchor) => [anchor.startTick, anchor.endTick]),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const startTick = boundaries[i]!;
      const anchor = anchors.find(
        (item) => item.startTick <= startTick && item.endTick > startTick,
      );
      events.push({
        span,
        startTick,
        endTick: boundaries[i + 1]!,
        ...(anchor ? { melodyMidi: anchor.midi } : {}),
      });
    }
  }
  if (issues.length) return { status: 'incomplete', variations: [], issues, candidateCounts: [] };
  if (events.length > MAX_SPANS)
    return empty('invalid', 'The melody creates more than 64 events. Select a shorter phrase.');
  const banks = events.map((event) =>
    generateVoicings(event.span.chord!, tuning, capo, {
      ...options,
      ...(event.melodyMidi === undefined ? {} : { melodyMidi: event.melodyMidi }),
      maxCandidates: MAX_CANDIDATES,
    }),
  );
  const candidateCounts = banks.map((bank) => bank.voicings.length);
  for (let index = 0; index < banks.length; index++) {
    const bank = banks[index]!;
    if (!bank.voicings.length)
      issues.push({
        spanId: events[index]!.span.id,
        reason: bank.reason ?? 'No candidates fit this span.',
      });
  }
  if (issues.length)
    return {
      status: banks.some((bank) => bank.status === 'invalid')
        ? 'invalid'
        : banks.some((bank) => bank.status === 'incomplete')
          ? 'incomplete'
          : 'no-match',
      variations: [],
      issues,
      candidateCounts,
    };
  let state: Path[][] = banks[0]!.voicings.map((voicing) => [
    {
      voicings: [voicing],
      cost: voicing.localCost * 0.1,
      totalMotion: 0,
      commonTones: 0,
      maxFretJump: 0,
    },
  ]);
  for (let index = 1; index < banks.length; index++) {
    state = banks[index]!.voicings.map((voicing) => {
      const candidates: Path[] = [];
      for (const paths of state) {
        const transition = voicingTransition(paths[0]!.voicings.at(-1)!, voicing);
        for (const path of paths)
          candidates.push({
            voicings: [...path.voicings, voicing],
            cost: path.cost + transition.cost + voicing.localCost * 0.1,
            totalMotion: path.totalMotion + transition.motion,
            commonTones: path.commonTones + transition.commonTones,
            maxFretJump: Math.max(path.maxFretJump, transition.fretJump),
          });
      }
      return candidates.sort(comparePaths).slice(0, limit);
    });
  }
  const paths = state.flat().sort(comparePaths).slice(0, limit);
  const variations = paths.map(
    (path): ProgressionVariation => ({
      id: `${HARMONY_VERSION}:variation:${stableId(events.map((event, index) => `${event.span.id}:${event.startTick}:${event.endTick}:${path.voicings[index]!.id}`).join('|'))}`,
      version: HARMONY_VERSION,
      events: events.map((event, index) => ({
        spanId: event.span.id,
        startTick: event.startTick,
        endTick: event.endTick,
        voicing: path.voicings[index]!,
      })),
      cost: path.cost,
      totalMotion: path.totalMotion,
      commonTones: path.commonTones,
      maxFretJump: path.maxFretJump,
      omittedDegrees: [...new Set(path.voicings.flatMap((voicing) => voicing.omittedDegrees))],
    }),
  );
  return {
    status: 'ok',
    variations,
    issues: banks.flatMap((bank, index) =>
      bank.reason ? [{ spanId: events[index]!.span.id, reason: bank.reason }] : [],
    ),
    candidateCounts,
  };
}
