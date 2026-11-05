import { z } from 'zod';

export const LIVE_VERSION = 'live-guitar-v1';
export const LIVE_TEACHER_VERSION = 'teacher-live-v1';
export const DETECTOR_VERSION = 'pitchy-spectral-v3';
export const chordQualitySchema = z.enum(['major', 'minor', '7', 'maj7', 'm7', '6']);
const id = z.string().min(1).max(160);
const time = z.number().finite().nonnegative();
const midi = z.number().finite().min(0).max(127);
export const inputProblemSchema = z.enum([
  'silence',
  'clipping',
  'weak-signal',
  'ambiguous',
  'unstable',
  'dropped-audio',
  'interrupted',
  'unsupported',
]);
export type InputProblem = z.infer<typeof inputProblemSchema>;
export const chordHypothesisSchema = z
  .object({
    root: z.number().int().min(0).max(11),
    quality: chordQualitySchema,
    score: z.number().finite().min(0).max(1),
  })
  .strict();
export type ChordHypothesis = z.infer<typeof chordHypothesisSchema>;
export const observationSchema = z
  .object({
    version: z.literal(LIVE_VERSION),
    sessionId: id,
    sequence: z.number().int().nonnegative(),
    provider: z.enum(['browser-audio', 'midi']),
    detectorVersion: id,
    captureMs: time,
    receivedMs: time,
    attackId: z.number().int().nonnegative(),
    pitches: z.array(midi).max(12),
    chords: z.array(chordHypothesisSchema).max(3),
    kind: z.enum(['note', 'chord', 'unknown']),
    stable: z.boolean(),
    rms: z.number().finite().min(0).max(1),
    clarity: z.number().finite().min(0).max(1).nullable(),
    problems: z.array(inputProblemSchema).max(8),
  })
  .strict();
export type PerformanceObservation = z.infer<typeof observationSchema>;
export const liveInputSessionSchema = z
  .object({
    version: z.literal(LIVE_VERSION),
    id,
    provider: z.enum(['browser-audio', 'midi']),
    status: z.enum(['idle', 'requesting', 'listening', 'stopped', 'error']),
    sampleRate: z.number().positive().nullable(),
    channel: z.number().int().min(0).max(31),
    processingDisabled: z.boolean().nullable(),
    calibrationId: id.nullable(),
    qualification: z.literal('experimental'),
    timingQualified: z.literal(false),
  })
  .strict();
export type LiveInputSession = z.infer<typeof liveInputSessionSchema>;
export const liveContractSchema = z
  .object({
    version: z.literal(LIVE_VERSION),
    id,
    sourceRevision: id,
    stimulusId: id,
    prompt: z.string().min(1).max(500),
    kind: z.enum(['note', 'sequence', 'chords']),
    pitches: z.array(midi).max(32),
    chords: z.array(chordHypothesisSchema.omit({ score: true })).max(8),
    exactOctave: z.boolean(),
    semitoneSteps: z.array(z.number().int().min(-24).max(24)).max(31).optional(),
    positionVerified: z.literal(false),
    timingGraded: z.literal(false),
  })
  .strict()
  .refine(
    (t) =>
      !t.semitoneSteps ||
      (t.kind === 'sequence' && t.semitoneSteps.length === t.pitches.length - 1),
  )
  .refine((t) =>
    t.kind === 'chords'
      ? t.chords.length > 0 && !t.pitches.length
      : t.pitches.length > 0 && !t.chords.length,
  );
export type LiveAssessmentContract = z.infer<typeof liveContractSchema>;
export const performanceAttemptSchema = z
  .object({
    version: z.literal(LIVE_VERSION),
    id,
    episodeId: id,
    task: liveContractSchema,
    inputSessionId: id,
    provider: z.enum(['browser-audio', 'midi']),
    inputConfiguration: liveInputSessionSchema.optional(),
    startedAt: time,
    finishedAt: time,
    responseIndex: z.number().int().nonnegative(),
    assisted: z.boolean(),
    supports: z.array(z.enum(['cue', 'example', 'answer', 'teacher'])).max(32),
    observations: z.array(observationSchema).max(256),
    outcome: z.enum(['match', 'discrepancy', 'unassessed', 'interrupted']),
    reason: z.string().max(500),
    qualification: z.literal('experimental'),
    evidence: z.literal('detected-audio'),
    timingGraded: z.literal(false),
    positionVerified: z.literal(false),
  })
  .strict()
  .refine(
    (a) =>
      a.finishedAt >= a.startedAt &&
      (!a.inputConfiguration ||
        (a.inputConfiguration.id === a.inputSessionId &&
          a.inputConfiguration.provider === a.provider)) &&
      a.observations.every((o) => o.sessionId === a.inputSessionId && o.provider === a.provider),
  );
export type PerformanceAttempt = z.infer<typeof performanceAttemptSchema>;
export const liveBookmarkSchema = z
  .object({
    task: liveContractSchema,
    episodeId: id,
    responseIndex: z.number().int().nonnegative(),
    pending: z
      .object({
        inputSessionId: id,
        provider: z.enum(['browser-audio', 'midi']),
        inputConfiguration: liveInputSessionSchema.optional(),
        startedAt: time,
      })
      .strict()
      .optional(),
  })
  .strict();
export const liveLessonEventSchema = z
  .object({
    attempt: performanceAttemptSchema.optional(),
    support: z.enum(['cue', 'example', 'answer', 'teacher']).optional(),
    taskId: id,
  })
  .strict();

// No device names, audio, answer contracts, or continuous observations cross this boundary.
export const liveContextSchema = z
  .object({
    capability: z.literal(LIVE_VERSION),
    revision: z.number().int().nonnegative(),
    ready: z.boolean(),
    active: z.boolean(),
    assisted: z.boolean(),
    qualification: z.literal('experimental'),
    eligible: z.array(z.object({ id, label: z.string().max(500) }).strict()).max(8),
    evidence: z
      .array(
        z
          .object({
            id,
            outcome: z.enum(['match', 'discrepancy', 'unassessed', 'interrupted']),
            kind: z.enum(['note', 'sequence', 'chords']),
            assisted: z.boolean(),
            firstResponse: z.boolean(),
            provider: z.enum(['browser-audio', 'midi']),
            qualification: z.literal('experimental'),
            taskPrompt: z.string().max(500),
            detectedChords: z.array(chordHypothesisSchema).max(8),
            detectedPitches: z.array(midi).max(32),
            problems: z.array(inputProblemSchema).max(8),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export type LiveContext = z.infer<typeof liveContextSchema>;
export const liveActionSchema = z.object({ type: z.literal('live'), taskId: id }).strict();
export type LiveAction = z.infer<typeof liveActionSchema>;
