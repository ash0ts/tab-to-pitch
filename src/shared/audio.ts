import { z } from 'zod';
import { parseChordSymbol } from '../engine/harmony.js';
export const AUDIO_VERSION = 'ear-lab-v1';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const audioStageSchema = z.enum(['transcribe', 'separate', 'timing', 'corroborate']);
export const authoritySchema = z.enum([
  'model-hypothesis',
  'learner-confirmed',
  'independent-reference',
]);
export const audioAssetSchema = z
  .object({
    schemaVersion: z.literal(AUDIO_VERSION),
    id: hash,
    recordingId: hash,
    duration: z.number().positive().max(600),
    permission: z.enum(['owned', 'permission', 'public-domain']),
    origin: z.enum(['upload', 'authored']),
  })
  .strict();
export const audioJobRequestSchema = z
  .object({
    assetId: hash,
    start: z.number().nonnegative(),
    end: z.number().positive(),
    stages: z.array(audioStageSchema).min(1).max(4),
    contextRevision: z.string().min(1).max(160),
  })
  .strict()
  .refine(
    (r) => r.end > r.start && r.end - r.start <= 60 && new Set(r.stages).size === r.stages.length,
  );
export const audioNoteSchema = z
  .object({
    id: z.string().max(160),
    midi: z.number().int().min(0).max(127),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    instrument: z.string().max(100),
    authority: authoritySchema,
    confidence: z.number().min(0).max(1).nullable(),
    family: z.string().max(80),
    families: z.array(z.string().max(80)).optional(),
    pass: z.string().max(100).optional(),
    activation: z.number().optional(),
  })
  .strict()
  .refine((n) => n.end > n.start);
export const audioReviewSchema = z
  .object({
    jobId: z.string().uuid(),
    contextRevision: z.string().min(1).max(160),
    decisions: z
      .array(
        z
          .object({
            noteId: z.string().max(160),
            decision: z.enum(['accept', 'reject', 'replace']),
            midi: z.number().int().min(0).max(127).optional(),
          })
          .strict(),
      )
      .max(256),
  })
  .strict();
export const earActionSchema = z
  .object({
    type: z.literal('ear'),
    operation: z.enum([
      'replay',
      'analyze',
      'draft',
      'compare',
      'compare-note',
      'correct',
      'question',
      'workspace',
    ]),
    noteId: z
      .string()
      .regex(/^h\d{1,3}$/)
      .optional(),
    midi: z.number().int().min(0).max(127).nullable().optional(),
  })
  .strict()
  .refine(
    (a) =>
      a.operation === 'correct'
        ? a.noteId !== undefined && a.midi !== undefined
        : a.noteId === undefined && a.midi === undefined,
    'Correction needs a referenced note and replacement pitch or explicit rejection.',
  );
/** The cloud receives numeric musical evidence, never assets, filenames, or recordings. */
export const earContextSchema = z
  .object({
    revision: z.string().uuid(),
    duration: z.number().positive().max(60),
    analysis: z.enum(['none', 'queued', 'running', 'completed', 'failed', 'cancelled']),
    analysisRef: z.string().uuid().nullable().optional(),
    origin: z.enum(['upload', 'authored']),
    draftVisible: z.boolean(),
    activeQuestion: z.boolean(),
    assisted: z.boolean(),
    hypotheses: z
      .array(
        z
          .object({
            id: z.string().regex(/^h\d{1,3}$/),
            midi: z.number().int().min(0).max(127),
            start: z.number().nonnegative().max(60),
            end: z.number().positive().max(60),
            authority: authoritySchema,
            confidence: z.number().min(0).max(1).nullable(),
            independentFamilies: z.number().int().min(0).max(8),
          })
          .strict(),
      )
      .max(24),
    noteProposal: z.number().int().min(0).max(127).nullable().optional(),
    proposal: z
      .array(
        z
          .string()
          .max(24)
          .refine((s) => s === '' || !!parseChordSymbol(s)),
      )
      .min(2)
      .max(8),
    referenceAvailable: z.boolean(),
  })
  .strict()
  .refine(
    (c) =>
      c.hypotheses.every((n) => n.end > n.start && n.end <= c.duration) &&
      (!c.referenceAvailable || c.origin === 'authored'),
  );
export type AudioAsset = z.infer<typeof audioAssetSchema>;
export type AudioNote = z.infer<typeof audioNoteSchema>;
export type EarContext = z.infer<typeof earContextSchema>;
export type EarAction = z.infer<typeof earActionSchema>;
export type AudioJobRequest = z.infer<typeof audioJobRequestSchema>;
export interface AudioResult {
  schemaVersion: typeof AUDIO_VERSION;
  authority: 'model-hypothesis';
  notes: AudioNote[];
  stems: { model: string; part: string; artifact: string; estimated: true }[];
  coverage: { start: number; end: number; status: 'possible-missing'; reason: string }[];
  calibration: null;
  timing: unknown;
  stages: unknown[];
}
export interface AudioJob extends AudioJobRequest {
  id: string;
  schemaVersion: typeof AUDIO_VERSION;
  fingerprint: string;
  status: EarContext['analysis'];
  error: string | null;
  result: AudioResult | null;
  updated: number;
}

export interface AudioReview {
  id: string;
  authority: 'learner-confirmed';
  createdAt: number;
  decisions: { noteId: string; decision: 'accept' | 'reject' | 'replace'; midi?: number }[];
}

export const audioJobReceiptSchema = z
  .object({
    id: z.string().uuid(),
    contextRevision: z.string().min(1).max(160),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  })
  .strict();
export type AudioJobReceipt = z.infer<typeof audioJobReceiptSchema>;
