import { practiceStateSchema, practiceObservationSchema } from './shared/practice';
import { listeningExerciseSchema, listeningAttemptSchema } from './songs/listening';
import { z } from 'zod';
import type { ExerciseDefinition } from './engine/types';
import { teacherExerciseKindSchema } from './shared/teacher';

export const lessonObjectiveSchema = z.enum([
  'foundations',
  'connections',
  'extensions',
  'listening',
]);
export type LessonObjective = z.infer<typeof lessonObjectiveSchema>;
const text = z.string().max(500);
const timestamp = z.number().finite().nonnegative();
const position = z
  .object({ string: z.number().int().min(1).max(12), fret: z.number().int().min(0).max(36) })
  .strict();
const exerciseKind = teacherExerciseKindSchema;

export const lessonMessageSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1).max(8000),
    at: timestamp,
    source: z.enum(['local', 'forge']).optional(),
  })
  .strict();
export type LessonMessage = z.infer<typeof lessonMessageSchema>;

/** A checkpoint is resumable context, never evidence of mastery. */
export const lessonSessionSchema = z
  .object({
    id: z.string().uuid(),
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    source: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('score'), hash: text, trackId: text }).strict(),
        z
          .object({
            kind: z.literal('catalog-passage'),
            passageId: text,
            recordingId: text,
            annotationVersion: text,
          })
          .strict(),
      ])
      .optional(),
    curriculumVersion: text.min(1),
    sourceHash: text.min(1),
    trackId: text.min(1),
    objective: lessonObjectiveSchema,
    contextVersion: text.min(1),
    revision: z.number().int().nonnegative(),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: z.enum(['active', 'paused', 'completed']),
    messages: z.array(lessonMessageSchema).max(200),
    pendingTaskId: text.nullable(),
    practice: practiceStateSchema.optional(),
  })
  .strict()
  .refine((value) => value.updatedAt >= value.createdAt, 'Lesson timestamps are inconsistent.');
export type LessonSession = z.infer<typeof lessonSessionSchema>;

export const lessonEventSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: z.string().uuid(),
    at: timestamp,
    contextVersion: text.min(1),
    kind: z.enum([
      'message',
      'exposure',
      'task-started',
      'attempt',
      'reveal',
      'interrupted',
      'preview',
      'objective-changed',
      'resumed',
      'listening-response',
      'listening-replay',
      'listening-assistance',
      'source-changed',
      'practice-goal',
      'practice-strategy',
      'practice-support',
      'practice-response',
      'practice-reflection',
      'practice-bookmark',
    ]),
    messageId: z.string().uuid().optional(),
    attemptId: text.optional(),
    exerciseId: text.optional(),
    exposureKeys: z.array(text).max(512),
    detail: text.optional(),
    practice: practiceObservationSchema.optional(),
  })
  .strict();
export type LessonEvent = z.infer<typeof lessonEventSchema>;

const definitionSchema: z.ZodType<ExerciseDefinition> = z
  .object({
    id: text.min(1),
    scoreId: text,
    trackId: text,
    skillId: exerciseKind,
    kind: exerciseKind,
    prompt: z.string().max(3000),
    noteIds: z.array(text).max(128),
    choices: z.array(z.object({ id: text, label: text, value: text }).strict()).max(32),
    answer: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('pitch'),
          midi: z.number().finite(),
          octaveRequired: z.boolean().optional(),
        })
        .strict(),
      z
        .object({ type: z.literal('position'), positions: z.array(position).min(1).max(512) })
        .strict(),
      z.object({ type: z.literal('text'), accepted: z.array(text).min(1).max(128) }).strict(),
      z
        .object({
          type: z.literal('position-pair'),
          pairs: z
            .array(z.object({ from: position, to: position }).strict())
            .min(1)
            .max(512),
        })
        .strict(),
    ]),
    mask: z
      .object({
        noteIds: z.array(text).max(128),
        hide: z.enum(['pitch', 'fret', 'interval', 'role']),
      })
      .strict(),
    explanation: z.string().max(3000),
    partition: z.enum(['practice', 'heldout']),
    transferKeys: z.array(text).max(128).optional(),
    listeningExample: z.array(z.array(z.number().finite()).max(32)).max(8).optional(),
    stimulus: z
      .object({
        id: text,
        version: text,
        pitches: z.array(z.array(z.number().finite()).max(32)).max(8),
        exposureKeys: z.array(text).max(512),
      })
      .strict()
      .optional(),
  })
  .strict();
export const frozenExerciseSchema = z
  .object({
    id: text.min(1),
    generatorVersion: text.min(1),
    createdAt: timestamp,
    definition: definitionSchema,
  })
  .strict()
  .refine((value) => value.id === value.definition.id, 'Exercise identity changed.');
export type FrozenExercise = z.infer<typeof frozenExerciseSchema>;

export const lessonDataSchema = z
  .object({
    lessons: z.array(lessonSessionSchema).max(2000),
    lessonEvents: z.array(lessonEventSchema).max(100_000),
    exerciseDefinitions: z.array(frozenExerciseSchema).max(10_000),
    listeningExercises: z.array(listeningExerciseSchema).max(10000).default([]),
    listeningAttempts: z.array(listeningAttemptSchema).max(100000).default([]),
  })
  .strict();
export type LessonData = z.infer<typeof lessonDataSchema>;
export const emptyLessonData = (): LessonData => ({
  lessons: [],
  lessonEvents: [],
  exerciseDefinitions: [],
  listeningExercises: [],
  listeningAttempts: [],
});

export function mergeLessonCheckpoints(first: LessonSession, second: LessonSession): LessonSession {
  const [earlier, later] = first.revision <= second.revision ? [first, second] : [second, first];
  if (JSON.stringify(earlier) === JSON.stringify(later)) return later;
  const sameIdentity =
    earlier.id === later.id &&
    earlier.sourceHash === later.sourceHash &&
    earlier.trackId === later.trackId &&
    earlier.createdAt === later.createdAt &&
    earlier.curriculumVersion === later.curriculumVersion;
  const prefix = earlier.messages.every(
    (message, index) => JSON.stringify(message) === JSON.stringify(later.messages[index]),
  );
  if (!sameIdentity || !prefix || earlier.revision === later.revision)
    throw new Error('A backup conflicts with an existing lesson.');
  return later;
}
