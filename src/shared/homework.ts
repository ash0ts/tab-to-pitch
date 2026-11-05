import { z } from 'zod';
import { playingStateSchema } from './homework-playing.js';
export const HOMEWORK_VERSION = 'homework-caged-v1';
const text = z.string().min(1).max(500);
const time = z.number().finite().nonnegative();
export const familySchema = z.enum(['C', 'A', 'G', 'E', 'D']);
export const regionSchema = z
  .object({ minFret: z.number().int().min(0).max(24), maxFret: z.number().int().min(0).max(24) })
  .strict()
  .refine((r) => r.minFret <= r.maxFret);
export const homeworkKindSchema = z.enum([
  'locate',
  'name',
  'roots',
  'complete',
  'voicing',
  'neighbor',
  'connection',
  'target',
]);
export type HomeworkKind = z.infer<typeof homeworkKindSchema>;
export const homeworkSupportSchema = z.enum([
  'cue',
  'landmark',
  'partial',
  'worked-example',
  'answer',
]);
export type HomeworkSupport = z.infer<typeof homeworkSupportSchema>;
export const coordinateSchema = z
  .object({ string: z.number().int().min(1).max(12), fret: z.number().int().min(0).max(24) })
  .strict();
export const homeworkResponseSchema = z
  .object({ positions: z.array(coordinateSchema).max(12), text: z.string().max(40).optional() })
  .strict();
export type HomeworkResponse = z.infer<typeof homeworkResponseSchema>;
export const homeworkTaskSchema = z
  .object({
    id: text,
    version: z.literal(HOMEWORK_VERSION),
    kind: homeworkKindSchema,
    variant: z.number().int().min(0).max(1000).nullable().default(null),
    symbol: text,
    family: familySchema,
    region: regionSchema,
    tuning: z.array(z.number().int().min(0).max(127)).min(1).max(12),
    capo: z.number().int().min(0).max(12),
    pitch: z.number().int().min(0).max(127),
    string: z.number().int().min(1).max(12).nullable(),
    template: z.array(coordinateSchema).max(6),
    sourcePosition: coordinateSchema.nullable(),
    exact: z.boolean(),
    prompt: text,
    exposureKeys: z.array(text).max(512),
  })
  .strict();
export type HomeworkTask = z.infer<typeof homeworkTaskSchema>;
export const homeworkObservationSchema = z
  .object({
    taskId: text,
    kind: z.enum(['answer', 'support', 'exposure', 'playing', 'interrupted']),
    at: time,
    response: homeworkResponseSchema.optional(),
    support: homeworkSupportSchema.optional(),
    correct: z.boolean().optional(),
    assisted: z.boolean(),
    firstResponse: z.boolean(),
    skill: homeworkKindSchema,
    exposure: z.enum(['reserved', 'exposed', 'unknown']),
  })
  .strict();
export type HomeworkObservation = z.infer<typeof homeworkObservationSchema>;
export const homeworkAssignmentSchema = z
  .object({
    version: z.literal(HOMEWORK_VERSION),
    playing: playingStateSchema.optional(),
    id: text,
    lessonId: z.string().uuid(),
    goal: text,
    contextVersion: text,
    minutes: z.union([z.literal(5), z.literal(15), z.literal(30)]),
    region: regionSchema,
    tasks: z.array(homeworkTaskSchema).min(1).max(32),
    index: z.number().int().min(0).max(31),
    support: z.array(homeworkSupportSchema).max(32),
    responses: z.array(homeworkResponseSchema).max(100),
    status: z.enum(['active', 'paused', 'completed']),
    createdAt: time,
    updatedAt: time,
    dueAt: time.nullable(),
    reviewDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
    reviewPolicy: z.literal('review-defaults-v1'),
    reflection: z.string().max(1000),
    exposure: z.enum(['reserved', 'exposed', 'unknown']),
  })
  .strict()
  .refine((a) => a.index < a.tasks.length && a.updatedAt >= a.createdAt)
  .transform((a) => a.tasks.some(t => t.variant === null) ? { ...a, status: 'paused' as const, exposure: 'unknown' as const } : a);
export type HomeworkAssignment = z.infer<typeof homeworkAssignmentSchema>;
// Bounded learner context omits the task template, target coordinates and grading contract.
export const homeworkContextSchema = z
  .object({
    capability: z.literal(HOMEWORK_VERSION),
    revision: z.number().int().nonnegative(),
    active: z.boolean(),
    assisted: z.boolean(),
    goal: text,
    taskKind: homeworkKindSchema.nullable(),
    family: familySchema,
    symbol: text,
    region: regionSchema,
    evidence: z.array(homeworkObservationSchema.omit({ response: true })).max(12),
  })
  .strict();
export const homeworkActionSchema = z.discriminatedUnion('operation', [
  z
    .object({
      type: z.literal('homework'),
      operation: z.literal('task'),
      kind: homeworkKindSchema,
      family: familySchema,
    })
    .strict(),
  z
    .object({ type: z.literal('homework'), operation: z.literal('compare'), family: familySchema })
    .strict(),
]);
export type HomeworkAction = z.infer<typeof homeworkActionSchema>;
