import { createHash } from 'node:crypto';
import type { NoteEvent, ScoreDocument } from '../../src/engine/types.js';
import { createExerciseBank, exerciseLoop } from '../../src/engine/exercises.js';
import { coachContextSchema, type CoachContext } from '../../src/shared/coach.js';

export const DATASET_VERSION = 'guitarset-1.1.0';
export const ADAPTER_VERSION = 'guitarset-observed-pitch-v1';
export const ARCHIVE_MD5 = 'b39b78e63d3446f2e54ddb7a54df9b10';
export const ARCHIVE_SHA256 = '8daa02e6417ccca1685feb44b135e95928ad7037e5032ecb326b5791856fda99';
export const OPEN_MIDI_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64] as const;
export const EXCLUDED_RECORDINGS: Record<string, string> = {
  '04_BN3-154-E_comp': 'Upstream issue 5: note timings shifted by 0.409 seconds',
  '04_Jazz1-200-B_comp': 'Upstream issue 5: note timings shifted by 0.309 seconds',
  '02_Funk2-119-G_comp': 'Upstream issue 4: duplicated note annotation',
};
export type Split = 'train' | 'validation' | 'test' | 'cross-group' | 'upstream-erratum';
interface Observation<T> {
  time: number;
  duration: number;
  value: T;
  confidence: number | null;
}
interface ContourValue {
  frequency: number;
  voiced: boolean;
  index: number;
}
interface Annotation {
  namespace: string;
  annotation_metadata: { data_source: string };
  data: Observation<unknown>[] | { time: number[]; duration: number[]; value: ContourValue[] };
}
export interface Jams {
  file_metadata: { duration: number; title: string };
  annotations: Annotation[];
}
export interface SourceNote {
  id: string;
  sourceStringIndex: number;
  sourceObservationIndex: number;
  timeSeconds: number;
  durationSeconds: number;
  observedMidi: number;
  nearestMidi: number;
  centsFromNearest: number;
  inferredFret: number;
  contourFrames: number;
  contourMedianMidi: number | null;
  contourCentral80RangeSemitones: number | null;
  exclusionReasons: string[];
}
export interface NormalizedRecording {
  id: string;
  sourceSha256: string;
  performerId: string;
  style: string;
  progressionFamily: string;
  leadSheetId: string;
  rendition: 'comp' | 'solo';
  split: Split;
  durationSeconds: number;
  tempoBpm: number;
  sourceNotes: SourceNote[];
  score: ScoreDocument;
}
export function recordingIdentity(id: string) {
  const match = id.match(/^(0[0-5])_(BN|Funk|Jazz|Rock|SS)([123])-(\d+)-([A-G][b#]?)_(comp|solo)$/);
  if (!match) throw new Error(`Unexpected GuitarSet recording identity: ${id}`);
  const [, performerId, style, progressionFamily, , , rendition] = match;
  const split: Split = EXCLUDED_RECORDINGS[id]
    ? 'upstream-erratum'
    : Number(performerId) <= 3 && progressionFamily === '1'
      ? 'train'
      : performerId === '04' && progressionFamily === '2'
        ? 'validation'
        : performerId === '05' && progressionFamily === '3'
          ? 'test'
          : 'cross-group';
  return {
    performerId: performerId!,
    style: style!,
    progressionFamily: progressionFamily!,
    leadSheetId: id.slice(3).replace(/_(comp|solo)$/, ''),
    rendition: rendition as 'comp' | 'solo',
    split,
  };
}
function observations<T>(annotation: Annotation): Observation<T>[] {
  if (!Array.isArray(annotation.data))
    throw new Error(`Expected event array for ${annotation.namespace}`);
  return annotation.data as Observation<T>[];
}
function quantile(sorted: number[], p: number): number {
  const point = (sorted.length - 1) * p;
  const lo = Math.floor(point),
    hi = Math.ceil(point);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (point - lo);
}
function lowerBound(values: { time: number }[], time: number) {
  let lo = 0,
    hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid]!.time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function contour(annotation: Annotation) {
  const data = annotation.data;
  if (Array.isArray(data)) throw new Error('Expected columnar GuitarSet contour');
  if (data.time.length !== data.value.length) throw new Error('Contour column length mismatch');
  return data.time
    .flatMap((time, index) => {
      const value = data.value[index]!;
      return Number.isFinite(time) &&
        value.voiced &&
        Number.isFinite(value.frequency) &&
        value.frequency > 0
        ? [{ time, midi: 69 + 12 * Math.log2(value.frequency / 440) }]
        : [];
    })
    .sort((a, b) => a.time - b.time);
}
export function normalizeRecording(id: string, bytes: Buffer): NormalizedRecording {
  const jams = JSON.parse(bytes.toString('utf8')) as Jams;
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const identity = recordingIdentity(id);
  const durationSeconds = jams.file_metadata.duration;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error('Invalid recording duration');
  const tempoAnnotations = jams.annotations.filter((a) => a.namespace === 'tempo');
  if (tempoAnnotations.length !== 1) throw new Error('Expected one tempo annotation');
  const tempos = observations<number>(tempoAnnotations[0]!);
  if (tempos.length !== 1 || !Number.isFinite(tempos[0]!.value) || tempos[0]!.value <= 0)
    throw new Error('Unsupported tempo map');
  const tempoBpm = tempos[0]!.value;
  const ticksPerSecond = (tempoBpm * 960) / 60;
  const ticks = (seconds: number) => Math.round(seconds * ticksPerSecond);
  const beatAnnotation = jams.annotations.find((a) => a.namespace === 'beat_position');
  if (!beatAnnotation) throw new Error('Missing beat annotations');
  const beats = observations<{
    position: number;
    measure: number;
    beat_units: number;
    num_beats: number;
  }>(beatAnnotation);
  const downbeats = beats.filter((b) => b.value.position === 1).sort((a, b) => a.time - b.time);
  if (downbeats.length === 0 || downbeats[0]!.time !== 0)
    throw new Error('Unsupported pickup or missing first measure');
  const measures = downbeats.map((beat, index) => ({
    index,
    startTicks: ticks(beat.time),
    durationTicks: ticks(downbeats[index + 1]?.time ?? durationSeconds) - ticks(beat.time),
    tempoBpm,
    meter: [beat.value.num_beats, beat.value.beat_units] as [number, number],
  }));
  if (measures.some((m) => m.durationTicks <= 0)) throw new Error('Invalid measure boundary');
  const trackId = 'guitarset-track';
  const sourceNotes: SourceNote[] = [];
  const notes: NoteEvent[] = [];
  const midiAnnotations = jams.annotations.filter((a) => a.namespace === 'note_midi');
  const stringIds = midiAnnotations.map((a) => Number(a.annotation_metadata.data_source));
  if (
    midiAnnotations.length !== 6 ||
    new Set(stringIds).size !== 6 ||
    stringIds.some((s) => !Number.isInteger(s) || s < 0 || s > 5)
  )
    throw new Error('Expected six distinct string note annotations');
  for (const annotation of midiAnnotations) {
    const stringIndex = Number(annotation.annotation_metadata.data_source);
    const contourAnnotation = jams.annotations.find(
      (a) =>
        a.namespace === 'pitch_contour' &&
        a.annotation_metadata.data_source === String(stringIndex),
    );
    if (!contourAnnotation) throw new Error(`Missing contour for string ${stringIndex}`);
    const frames = contour(contourAnnotation);
    for (const [index, source] of observations<number>(annotation).entries()) {
      if (![source.time, source.duration, source.value].every(Number.isFinite))
        throw new Error('Non-finite source note');
      const noteId = `gs:${sourceSha256.slice(0, 12)}:s${stringIndex}:n${index}`;
      const nearestMidi = Math.round(source.value);
      const fret = nearestMidi - OPEN_MIDI_LOW_TO_HIGH[stringIndex]!;
      const start = lowerBound(frames, source.time),
        end = lowerBound(frames, source.time + source.duration);
      const midiFrames = frames
        .slice(start, end)
        .map((f) => f.midi)
        .sort((a, b) => a - b);
      const median = midiFrames.length ? quantile(midiFrames, 0.5) : null;
      const spread = midiFrames.length
        ? quantile(midiFrames, 0.9) - quantile(midiFrames, 0.1)
        : null;
      const exclusionReasons: string[] = [];
      if (identity.split === 'upstream-erratum') exclusionReasons.push('upstream-erratum');
      if (
        source.time < 0 ||
        source.duration <= 0 ||
        source.time + source.duration > durationSeconds + 1e-6
      )
        exclusionReasons.push('outside-recording-time');
      if (fret < 0 || fret > 24) exclusionReasons.push('outside-24-fret-neck');
      if (Math.abs(source.value - nearestMidi) > 0.35) exclusionReasons.push('off-grid-pitch');
      if (source.duration < 0.04) exclusionReasons.push('shorter-than-40ms');
      if (midiFrames.length < 3) exclusionReasons.push('insufficient-contour');
      if (spread !== null && spread > 0.5) exclusionReasons.push('unstable-contour');
      if (median !== null && Math.abs(median - source.value) > 0.2)
        exclusionReasons.push('contour-note-disagreement');
      sourceNotes.push({
        id: noteId,
        sourceStringIndex: stringIndex,
        sourceObservationIndex: index,
        timeSeconds: source.time,
        durationSeconds: source.duration,
        observedMidi: source.value,
        nearestMidi,
        centsFromNearest: 100 * (source.value - nearestMidi),
        inferredFret: fret,
        contourFrames: midiFrames.length,
        contourMedianMidi: median,
        contourCentral80RangeSemitones: spread,
        exclusionReasons,
      });
      if (exclusionReasons.includes('outside-recording-time')) continue;
      const onsetTicks = ticks(source.time);
      let measureIndex = 0;
      for (const measure of measures) {
        if (measure.startTicks <= onsetTicks) measureIndex = measure.index;
        else break;
      }
      notes.push({
        id: noteId,
        trackId,
        staffIndex: 0,
        voiceIndex: 0,
        measureIndex,
        beatId: `${noteId}:attack`,
        onsetTicks,
        durationTicks: Math.max(1, ticks(source.duration)),
        soundingMidi: nearestMidi,
        spelling: null,
        position: fret >= 0 && fret <= 24 ? { string: 6 - stringIndex, fret } : null,
        effects: exclusionReasons.length ? { unsupported: [...exclusionReasons] } : {},
        eligible: exclusionReasons.length === 0,
      });
    }
  }
  notes.sort((a, b) => a.onsetTicks - b.onsetTicks || a.id.localeCompare(b.id));
  return {
    id,
    sourceSha256,
    ...identity,
    durationSeconds,
    tempoBpm,
    sourceNotes,
    score: {
      id: `gs-${sourceSha256.slice(0, 24)}`,
      hash: sourceSha256,
      title: `GuitarSet ${id}`,
      tracks: [
        {
          id: trackId,
          index: 0,
          name: 'Observed guitar',
          tuningMidi: [...OPEN_MIDI_LOW_TO_HIGH].reverse(),
          capo: 0,
          notes,
          supported: true,
          harmonySupported: false,
        },
      ],
      measures,
      warnings: [
        'Research adapter: frets inferred from standard tuning and rounded measured pitch.',
        'No imported spelling or articulation labels. Interval and triad-role generation withheld.',
        'Timing preserves observed attacks at 960 ticks per quarter note; no notation quantization.',
        'Contour-based eligibility is an experimental filter, not independent technique verification.',
      ],
    },
  };
}
export interface DatasetCoachCase {
  id: string;
  recordingId: string;
  sourceSha256: string;
  performerId: string;
  progressionFamily: string;
  style: string;
  rendition: 'comp' | 'solo';
  split: Split;
  context: CoachContext;
  evidenceBasis: 'real-recorded-music-with-no-learner-history';
  exerciseIds: string[];
  noteFacts: {
    id: string;
    midi: number;
    string: number;
    inferredFret: number;
    observedMidi: number;
  }[];
}
export function makeCoachCase(record: NormalizedRecording): DatasetCoachCase | null {
  if (record.split === 'upstream-erratum') return null;
  const track = record.score.tracks[0]!;
  const bank = createExerciseBank(record.score, track.id, {
    maxFret: 24,
    octaveRequired: true,
    reserveHeldout: false,
  });
  // A bounded phrase with both pitch and location tasks. No authored learner outcomes.
  for (const measure of record.score.measures) {
    const phraseNotes = track.notes.filter((n) => n.measureIndex === measure.index);
    const eligible = phraseNotes.filter((n) => n.eligible);
    if (eligible.length < 2) continue;
    const phraseIds = new Set(eligible.map((n) => n.id));
    const exercises = bank.filter((e) => e.noteIds.every((id) => phraseIds.has(id))).slice(0, 6);
    if (new Set(exercises.map((e) => e.kind)).size < 2) continue;
    const candidates = exercises.map((e) => {
      const loop = exerciseLoop(e, record.score)!;
      return {
        id: e.id,
        kind: e.kind,
        skillId: e.skillId,
        noteIds: e.noteIds,
        tempoBpm: loop.tempoBpm,
        loop: { startTick: loop.startTick, endTick: loop.endTick },
      };
    });
    const context = coachContextSchema.parse({
      schemaVersion: 1,
      phrase: {
        id: `gs-phrase-${record.sourceSha256.slice(0, 16)}-m${measure.index}`,
        noteCount: eligible.length,
        distinctPitchClasses: new Set(eligible.map((n) => n.soundingMidi! % 12)).size,
        stringCrossings: eligible
          .slice(1)
          .filter((n, i) => n.position!.string !== eligible[i]!.position!.string).length,
        positionChanges: eligible
          .slice(1)
          .filter((n, i) => n.position!.fret !== eligible[i]!.position!.fret).length,
      },
      evidence: [],
      candidates,
    });
    const selectedIds = new Set(exercises.flatMap((e) => e.noteIds));
    const sourceById = new Map(record.sourceNotes.map((n) => [n.id, n]));
    return {
      id: `guitarset-${record.id}`,
      recordingId: record.id,
      sourceSha256: record.sourceSha256,
      performerId: record.performerId,
      progressionFamily: record.progressionFamily,
      style: record.style,
      rendition: record.rendition,
      split: record.split,
      context,
      evidenceBasis: 'real-recorded-music-with-no-learner-history',
      exerciseIds: exercises.map((e) => e.id),
      noteFacts: eligible
        .filter((n) => selectedIds.has(n.id))
        .map((n) => ({
          id: n.id,
          midi: n.soundingMidi!,
          string: n.position!.string,
          inferredFret: n.position!.fret,
          observedMidi: sourceById.get(n.id)!.observedMidi,
        })),
    };
  }
  return null;
}
