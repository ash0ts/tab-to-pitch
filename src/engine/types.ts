/** All score pitches are concert pitch. String 1 is the top tablature line. */
export interface FretPosition {
  string: number;
  fret: number;
}

export interface PitchCurvePoint {
  offset: number;
  semitones: number;
}

export interface NoteEffects {
  dead?: boolean;
  ghost?: boolean;
  staccato?: boolean;
  palmMute?: boolean;
  letRing?: boolean;
  durationPercent?: number;
  harmonic?: string;
  tieDestination?: boolean;
  tieOriginId?: string;
  bend?: PitchCurvePoint[];
  slide?: boolean;
  unsupported?: string[];
}

export interface NoteEvent {
  id: string;
  trackId: string;
  staffIndex: number;
  voiceIndex: number;
  measureIndex: number;
  beatId: string;
  onsetTicks: number;
  durationTicks: number;
  soundingMidi: number | null;
  spelling: string | null;
  spellingSource?: 'explicit' | 'key-context';
  position: FretPosition | null;
  effects: NoteEffects;
  eligible: boolean;
}

export interface ScoreTrack {
  id: string;
  index: number;
  name: string;
  tuningMidi: number[];
  capo: number;
  notes: NoteEvent[];
  isPercussion?: boolean;
  supported?: boolean;
  /** False when native articulation timing is not represented by note durations. */
  harmonySupported?: boolean;
  chordSymbols?: { startTick: number; symbol: string }[];
}

export interface ScoreMeasure {
  index: number;
  startTicks: number;
  durationTicks: number;
  tempoBpm: number;
  meter: [number, number];
}

export interface ScoreDocument {
  id: string;
  hash: string;
  title: string;
  artist?: string;
  tracks: ScoreTrack[];
  measures: ScoreMeasure[];
  warnings?: string[];
  /** Expanded transport ticks. Note onsets and measures retain notation ticks. */
  playbackOccurrences?: {
    measureIndex: number;
    occurrence: number;
    startTick: number;
    endTick: number;
  }[];
  /** Tempo events use expanded transport ticks, including repeats. */
  tempoEvents?: { tick: number; bpm: number; measureIndex: number }[];
}

export type ExerciseKind =
  | 'note-name'
  | 'note-location'
  | 'interval'
  | 'triad-role'
  | 'chord-tone'
  | 'next-target'
  | 'changed-tone'
  | 'voice-connection';
export type PracticeMode = 'learn' | 'recall' | 'transfer' | 'delayed';
export type AttemptOutcome = 'correct' | 'incorrect' | 'revealed' | 'interrupted' | 'self-reported';

export interface ExerciseChoice {
  id: string;
  label: string;
  value: string;
}

export type ExerciseAnswer =
  | { type: 'pitch'; midi: number; octaveRequired?: boolean }
  | { type: 'position'; positions: FretPosition[] }
  | { type: 'position-pair'; pairs: { from: FretPosition; to: FretPosition }[] }
  | { type: 'text'; accepted: string[] };

export interface ExerciseDefinition {
  id: string;
  scoreId: string;
  trackId: string;
  skillId: ExerciseKind;
  kind: ExerciseKind;
  prompt: string;
  noteIds: string[];
  choices: ExerciseChoice[];
  answer: ExerciseAnswer;
  mask: { noteIds: string[]; hide: 'pitch' | 'fret' | 'interval' | 'role' };
  explanation: string;
  partition: 'practice' | 'heldout';
  transferKeys?: string[];
  listeningExample?: number[][];
  stimulus?: { id: string; version: string; pitches: number[][]; exposureKeys: string[] };
}

export interface AttemptRecord {
  id: string;
  exerciseId: string;
  scoreId: string;
  trackId: string;
  skillId: ExerciseKind;
  kind: ExerciseKind;
  noteIds: string[];
  response: string;
  outcome: AttemptOutcome;
  assisted: boolean;
  hintsUsed: string[];
  startedAt: number;
  answeredAt: number;
  responseMs: number;
  mode: PracticeMode;
  partition: 'practice' | 'heldout';
  evidence: 'answer' | 'self-report';
  transferKeys?: string[];
}

export interface GradeResult {
  correct: boolean;
  feedback: string;
}

export interface ExerciseSelection {
  exercise: ExerciseDefinition;
  mode: PracticeMode;
  reason: string;
  support: 'guided' | 'hidden';
}
