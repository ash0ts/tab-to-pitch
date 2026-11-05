import type { FretPosition } from './types.js';
import type { Voicing } from './harmony.js';

const TUNING = [64, 59, 55, 50, 45, 40] as const;
export const VOICING_FEATURES = [
  'fretted_span',
  'fret_center',
  'open_strings',
  'string_span',
  'skipped_strings',
  'bass_movement',
  'top_movement',
  'sorted_voice_movement',
  'hand_center_movement',
  'unchanged_positions',
] as const;
export interface VoicingRankerModel {
  schemaVersion: 1;
  id: 'guitarset-observed-choice-v1';
  features: readonly string[];
  weights: number[];
  mean: number[];
  std: number[];
}
type PositionedPitch = { position: FretPosition; midi: number };
type Shape = readonly number[];
export interface RankedVoicings {
  status: 'ranked' | 'unsupported';
  voicings: Voicing[];
  reason?: string;
  scores?: { id: string; score: number }[];
}

export function validateVoicingRankerModel(value: unknown): VoicingRankerModel | null {
  if (!value || typeof value !== 'object') return null;
  const model = value as Partial<VoicingRankerModel>;
  if (
    model.schemaVersion !== 1 ||
    model.id !== 'guitarset-observed-choice-v1' ||
    JSON.stringify(model.features) !== JSON.stringify(VOICING_FEATURES)
  )
    return null;
  if (
    ![model.weights, model.mean, model.std].every(
      (array) =>
        Array.isArray(array) &&
        array.length === VOICING_FEATURES.length &&
        array.every(Number.isFinite),
    )
  )
    return null;
  if (!model.std!.every((value) => value > 0)) return null;
  return model as VoicingRankerModel;
}

function pc(midi: number): number {
  return ((midi % 12) + 12) % 12;
}
function fretted(shape: Shape): number[] {
  return shape.filter((fret) => fret > 0);
}
function center(shape: Shape): number {
  const frets = fretted(shape);
  return frets.length ? frets.reduce((sum, fret) => sum + fret, 0) / frets.length : 0;
}
function span(shape: Shape): number {
  const frets = fretted(shape);
  return frets.length ? Math.max(...frets) - Math.min(...frets) : 0;
}
function pitches(shape: Shape): number[] {
  return shape
    .flatMap((fret, string) => (fret >= 0 ? [TUNING[string]! + fret] : []))
    .sort((a, b) => a - b);
}
function pitchClasses(shape: Shape): number[] {
  return pitches(shape)
    .map(pc)
    .sort((a, b) => a - b);
}
function supportedShape(shape: Shape): boolean {
  if (shape.length !== 6 || shape.some((fret) => !Number.isInteger(fret) || fret < -1 || fret > 24))
    return false;
  const notes = pitches(shape);
  const distinct = new Set(notes.map(pc)).size;
  return (
    notes.length >= 3 && notes.length <= 6 && distinct >= 3 && distinct <= 4 && span(shape) <= 4
  );
}
function fromNotes(notes: readonly PositionedPitch[]): Shape | null {
  const shape = Array<number>(6).fill(-1);
  for (const note of notes) {
    const { string, fret } = note.position;
    if (
      !Number.isInteger(string) ||
      string < 1 ||
      string > 6 ||
      !Number.isInteger(fret) ||
      fret < 0 ||
      fret > 24 ||
      shape[string - 1] !== -1 ||
      note.midi !== TUNING[string - 1]! + fret
    )
      return null;
    shape[string - 1] = fret;
  }
  return supportedShape(shape) ? shape : null;
}
function interpolate(values: readonly number[], fraction: number): number {
  const position = fraction * (values.length - 1);
  const lo = Math.floor(position),
    hi = Math.ceil(position);
  return values[lo]! + (values[hi]! - values[lo]!) * (position - lo);
}

/** Same unstandardized features as the frozen Python choice model. */
export function voicingRankFeatures(shape: Shape, previous: Shape): number[] | null {
  if (!supportedShape(shape) || !supportedShape(previous)) return null;
  const ps = pitches(shape),
    qs = pitches(previous);
  const strings = shape.flatMap((fret, string) => (fret >= 0 ? [string] : []));
  const stringSpan = Math.max(...strings) - Math.min(...strings);
  const count = Math.max(ps.length, qs.length);
  let movement = 0;
  for (let i = 0; i < count; i++)
    movement += Math.abs(interpolate(ps, i / (count - 1)) - interpolate(qs, i / (count - 1)));
  return [
    span(shape),
    center(shape),
    shape.filter((fret) => fret === 0).length,
    stringSpan,
    stringSpan + 1 - strings.length,
    Math.abs(ps[0]! - qs[0]!),
    Math.abs(ps.at(-1)! - qs.at(-1)!),
    movement / count,
    Math.abs(center(shape) - center(previous)),
    shape.filter((fret, string) => fret >= 0 && fret === previous[string]).length,
  ];
}

export function scoreVoicingShape(
  shape: Shape,
  previous: Shape,
  model: VoicingRankerModel,
): number | null {
  if (!validateVoicingRankerModel(model)) return null;
  const values = voicingRankFeatures(shape, previous);
  if (!values) return null;
  const score = values.reduce(
    (sum, value, index) =>
      sum + ((value - model.mean[index]!) / model.std[index]!) * model.weights[index]!,
    0,
  );
  return Number.isFinite(score) ? score : null;
}

/** Optional ordering only. All unsupported calls preserve the supplied order. */
export function rankVoicingsWithModel(input: {
  voicings: readonly Voicing[];
  previous: readonly PositionedPitch[];
  requestedPitchClassMultiset: readonly number[];
  tuningMidi: readonly number[];
  capo: number;
  model: VoicingRankerModel;
}): RankedVoicings {
  const unchanged = (reason: string): RankedVoicings => ({
    status: 'unsupported',
    voicings: [...input.voicings],
    reason,
  });
  if (!validateVoicingRankerModel(input.model))
    return unchanged('The experimental model could not be validated.');
  if (input.capo !== 0 || JSON.stringify(input.tuningMidi) !== JSON.stringify(TUNING))
    return unchanged('Recorded-choice ordering currently supports standard tuning without a capo.');
  const previous = fromNotes(input.previous);
  if (!previous)
    return unchanged(
      'Choose a previous shape with three to six notes, three or four note names, and a fretted span of four or less.',
    );
  const target = [...input.requestedPitchClassMultiset].sort((a, b) => a - b);
  if (
    target.some((value) => !Number.isInteger(value) || value < 0 || value > 11) ||
    target.length < 3 ||
    target.length > 6 ||
    new Set(target).size < 3 ||
    new Set(target).size > 4
  )
    return unchanged('This chord-tone combination is outside the recorded-choice experiment.');
  if (!input.voicings.length) return unchanged('No valid shapes are available to order.');
  const scored: { voicing: Voicing; shape: Shape; score: number }[] = [];
  for (const voicing of input.voicings) {
    const shape = fromNotes(voicing.notes);
    if (!shape || JSON.stringify(pitchClasses(shape)) !== JSON.stringify(target))
      return unchanged(
        'Recorded-choice ordering requires the same chord tones and doubled notes in every candidate.',
      );
    const score = scoreVoicingShape(shape, previous, input.model);
    if (score === null) return unchanged('This shape is outside the recorded-choice experiment.');
    scored.push({ voicing, shape, score });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    for (let string = 0; string < 6; string++) {
      const difference = a.shape[string]! - b.shape[string]!;
      if (difference) return difference;
    }
    return 0;
  });
  return {
    status: 'ranked',
    voicings: scored.map((item) => item.voicing),
    scores: scored.map((item) => ({ id: item.voicing.id, score: item.score })),
  };
}
