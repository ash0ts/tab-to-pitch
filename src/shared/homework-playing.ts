import { z } from 'zod';
import { arrangementConstraintsSchema } from './arrangements';
export const PLAYING_VERSION = 'homework-playing-v1';
const id = z.string().min(1).max(500);
const time = z.number().finite().nonnegative();
const position = z
  .object({ string: z.number().int().min(1).max(6), fret: z.number().int().min(0).max(24) })
  .strict();
export const playingStepSchema = z
  .object({
    id,
    stimulusId: id,
    sourceRevision: id,
    objective: z.enum(['note', 'fragment', 'neighbor', 'progression', 'connection', 'phrase']),
    title: id,
    instruction: id,
    region: z
      .object({
        minFret: z.number().int().min(0).max(24),
        maxFret: z.number().int().min(0).max(24),
      })
      .strict(),
    family: z.enum(['C', 'A', 'G', 'E', 'D']).nullable(),
    pitches: z.array(z.number().int().min(0).max(127)).max(16),
    ordered: z.boolean(),
    exact: z.boolean(),
    fragment: z.array(position).max(6),
    progression: z
      .array(
        z
          .object({
            symbol: id,
            ticks: z.number().int().positive().max(30720),
            startTick: z.number().int().nonnegative().optional(),
            positions: z.array(position).min(2).max(6),
          })
          .strict(),
      )
      .max(8),
    responseMethods: z
      .array(z.enum(['self-report', 'live']))
      .min(1)
      .max(2),
    supportPolicy: z.literal('help-before-exposure-v1'),
  })
  .strict();
export type PlayingStep = z.infer<typeof playingStepSchema>;
export const homeworkWorkspaceSchema = z
  .object({
    sourceHash: id,
    trackId: id,
    firstBar: z.number().int().nonnegative(),
    lastBar: z.number().int().nonnegative(),
    barGrid: z.boolean(),
    symbols: z.record(id, z.string().max(32)),
    targets: z.record(id, z.string().max(32)),
    selected: z.number().int().nonnegative().max(7),
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
    options: arrangementConstraintsSchema,
    melodyVoice: z.string().max(50),
  })
  .strict()
  .refine(
    (s) =>
      s.lastBar >= s.firstBar &&
      s.lastBar - s.firstBar < 8 &&
      Object.keys(s.symbols).length <= 64 &&
      Object.keys(s.targets).length <= 64,
  );
export type HomeworkWorkspace = z.infer<typeof homeworkWorkspaceSchema>;
export const playingStateSchema = z
  .object({
    version: z.literal(PLAYING_VERSION),
    workspace: homeworkWorkspaceSchema.optional(),
    steps: z.array(playingStepSchema).min(1).max(20),
    index: z.number().int().nonnegative(),
    method: z.enum(['self-report', 'live']),
    labels: z.boolean(),
    countIn: z.boolean(),
    responseMeasures: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    restMeasures: z.number().int().min(0).max(4),
    status: z.enum(['ready', 'playing', 'feedback', 'paused', 'completed']),
    episodeId: z.string().uuid(),
    responseIndex: z.number().int().nonnegative(),
    startedAt: time.nullable(),
    support: z.array(z.enum(['cue', 'example', 'labels', 'teacher'])).max(32),
    attemptIds: z.array(id).max(200),
  })
  .strict()
  .refine((s) => s.index < s.steps.length);
export type PlayingState = z.infer<typeof playingStateSchema>;
export const selfReportSchema = z.enum([
  'felt-secure',
  'needs-another-pass',
  'not-sure',
  'skipped',
]);
export const playingEventSchema = z
  .object({
    stepId: id,
    episodeId: z.string().uuid(),
    responseIndex: z.number().int().nonnegative(),
    sourceRevision: id,
    method: z.enum(['self-report', 'live']),
    kind: z.enum([
      'started',
      'support',
      'self-report',
      'performance-reference',
      'interrupted',
      'reflection',
    ]),
    support: z.enum(['cue', 'example', 'labels', 'teacher']).optional(),
    selfReport: selfReportSchema.optional(),
    performanceAttemptId: id.optional(),
    assisted: z.boolean(),
  })
  .strict()
  .refine(
    (e) =>
      (e.kind === 'self-report') === !!e.selfReport &&
      (e.kind === 'performance-reference') === !!e.performanceAttemptId,
  );
export type PlayingEvent = z.infer<typeof playingEventSchema>;
export const playingContextSchema = z
  .object({
    capability: z.literal(PLAYING_VERSION),
    revision: z.number().int().nonnegative(),
    active: z.boolean(),
    assisted: z.boolean(),
    stepId: id,
    objective: playingStepSchema.shape.objective,
    method: z.enum(['self-report', 'live']),
    eligible: z.array(z.object({ id, title: id }).strict()).max(20),
    evidence: z.array(playingEventSchema).max(12),
  })
  .strict();
export const playingActionSchema = z
  .object({
    type: z.literal('playing-homework'),
    operation: z.enum(['select', 'isolate', 'retry']),
    stepId: id,
  })
  .strict();
export type PlayingAction = z.infer<typeof playingActionSchema>;
export type HomeworkPlayback = {
  trackIndex?: number;
  step: PlayingStep;
  tuning: readonly number[];
  capo: number;
  tempo: number;
  example: boolean;
  countIn: boolean;
  responseMeasures: 1 | 2 | 4;
  restMeasures: number;
};
