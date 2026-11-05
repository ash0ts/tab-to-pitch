import { z } from 'zod';

export const PRACTICE_VERSION = 'teaching-practice-v1';
const text = z.string().min(1).max(500);
const time = z.number().finite().nonnegative();
export const practiceIntentSchema = z.enum(['hear', 'perform', 'create']);
export const activityKindSchema = z.enum(['rhythm', 'phrase', 'expression']);
export const supportKindSchema = z.enum(['cue', 'comparison', 'worked-example', 'answer']);
export type SupportKind = z.infer<typeof supportKindSchema>;
export type ActivityKind = z.infer<typeof activityKindSchema>;
export const practiceGoalSchema = z
  .object({
    wording: text,
    target: text,
    context: text,
    chosenAt: time,
  })
  .strict();
export const practiceStrategySchema = z
  .object({
    approach: text,
    rationale: text,
    accepted: z.boolean().nullable(),
    proposedAt: time,
  })
  .strict();
export const practiceReflectionSchema = z
  .object({
    text: z.string().max(1000),
    confidence: z.enum(['unsure', 'partly', 'ready']).nullable(),
    at: time,
    evidence: z.literal('self-report'),
  })
  .strict();
export const learningEvidenceSchema = z
  .object({
    id: text,
    episodeId: text,
    stimulusId: text,
    skill: text,
    format: z.enum(['hearing', 'naming', 'location', 'construction', 'performance', 'reflection']),
    responseFormat: z
      .enum(['recognition', 'recall', 'construction', 'self-report', 'unknown'])
      .optional(),
    feedback: z.string().max(500).optional(),
    outcome: z.enum(['correct', 'incorrect', 'reflected', 'interrupted']),
    assisted: z.boolean(),
    firstResponse: z.boolean(),
    familiarity: z.enum(['original', 'familiar', 'unknown']),
    exposure: z.enum(['reserved', 'exposed', 'unknown']),
    delayDays: z.number().finite().nonnegative().nullable(),
    context: text,
    at: time,
  })
  .strict();
export type LearningEvidence = z.infer<typeof learningEvidenceSchema>;
export const practiceResponseSchema = z
  .object({
    cells: z
      .array(z.union([z.number().int().min(0).max(127), z.null()]))
      .max(16)
      .optional(),
    difference: z.enum(['articulation', 'dynamics', 'timing', 'pitch']).optional(),
    intention: z.string().max(500).optional(),
  })
  .strict();
export type PracticeResponse = z.infer<typeof practiceResponseSchema>;
export const timedStudySchema = z
  .object({
    id: text,
    label: text,
    cells: z.array(z.number().int().min(40).max(88).nullable()).length(16),
    beatsPerBar: z.literal(4),
    tempo: z.number().min(40).max(180),
    articulation: z.enum(['normal', 'staccato']),
    dynamics: z.enum(['mp', 'f']),
    texture: z.enum(['chords', 'melody']),
  })
  .strict();
export const musicianshipTaskSchema = z
  .object({
    id: text,
    version: z.literal('musicianship-v1'),
    kind: activityKindSchema,
    variant: z.number().int().min(0).max(3),
    title: text,
    prompt: z.string().max(1500),
    skill: text,
    stimulus: timedStudySchema,
    comparison: timedStudySchema,
    allowedPitches: z.array(z.number().int().min(40).max(88)).min(1).max(12),
    destination: z.number().int().min(40).max(88),
    difference: z.enum(['articulation', 'dynamics']),
  })
  .strict();
export const practiceEpisodeSchema = z
  .object({
    definition: musicianshipTaskSchema.optional(),
    id: text,
    stimulusId: text,
    kind: activityKindSchema,
    variant: z.number().int().min(0).max(3),
    context: text,
    startedAt: time,
    status: z.enum(['active', 'completed', 'interrupted']),
    responseCount: z.number().int().nonnegative(),
    firstResponse: practiceResponseSchema.nullable(),
    support: z.array(z.object({ kind: supportKindSchema, at: time }).strict()).max(32),
    exposure: z.enum(['reserved', 'exposed', 'unknown']),
    revealed: z.boolean(),
  })
  .strict();
export type PracticeEpisode = z.infer<typeof practiceEpisodeSchema>;
export const practiceStateSchema = z
  .object({
    version: z.literal(PRACTICE_VERSION),
    intent: practiceIntentSchema,
    goal: practiceGoalSchema.nullable(),
    strategy: practiceStrategySchema.nullable(),
    reflection: practiceReflectionSchema.nullable(),
    episode: practiceEpisodeSchema.nullable(),
    bookmark: z.object({ activity: activityKindSchema.nullable(), at: time }).strict().nullable(),
    review: z
      .object({
        dueAt: time,
        intervalDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
        policy: z.literal('review-defaults-v1'),
        skill: text,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PracticeState = z.infer<typeof practiceStateSchema>;
export const emptyPractice = (): PracticeState => ({
  version: PRACTICE_VERSION,
  intent: 'hear',
  goal: null,
  strategy: null,
  reflection: null,
  episode: null,
  bookmark: null,
  review: null,
});
export const practiceObservationSchema = z
  .object({
    episodeId: text.optional(),
    support: supportKindSchema.optional(),
    response: practiceResponseSchema.optional(),
    evidence: learningEvidenceSchema.optional(),
  })
  .strict();

// Cloud context deliberately excludes the frozen answer contract and unbounded event history.
export const practiceContextSchema = z
  .object({
    capability: z.literal(PRACTICE_VERSION),
    goal: practiceGoalSchema.nullable(),
    strategy: practiceStrategySchema.nullable(),
    reflection: practiceReflectionSchema.nullable(),
    active: z
      .object({
        id: text,
        kind: activityKindSchema,
        assisted: z.boolean(),
        responseCount: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    studyId: z
      .string()
      .regex(/^musicianship-v1:(rhythm|phrase|expression):[0-3]$/)
      .optional(),
    review: practiceStateSchema.shape.review.optional(),
    evidence: z.array(learningEvidenceSchema).max(12),
    reserved: z.array(text).max(12),
  })
  .strict();
export const practiceActionSchema = z.discriminatedUnion('operation', [
  z
    .object({
      type: z.literal('practice'),
      operation: z.literal('strategy'),
      approach: text,
      rationale: text,
    })
    .strict(),
  z
    .object({
      type: z.literal('practice'),
      operation: z.literal('activity'),
      activity: activityKindSchema,
      variant: z.number().int().min(0).max(3),
      assessment: z.enum(['practice', 'reserved']),
    })
    .strict(),
  z.object({ type: z.literal('practice'), operation: z.literal('reflection') }).strict(),
]);
export type PracticeAction = z.infer<typeof practiceActionSchema>;
