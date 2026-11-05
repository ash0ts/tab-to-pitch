import {
  analyzeTriad,
  isQuizEligible,
  midiToSpn,
  noteLabel,
  soundingAt,
  spelledInterval,
} from './theory';
import { displayNoteLabel, findNotePositions } from './exploration';
import type {
  ExerciseChoice,
  ExerciseDefinition,
  ExerciseKind,
  NoteEvent,
  ScoreDocument,
} from './types';

export const SKILL_ORDER: readonly ExerciseKind[] = [
  'note-name',
  'note-location',
  'interval',
  'triad-role',
  'chord-tone',
  'next-target',
  'changed-tone',
  'voice-connection',
];
export const SKILL_LABELS: Record<ExerciseKind, string> = {
  'note-name': 'Name the note',
  'note-location': 'Find the note across the neck',
  interval: 'Name the interval',
  'triad-role': 'Read chord tones',
  'chord-tone': 'Identify a chord tone',
  'next-target': 'Find the next chord’s target',
  'changed-tone': 'Identify the added tone',
  'voice-connection': 'Connect two chord tones',
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Compact non-cryptographic identity; the version changes with the grading contract. */
function exerciseHash(value: string): string {
  let hash = 14695981039346656037n;
  for (const char of value)
    hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 1099511628211n);
  return hash.toString(36);
}

function choices(values: string[], seed: string, labels = values): ExerciseChoice[] {
  return values
    .map((value, index) => ({ id: `${seed}:choice:${index}`, label: labels[index]!, value }))
    .sort((left, right) => stableHash(left.id) - stableHash(right.id));
}

function pitchChoices(midi: number, seed: string, octaveRequired: boolean): ExerciseChoice[] {
  const values = [midi, midi - 1, midi + 2, midi + (octaveRequired ? 12 : 5)].filter(
    (value) => value >= 0 && value <= 127,
  );
  return choices(
    values.map((value) =>
      octaveRequired ? midiToSpn(value) : midiToSpn(value).replace(/-?\d+$/, ''),
    ),
    seed,
  );
}

export interface ExerciseBankOptions {
  maxFret?: number;
  octaveRequired?: boolean;
  /** Note locations match the note name across octaves unless explicitly made exact. */
  locationMatch?: 'pitch-class' | 'exact';
  /** Presentation only; does not alter grading or exercise identity. */
  showOctaves?: boolean;
  /** Reserve the last quarter of measures when at least four measures are available. */
  reserveHeldout?: boolean;
}

export function createExerciseBank(
  score: ScoreDocument,
  trackId: string,
  options: ExerciseBankOptions = {},
): ExerciseDefinition[] {
  const track = score.tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.isPercussion || track.supported === false) return [];
  const notes = track.notes
    .filter(isQuizEligible)
    .sort((a, b) => a.onsetTicks - b.onsetTicks || a.id.localeCompare(b.id));
  const measureIndices = [...new Set(score.measures.map((measure) => measure.index))].sort(
    (a, b) => a - b,
  );
  const heldoutStart =
    options.reserveHeldout !== false && measureIndices.length >= 4
      ? measureIndices[Math.floor(measureIndices.length * 0.75)]!
      : Infinity;
  const transferKey = (note: NoteEvent) =>
    `${note.soundingMidi}:${note.position?.string ?? 'none'}:${note.position?.fret ?? 'none'}`;
  const reservedKeys = new Set(
    notes.filter((note) => note.measureIndex >= heldoutStart).map(transferKey),
  );
  // A repeated riff may offer no separate coordinates for transfer. Keep recall usable.
  if (notes.every((note) => reservedKeys.has(transferKey(note)))) reservedKeys.clear();
  const bank: ExerciseDefinition[] = [];
  const octaveRequired = options.octaveRequired ?? false;
  const makeBase = (kind: ExerciseKind, source: NoteEvent[], suffix = '') => {
    const version = kind === 'note-location' ? 'v3' : 'v2';
    const identity = JSON.stringify([
      version,
      score.id,
      trackId,
      kind,
      source.map((note) => note.id),
      suffix,
    ]);
    const id = `${kind}:${version}:${exerciseHash(identity)}`;
    return {
      id,
      scoreId: score.id,
      trackId,
      skillId: kind,
      kind,
      noteIds: source.map((note) => note.id),
      partition: source.some((note) => reservedKeys.has(transferKey(note)))
        ? ('heldout' as const)
        : ('practice' as const),
      transferKeys: [...new Set(source.map(transferKey))],
    };
  };

  for (const note of notes) {
    const midi = note.soundingMidi!;
    const base = makeBase('note-name', [note], octaveRequired ? ':spn' : ':pitch-class');
    bank.push({
      ...base,
      prompt: note.position
        ? `Name the note at string ${note.position.string}, fret ${note.position.fret}.${octaveRequired ? ' Include the octave.' : ''}`
        : `Name the selected note.${octaveRequired ? ' Include the octave.' : ''}`,
      choices: pitchChoices(midi, base.id, octaveRequired),
      answer: { type: 'pitch', midi, octaveRequired },
      mask: { noteIds: [note.id], hide: 'pitch' },
      explanation: `${displayNoteLabel(note, octaveRequired || options.showOctaves)} is the note${note.position ? ` at string ${note.position.string}, fret ${note.position.fret}` : ''}. ${octaveRequired ? 'Here the octave number identifies the register; the same name in another octave is not an exact match.' : 'Find its name first. The same name repeats in higher and lower octaves.'}`,
    });

    if (!note.position || track.tuningMidi.length === 0) continue;
    const match = options.locationMatch ?? 'pitch-class';
    const maxFret = Math.min(options.maxFret ?? 24, 24);
    const locations = findNotePositions(midi, track.tuningMidi, track.capo, {
      match,
      maxFret,
    }).filter(
      (position) =>
        position.string !== note.position!.string || position.fret !== note.position!.fret,
    );
    if (locations.length > 0) {
      const positionBase = makeBase('note-location', [note], `:${match}:max-fret:${maxFret}`);
      const first = locations[0]!;
      const key = (position: { string: number; fret: number }) =>
        `${position.string}:${position.fret}`;
      const valid = new Set(locations.map(key));
      // Keep the choice task small; typed answers still accept every valid location.
      const distractors = [1, -1, 2, -2, 3, -3]
        .map((offset) => ({ string: first.string, fret: first.fret + offset }))
        .filter(
          (position) => position.fret >= 0 && position.fret <= maxFret && !valid.has(key(position)),
        )
        .slice(0, 3);
      const positions = [first, ...distractors];
      const label = displayNoteLabel(note, match === 'exact');
      bank.push({
        ...positionBase,
        prompt: `Find another ${label}${match === 'exact' ? ' at the same pitch' : ' in any octave'}. Start from string ${note.position.string}, fret ${note.position.fret}.`,
        choices: choices(
          positions.map(key),
          positionBase.id,
          positions.map((position) => `String ${position.string}, fret ${position.fret}`),
        ),
        answer: { type: 'position', positions: locations },
        mask: { noteIds: [note.id], hide: 'fret' },
        explanation: `${locations.length} other positions are valid between frets 0 and ${maxFret}. For example: string ${first.string}, fret ${first.fret}. ${match === 'exact' ? `Each sounds exactly ${noteLabel(note)}, in the same octave.` : `Each is ${displayNoteLabel(note)}; a higher or lower octave is welcome. The original position does not count.`}`,
      });
    }
  }

  const onsets = [...new Set(notes.map((note) => note.onsetTicks))].sort((a, b) => a - b);
  const attacks = new Map<number, NoteEvent[]>();
  for (const note of track.notes) {
    if (note.effects.tieDestination) continue;
    const group = attacks.get(note.onsetTicks) ?? [];
    group.push(note);
    attacks.set(note.onsetTicks, group);
  }
  const melody = [...attacks].sort(([left], [right]) => left - right).map(([, group]) => group);
  for (let index = 1; index < melody.length; index++) {
    const previous = melody[index - 1]!;
    const current = melody[index]!;
    if (previous.length !== 1 || current.length !== 1) continue;
    const first = previous[0]!;
    const second = current[0]!;
    // Do not bridge omitted chords or a section boundary into a fabricated melody.
    if (
      !isQuizEligible(first) ||
      !isQuizEligible(second) ||
      first.effects.letRing ||
      first.effects.palmMute ||
      (first.effects.durationPercent !== undefined && first.effects.durationPercent !== 1) ||
      second.onsetTicks > first.onsetTicks + first.durationTicks ||
      first.measureIndex !== second.measureIndex ||
      first.staffIndex !== second.staffIndex ||
      first.voiceIndex !== second.voiceIndex
    )
      continue;
    const interval = spelledInterval(first, second);
    if (!interval) continue;
    const name = interval.name;
    const base = makeBase('interval', [first, second]);
    const otherNames = [
      'unison',
      'minor second',
      'major second',
      'minor third',
      'major third',
      'perfect fourth',
      'augmented fourth',
      'diminished fifth',
      'perfect fifth',
      'octave',
    ];
    const alternatives = [
      name,
      ...otherNames
        .filter((candidate) => candidate !== name)
        .sort((a, b) => stableHash(base.id + a) - stableHash(base.id + b))
        .slice(0, 3),
    ];
    bank.push({
      ...base,
      prompt: `What is the distance between ${noteLabel(first)} and ${noteLabel(second)}?`,
      choices: choices(alternatives, base.id),
      answer: { type: 'text', accepted: [name, interval.symbol] },
      mask: { noteIds: base.noteIds, hide: 'interval' },
      explanation: `${noteLabel(first)} and ${noteLabel(second)} are ${Math.abs(second.soundingMidi! - first.soundingMidi!)} semitones apart: a ${name}.`,
    });
  }

  const seenTriads = new Set<string>();
  for (const onset of onsets) {
    if (track.harmonySupported === false) break;
    const active = soundingAt(track.notes, onset);
    const triad = analyzeTriad(active);
    if (!triad) continue;
    const signature = active
      .map((note) => note.id)
      .sort()
      .join('+');
    if (seenTriads.has(signature)) continue;
    seenTriads.add(signature);
    for (const note of active) {
      const base = makeBase('triad-role', active, `:target:${note.id}`);
      const role = triad.roles[note.id]!;
      bank.push({
        ...base,
        prompt: `In this ${triad.rootName} ${triad.quality} triad, what role does ${displayNoteLabel(note, options.showOctaves)} play?`,
        choices: choices(['root', 'third', 'fifth'], base.id),
        answer: {
          type: 'text',
          accepted: [role, role === 'root' ? '1' : role === 'third' ? '3' : '5'],
        },
        mask: { noteIds: [note.id], hide: 'role' },
        explanation: `${displayNoteLabel(note, options.showOctaves)} is the ${role} of ${triad.rootName} ${triad.quality}. The bass is the ${triad.bassRole}; the lowest note is not always the root.`,
      });
    }
  }

  return bank;
}

export function exerciseLoop(
  exercise: ExerciseDefinition,
  score: ScoreDocument,
): { startTick: number; endTick: number; tempoBpm: number } | null {
  const source =
    score.tracks
      .find((track) => track.id === exercise.trackId)
      ?.notes.filter((note) => exercise.noteIds.includes(note.id)) ?? [];
  if (source.length === 0) return null;
  const firstMeasure = Math.min(...source.map((note) => note.measureIndex));
  const lastMeasure = Math.max(...source.map((note) => note.measureIndex));
  const measures = score.measures.filter(
    (measure) => measure.index >= firstMeasure && measure.index <= lastMeasure,
  );
  return {
    startTick: measures.length
      ? Math.min(...measures.map((measure) => measure.startTicks))
      : Math.min(...source.map((note) => note.onsetTicks)),
    endTick: measures.length
      ? Math.max(...measures.map((measure) => measure.startTicks + measure.durationTicks))
      : Math.max(...source.map((note) => note.onsetTicks + note.durationTicks)),
    tempoBpm: measures[0]?.tempoBpm ?? 100,
  };
}
