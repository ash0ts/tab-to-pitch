import {
  practiceSetSchema,
  stageRunSchema,
  type PracticeSet,
  type StageRun,
} from './studio/contracts';
import {
  listeningExerciseSchema,
  listeningAttemptSchema,
  type ListeningExercise,
  type ListeningAttempt,
} from './songs/listening';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import type { AttemptRecord } from './engine/types';
import { arrangementConstraintsSchema } from './shared/arrangements';
import {
  emptyLessonData,
  frozenExerciseSchema,
  lessonDataSchema,
  lessonEventSchema,
  lessonSessionSchema,
  mergeLessonCheckpoints,
  type FrozenExercise,
  type LessonData,
  type LessonEvent,
  type LessonSession,
} from './lesson-storage';

export const savedVariationSchema = z
  .object({
    id: z.string().uuid(),
    version: z.literal('harmony-v1'),
    sourceHash: z.string().min(1).max(128),
    trackId: z.string().max(64),
    savedAt: z.number().finite().nonnegative(),
    firstBar: z.number().int().nonnegative(),
    lastBar: z.number().int().nonnegative(),
    barGrid: z.boolean(),
    symbols: z.record(z.string().max(128), z.string().max(32)),
    targets: z.record(z.string().max(128), z.string().max(32)),
    context: z
      .object({
        tonic: z.string().regex(/^[A-G](?:#|b){0,2}$/),
        mode: z.enum([
          'ionian',
          'dorian',
          'phrygian',
          'lydian',
          'mixolydian',
          'aeolian',
          'locrian',
        ]),
      })
      .strict()
      .nullable(),
    melodyVoice: z
      .string()
      .regex(/^\d+:\d+$/)
      .or(z.literal(''))
      .default(''),
    options: arrangementConstraintsSchema,
    variationId: z.string().min(1).max(1000),
  })
  .strict()
  .refine(
    (value) => value.lastBar >= value.firstBar && value.lastBar - value.firstBar < 8,
    'Invalid passage length',
  );
export type SavedVariation = z.infer<typeof savedVariationSchema>;

export interface LibraryEntry {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  savedAt: number;
}
interface LocalData extends DBSchema {
  listeningExercises: { key: string; value: ListeningExercise };
  listeningAttempts: { key: string; value: ListeningAttempt };
  files: { key: string; value: LibraryEntry };
  attempts: { key: string; value: AttemptRecord };
  settings: { key: string; value: unknown };
  variations: { key: string; value: SavedVariation };
  lessons: { key: string; value: LessonSession };
  lessonEvents: { key: string; value: LessonEvent; indexes: { lessonId: string } };
  exerciseDefinitions: { key: string; value: FrozenExercise };
}
let connection: Promise<IDBPDatabase<LocalData>> | undefined;
const db = () =>
  (connection ??= openDB<LocalData>('tabtopitch', 4, {
    upgrade(database, oldVersion) {
      if (oldVersion < 4) {
        database.createObjectStore('listeningExercises', { keyPath: 'id' });
        database.createObjectStore('listeningAttempts', { keyPath: 'id' });
      }
      if (oldVersion < 1) {
        database.createObjectStore('files', { keyPath: 'id' });
        database.createObjectStore('attempts', { keyPath: 'id' });
        database.createObjectStore('settings');
      }
      if (oldVersion < 2) database.createObjectStore('variations', { keyPath: 'id' });
      if (oldVersion < 3) {
        database.createObjectStore('lessons', { keyPath: 'id' });
        database
          .createObjectStore('lessonEvents', { keyPath: 'id' })
          .createIndex('lessonId', 'lessonId');
        database.createObjectStore('exerciseDefinitions', { keyPath: 'id' });
      }
    },
    blocking() {
      const previous = connection;
      connection = undefined;
      void previous?.then((database) => database.close());
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  }));

// Keep unsaved teaching work exportable even if its panel unmounts or IndexedDB fails.
const lessonMemory = {
  listeningExercises: new Map<string, ListeningExercise>(),
  listeningAttempts: new Map<string, ListeningAttempt>(),
  lessons: new Map<string, LessonSession>(),
  lessonEvents: new Map<string, LessonEvent>(),
  exerciseDefinitions: new Map<string, FrozenExercise>(),
};
let lessonWriteGeneration = 0;
let persistedLessonGeneration: string | null = null;
export const getLessonWriteGeneration = () => ({
  local: lessonWriteGeneration,
  persisted: persistedLessonGeneration,
});
export const LESSON_WRITER_ID = crypto.randomUUID();
const lessonChannel =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('tabtopitch-lessons')
    : null;
if (lessonChannel)
  lessonChannel.onmessage = (event: MessageEvent<unknown>) => {
    const value = event.data as { deleted?: unknown; generation?: unknown } | null;
    if (!value?.deleted || typeof value.generation !== 'string') return;
    lessonWriteGeneration++;
    persistedLessonGeneration = value.generation;
    lessonMemory.lessons.clear();
    lessonMemory.lessonEvents.clear();
    lessonMemory.exerciseDefinitions.clear();
    lessonMemory.listeningExercises.clear();
    lessonMemory.listeningAttempts.clear();
  };
function rememberLessonData(data: LessonData) {
  for (const [name, values] of [
    ['lessonEvents', data.lessonEvents],
    ['exerciseDefinitions', data.exerciseDefinitions],
    ['listeningExercises', data.listeningExercises],
    ['listeningAttempts', data.listeningAttempts],
  ] as const) {
    for (const value of values) {
      const existing = lessonMemory[name].get(value.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(value))
        throw new Error('Teaching evidence cannot be rewritten.');
    }
  }
  for (const lesson of data.lessons) {
    const existing = lessonMemory.lessons.get(lesson.id);
    lessonMemory.lessons.set(
      lesson.id,
      existing ? mergeLessonCheckpoints(existing, lesson) : lesson,
    );
  }
  for (const event of data.lessonEvents) lessonMemory.lessonEvents.set(event.id, event);
  for (const exercise of data.listeningExercises)
    lessonMemory.listeningExercises.set(exercise.id, exercise);
  for (const attempt of data.listeningAttempts)
    lessonMemory.listeningAttempts.set(attempt.id, attempt);
  for (const exercise of data.exerciseDefinitions)
    lessonMemory.exerciseDefinitions.set(exercise.id, exercise);
}
export function getMemoryLessonData(): LessonData {
  return {
    listeningExercises: [...lessonMemory.listeningExercises.values()],
    listeningAttempts: [...lessonMemory.listeningAttempts.values()],
    lessons: [...lessonMemory.lessons.values()],
    lessonEvents: [...lessonMemory.lessonEvents.values()],
    exerciseDefinitions: [...lessonMemory.exerciseDefinitions.values()],
  };
}
export async function getLessonData(): Promise<LessonData> {
  const database = await db();
  const [
    lessons,
    lessonEvents,
    exerciseDefinitions,
    generation,
    listeningExercises,
    listeningAttempts,
  ] = await Promise.all([
    database.getAll('lessons'),
    database.getAll('lessonEvents'),
    database.getAll('exerciseDefinitions'),
    database.get('settings', 'lessonDeletionGeneration'),
    database.getAll('listeningExercises'),
    database.getAll('listeningAttempts'),
  ]);
  persistedLessonGeneration = typeof generation === 'string' ? generation : null;
  rememberLessonData(
    lessonDataSchema.parse({
      lessons,
      lessonEvents,
      exerciseDefinitions,
      listeningExercises,
      listeningAttempts,
    }),
  );
  return getMemoryLessonData();
}
async function writeImmutable<T extends { id: string }>(
  store: { get(id: string): Promise<T | undefined>; add(value: T): Promise<unknown> },
  values: T[],
) {
  for (const value of values) {
    const existing = await store.get(value.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value))
      throw new Error('Teaching evidence cannot be rewritten.');
    if (!existing) await store.add(value);
  }
}

export function cacheLessonSession(
  lesson: LessonSession,
  events: LessonEvent[] = [],
  exercises: FrozenExercise[] = [],
  listeningExercises: ListeningExercise[] = [],
  listeningAttempts: ListeningAttempt[] = [],
) {
  rememberLessonData(
    lessonDataSchema.parse({
      lessons: [lesson],
      lessonEvents: events,
      exerciseDefinitions: exercises,
      listeningExercises,
      listeningAttempts,
    }),
  );
}
export async function saveLessonSession(
  lesson: LessonSession,
  events: LessonEvent[] = [],
  exercises: FrozenExercise[] = [],
  generation = getLessonWriteGeneration(),
  listeningExercises: ListeningExercise[] = [],
  listeningAttempts: ListeningAttempt[] = [],
) {
  if (generation.local !== lessonWriteGeneration) return;
  const data = lessonDataSchema.parse({
    lessons: [lesson],
    lessonEvents: events,
    exerciseDefinitions: exercises,
    listeningExercises,
    listeningAttempts,
  });
  rememberLessonData(data);
  const tx = (await db()).transaction(
    [
      'lessons',
      'lessonEvents',
      'exerciseDefinitions',
      'settings',
      'listeningExercises',
      'listeningAttempts',
    ],
    'readwrite',
  );
  try {
    const persisted = (await tx.objectStore('settings').get('lessonDeletionGeneration')) ?? null;
    if (persisted !== generation.persisted || generation.local !== lessonWriteGeneration) {
      await tx.done;
      return;
    }
    const old = await tx.objectStore('lessons').get(lesson.id);
    await tx
      .objectStore('lessons')
      .put(old ? mergeLessonCheckpoints(old, data.lessons[0]!) : data.lessons[0]!);
    await writeImmutable(tx.objectStore('lessonEvents'), data.lessonEvents);
    await writeImmutable(tx.objectStore('exerciseDefinitions'), data.exerciseDefinitions);
    await writeImmutable(tx.objectStore('listeningExercises'), data.listeningExercises);
    await writeImmutable(tx.objectStore('listeningAttempts'), data.listeningAttempts);
    await tx.done;
    lessonChannel?.postMessage({
      writerId: LESSON_WRITER_ID,
      lessonId: lesson.id,
      revision: lesson.revision,
    });
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}

export async function getAttempts() {
  return (await db()).getAll('attempts');
}
export async function saveAttempt(attempt: AttemptRecord) {
  await appendAttempts([attemptSchema.parse(attempt)]);
}
export async function listLibrary() {
  return (await (await db()).getAll('files')).sort((a, b) => b.savedAt - a.savedAt);
}
export async function saveFile(entry: LibraryEntry) {
  await (await db()).put('files', entry);
}
export async function deleteFile(id: string) {
  await (await db()).delete('files', id);
}
export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  return ((await (await db()).get('settings', key)) as T | undefined) ?? fallback;
}
export async function writeSetting(key: string, value: unknown) {
  await (await db()).put('settings', value, key);
}
export async function saveVariation(value: SavedVariation) {
  await (await db()).add('variations', savedVariationSchema.parse(value));
}
export async function listVariations(sourceHash?: string, trackId?: string) {
  return (await (await db()).getAll('variations'))
    .filter(
      (value) =>
        (!sourceHash || value.sourceHash === sourceHash) && (!trackId || value.trackId === trackId),
    )
    .sort((a, b) => b.savedAt - a.savedAt);
}
export async function clearLocalData() {
  const before = lessonWriteGeneration++;
  try {
    const database = await db();
    const tx = database.transaction(
      [
        'files',
        'attempts',
        'settings',
        'variations',
        'lessons',
        'lessonEvents',
        'exerciseDefinitions',
        'listeningExercises',
        'listeningAttempts',
      ],
      'readwrite',
    );
    await Promise.all([
      tx.objectStore('files').clear(),
      tx.objectStore('attempts').clear(),
      tx.objectStore('settings').clear(),
      tx.objectStore('variations').clear(),
      tx.objectStore('lessons').clear(),
      tx.objectStore('lessonEvents').clear(),
      tx.objectStore('exerciseDefinitions').clear(),
      tx.objectStore('listeningExercises').clear(),
      tx.objectStore('listeningAttempts').clear(),
    ]);
    const generation = crypto.randomUUID();
    await tx.objectStore('settings').put(generation, 'lessonDeletionGeneration');
    await tx.done;
    persistedLessonGeneration = generation;
    lessonChannel?.postMessage({ writerId: LESSON_WRITER_ID, deleted: true, generation });
    lessonMemory.lessons.clear();
    lessonMemory.lessonEvents.clear();
    lessonMemory.exerciseDefinitions.clear();
    lessonMemory.listeningExercises.clear();
    lessonMemory.listeningAttempts.clear();
  } catch (error) {
    if (lessonWriteGeneration === before + 1) lessonWriteGeneration = before;
    throw error;
  }
}

const kind = z.enum([
  'note-name',
  'note-location',
  'interval',
  'triad-role',
  'chord-tone',
  'next-target',
  'changed-tone',
  'voice-connection',
]);
const safeText = z.string().max(500);
const attemptSchema = z
  .object({
    id: safeText.min(1),
    exerciseId: safeText.min(1),
    scoreId: safeText,
    trackId: safeText,
    skillId: kind,
    kind,
    noteIds: z.array(safeText).max(32),
    response: safeText,
    outcome: z.enum(['correct', 'incorrect', 'revealed', 'interrupted', 'self-reported']),
    assisted: z.boolean(),
    hintsUsed: z.array(safeText).max(32),
    episodeId: safeText.optional(),
    responseIndex: z.number().int().nonnegative().optional(),
    startedAt: z.number().finite().nonnegative(),
    answeredAt: z.number().finite().nonnegative(),
    responseMs: z.number().finite().nonnegative(),
    mode: z.enum(['learn', 'recall', 'transfer', 'delayed']),
    partition: z.enum(['practice', 'heldout']),
    evidence: z.enum(['answer', 'self-report']),
    transferKeys: z.array(safeText).max(64).optional(),
  })
  .strict()
  .superRefine((attempt, ctx) => {
    const invalid =
      attempt.answeredAt < attempt.startedAt ||
      attempt.responseMs !== attempt.answeredAt - attempt.startedAt ||
      attempt.kind !== attempt.skillId ||
      ((attempt.hintsUsed.length > 0 || attempt.outcome === 'revealed') && !attempt.assisted) ||
      (attempt.evidence === 'self-report') !== (attempt.outcome === 'self-reported');
    if (invalid) ctx.addIssue({ code: 'custom', message: 'Attempt evidence is inconsistent.' });
  });
const legacyBackupSchema = z
  .object({
    schemaVersion: z.literal(1),
    exportedAt: z.string(),
    attempts: z.array(attemptSchema).max(100_000),
  })
  .strict();
export const backupSchema = z.union([
  legacyBackupSchema,
  z
    .object({
      schemaVersion: z.literal(2),
      exportedAt: z.string(),
      attempts: z.array(attemptSchema).max(100_000),
      variations: z.array(savedVariationSchema).max(1000),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.union([z.literal(3), z.literal(4)]),
      exportedAt: z.string(),
      attempts: z.array(attemptSchema).max(100_000),
      variations: z.array(savedVariationSchema).max(1000),
      lessons: z.array(lessonSessionSchema).max(2000),
      lessonEvents: z.array(lessonEventSchema).max(100_000),
      exerciseDefinitions: z.array(frozenExerciseSchema).max(10_000),
      listeningExercises: z.array(listeningExerciseSchema).max(10000).default([]),
      listeningAttempts: z.array(listeningAttemptSchema).max(100000).default([]),
      studio: practiceSetSchema.optional(),
      stageRuns: z.array(stageRunSchema).max(200).optional(),
    })
    .strict(),
]);
export function parseBackup(text: string): AttemptRecord[] {
  if (text.length > 25_000_000) throw new Error('The progress file is too large.');
  return backupSchema.parse(JSON.parse(text)).attempts;
}
function sameAttempt(first: AttemptRecord, second: AttemptRecord): boolean {
  // Schema parsing supplies a stable field order for equivalent JSON backups.
  return JSON.stringify(attemptSchema.parse(first)) === JSON.stringify(attemptSchema.parse(second));
}

async function appendAttempts(
  attempts: AttemptRecord[],
  variations: SavedVariation[] = [],
  lessons: LessonData = emptyLessonData(),
  presentation?: { studio?: PracticeSet; stageRuns?: StageRun[] },
) {
  const tx = (await db()).transaction(
    [
      'attempts',
      'variations',
      'lessons',
      'lessonEvents',
      'exerciseDefinitions',
      'listeningExercises',
      'listeningAttempts',
      'settings',
    ],
    'readwrite',
  );
  let added = 0;
  try {
    for (const attempt of attempts) {
      const existing = await tx.objectStore('attempts').get(attempt.id);
      // An imported backup may add evidence, but cannot rewrite an old attempt.
      if (existing && !sameAttempt(existing, attempt))
        throw new Error('A backup conflicts with existing practice evidence.');
      if (!existing) {
        await tx.objectStore('attempts').add(attempt);
        added++;
      }
    }
    for (const variation of variations) {
      const existing = await tx.objectStore('variations').get(variation.id);
      if (
        existing &&
        JSON.stringify(savedVariationSchema.parse(existing)) !== JSON.stringify(variation)
      )
        throw new Error('A backup conflicts with an existing saved variation.');
      if (!existing) await tx.objectStore('variations').add(variation);
    }
    for (const lesson of lessons.lessons) {
      const existing = await tx.objectStore('lessons').get(lesson.id);
      await tx
        .objectStore('lessons')
        .put(existing ? mergeLessonCheckpoints(existing, lesson) : lesson);
    }
    await writeImmutable(tx.objectStore('lessonEvents'), lessons.lessonEvents);
    await writeImmutable(tx.objectStore('exerciseDefinitions'), lessons.exerciseDefinitions);
    await writeImmutable(tx.objectStore('listeningExercises'), lessons.listeningExercises);
    await writeImmutable(tx.objectStore('listeningAttempts'), lessons.listeningAttempts);
    if (presentation?.studio)
      await tx.objectStore('settings').put(presentation.studio, 'studio-v1');
    if (presentation?.stageRuns)
      await tx.objectStore('settings').put(presentation.stageRuns, 'stage-runs-v1');
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
  return added;
}
export async function importProgress(text: string, inMemory: readonly AttemptRecord[] = []) {
  const attempts = parseBackup(text);
  const memory = new Map(inMemory.map((attempt) => [attempt.id, attempt]));
  for (const attempt of attempts) {
    const existing = memory.get(attempt.id);
    if (existing && !sameAttempt(existing, attempt))
      throw new Error('A backup conflicts with unsaved practice evidence.');
  }
  const backup = backupSchema.parse(JSON.parse(text));
  const lessonData =
    backup.schemaVersion === 3 || backup.schemaVersion === 4
      ? lessonDataSchema.parse({
          lessons: backup.lessons,
          lessonEvents: backup.lessonEvents,
          exerciseDefinitions: backup.exerciseDefinitions,
          listeningExercises: backup.listeningExercises,
          listeningAttempts: backup.listeningAttempts,
        })
      : emptyLessonData();
  for (const lesson of lessonData.lessons) {
    const existing = lessonMemory.lessons.get(lesson.id);
    if (existing) mergeLessonCheckpoints(existing, lesson);
  }
  for (const [name, values] of [
    ['lessonEvents', lessonData.lessonEvents],
    ['exerciseDefinitions', lessonData.exerciseDefinitions],
    ['listeningExercises', lessonData.listeningExercises],
    ['listeningAttempts', lessonData.listeningAttempts],
  ] as const) {
    for (const value of values) {
      const existing = lessonMemory[name].get(value.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(value))
        throw new Error('A backup conflicts with unsaved teaching evidence.');
    }
  }
  const added = await appendAttempts(
    attempts,
    backup.schemaVersion !== 1 ? backup.variations : [],
    lessonData,
    'studio' in backup ? { studio: backup.studio, stageRuns: backup.stageRuns } : undefined,
  );
  rememberLessonData(lessonData);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('studio-restored'));
  return added;
}
export async function exportProgress(
  attempts: AttemptRecord[],
  presentation?: { studio: PracticeSet; stageRuns: StageRun[] },
) {
  let variations: SavedVariation[] = [];
  let complete = true;
  try {
    variations = await listVariations();
  } catch {
    complete = false;
  }
  let lessons = getMemoryLessonData();
  try {
    lessons = await getLessonData();
  } catch {
    complete = false;
  }
  let studio: PracticeSet | undefined, stageRuns: StageRun[] | undefined;
  try {
    const s = practiceSetSchema.safeParse(await readSetting('studio-v1', null));
    if (s.success) studio = s.data;
    const r = stageRunSchema
      .array()
      .max(200)
      .safeParse(await readSetting('stage-runs-v1', []));
    if (r.success) stageRuns = r.data;
  } catch {
    complete = false;
  }
  downloadBackup(
    attempts,
    variations,
    lessons,
    presentation?.studio ?? studio,
    presentation?.stageRuns ?? stageRuns,
  );
  return complete;
}
export function exportVariations(variations: SavedVariation[]) {
  downloadBackup(
    [],
    variations.map((value) => savedVariationSchema.parse(value)),
  );
}
function downloadBackup(
  attempts: AttemptRecord[],
  variations: SavedVariation[],
  lessons: LessonData = emptyLessonData(),
  studio?: PracticeSet,
  stageRuns?: StageRun[],
) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          schemaVersion: 4,
          exportedAt: new Date().toISOString(),
          attempts,
          variations,
          ...lessons,
          ...(studio ? { studio } : {}),
          ...(stageRuns ? { stageRuns } : {}),
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tabtopitch-progress.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
