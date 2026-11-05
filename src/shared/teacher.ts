import { liveContextSchema, liveActionSchema, LIVE_TEACHER_VERSION } from './live-guitar.js';
import { homeworkActionSchema, homeworkContextSchema } from './homework.js';
import { practiceActionSchema, practiceContextSchema } from './practice.js';
import {
  earContextSchema,
  earActionSchema,
  audioJobRequestSchema,
  audioJobReceiptSchema,
} from './audio.js';
import { difficultySchema } from '../songs/listening.js';
import { CATALOG_VERSION, curatedHarmony, passageReady } from '../songs/catalog.js';
import { z } from 'zod';
import { parseChordSymbol } from '../engine/harmony.js';
import { parsePitch } from '../engine/theory.js';
import {
  arrangementContextSchema,
  arrangementConstraintsSchema,
  arrangementIntentSchema,
} from './arrangements.js';

export const TEACHER_VERSION = 'teacher-v1';
export const INTEGRATED_TEACHER_VERSION = 'teacher-v5';
export const teacherCapabilitySchema = z.enum(['listening-v1', 'teaching-practice-v1', 'homework-caged-v1', 'teacher-live-v1', 'ear-lab-v1', 'practice-stage-v1', 'homework-playing-v1']);
export const TEACHER_PROMPT_VERSION = 'teacher-tools-v8-integrated';
export const HOMEWORK_TEACHER_VERSION = 'teacher-v4';
export const PRACTICE_TEACHER_VERSION = 'teacher-v3';
export const EAR_TEACHER_VERSION = 'teacher-v3';
export const LISTENING_TEACHER_VERSION = 'teacher-v2';
export const CURRICULUM_VERSION = 'teacher-curriculum-v1';
export const teacherObjectiveSchema = z.enum([
  'foundations',
  'connections',
  'extensions',
  'listening',
]);
export const teacherExerciseKindSchema = z.enum([
  'note-name',
  'note-location',
  'interval',
  'triad-role',
  'chord-tone',
  'next-target',
  'changed-tone',
  'voice-connection',
]);
const id = z.string().min(1).max(160);
const position = z
  .object({ string: z.number().int().min(1).max(6), fret: z.number().int().min(0).max(24) })
  .strict();
export const teacherRequestSchema = z
  .object({
    schemaVersion: z.enum([TEACHER_VERSION, LISTENING_TEACHER_VERSION, PRACTICE_TEACHER_VERSION, HOMEWORK_TEACHER_VERSION, LIVE_TEACHER_VERSION, INTEGRATED_TEACHER_VERSION]),
    capabilities: z.array(teacherCapabilitySchema).max(7).optional(),
    requestId: z.string().uuid(),
    lessonId: z.string().uuid(),
    turnId: z.string().uuid(),
    contextVersion: id,
    request: z.string().min(1).max(2000),
    localAudio: audioJobRequestSchema.optional(),
    context: z
      .object({
        objective: teacherObjectiveSchema,
        practice: practiceContextSchema.optional(),
        homework: homeworkContextSchema.optional(),
        live: liveContextSchema.optional(),
        ear: earContextSchema.optional(),
        listening: z
          .object({
            passageId: z.string().max(100),
            annotationVersion: z.literal(CATALOG_VERSION),
            source: z.enum(['recording', 'synthesized']),
            difficulty: difficultySchema,
            activeQuestion: z.object({ id, assisted: z.boolean() }).strict().nullable(),
            evidence: z
              .array(
                z
                  .object({
                    id,
                    outcome: z.enum(['answered', 'revealed', 'interrupted']),
                    assisted: z.boolean(),
                    source: z.enum(['recording', 'synthesized']),
                    familiar: z.boolean(),
                    root: z.array(z.boolean()).max(8),
                    quality: z.array(z.boolean()).max(8),
                    sequence: z.boolean().nullable(),
                  })
                  .strict(),
              )
              .max(8),
          })
          .strict()
          .optional(),
        music: arrangementContextSchema,
        selectedNotes: z
          .array(
            z
              .object({
                id: z.string().regex(/^n[0-7]$/),
                midi: z.number().int().min(0).max(127),
                position: position.nullable(),
                spelling: z.string().max(12).nullable(),
              })
              .strict(),
          )
          .max(8)
          .optional(),
        workspace: z
          .object({
            view: z.enum(['source', 'proposal', 'preview']),
            sourceSymbols: z
              .array(
                z
                  .string()
                  .max(24)
                  .refine((value) => parseChordSymbol(value) !== null)
                  .nullable(),
              )
              .min(1)
              .max(8),
          })
          .strict()
          .optional(),
        constraints: arrangementConstraintsSchema,
        bass: z
          .array(
            z
              .object({
                spanIndex: z.number().int().min(0).max(7),
                midi: z.number().int().min(0).max(127),
                source: z.enum(['authored', 'observed', 'learner-confirmed']),
              })
              .strict(),
          )
          .max(8),
        evidence: z
          .array(
            z
              .object({
                id,
                kind: teacherExerciseKindSchema,
                outcome: z.enum([
                  'correct',
                  'incorrect',
                  'revealed',
                  'interrupted',
                  'self-reported',
                ]),
                assisted: z.boolean(),
                response: z.string().max(120),
                mode: z.enum(['learn', 'recall', 'transfer', 'delayed']),
                elapsedDays: z.number().finite().min(0).max(36500),
              })
              .strict(),
          )
          .max(12),
        history: z
          .array(
            z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) }).strict(),
          )
          .max(8),
        exposures: z.array(id).max(512),
        activeQuestion: z
          .object({ id, kind: teacherExerciseKindSchema, assisted: z.boolean() })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (request.schemaVersion === INTEGRATED_TEACHER_VERSION) {
      const capabilities = request.capabilities;
      if (!capabilities || new Set(capabilities).size !== capabilities.length)
        ctx.addIssue({ code: 'custom', path: ['capabilities'], message: 'V5 requires unique, explicit capabilities.' });
      for (const [field, capability] of [['practice', 'teaching-practice-v1'], ['listening', 'listening-v1'], ['homework', 'homework-caged-v1'], ['live', 'teacher-live-v1'], ['ear', 'ear-lab-v1']] as const) {
        if (Boolean(request.context[field]) !== Boolean(capabilities?.includes(capability)))
          ctx.addIssue({ code: 'custom', path: ['capabilities'], message: `Capability ${capability} must match its context.` });
      }
    }

    if (request.context.practice && ![PRACTICE_TEACHER_VERSION, HOMEWORK_TEACHER_VERSION, LIVE_TEACHER_VERSION, INTEGRATED_TEACHER_VERSION].includes(request.schemaVersion))
      ctx.addIssue({
        code: 'custom',
        path: ['context', 'practice'],
        message: 'Practice requires the v3 capability contract.',
      });
    if (request.context.homework && ![HOMEWORK_TEACHER_VERSION, LIVE_TEACHER_VERSION, INTEGRATED_TEACHER_VERSION].includes(request.schemaVersion))
      ctx.addIssue({
        code: 'custom',
        path: ['context', 'homework'],
        message: 'Homework requires the v4 capability contract.',
      });
    if(request.context.live && ![LIVE_TEACHER_VERSION, INTEGRATED_TEACHER_VERSION].includes(request.schemaVersion))ctx.addIssue({code:'custom',path:['context','live'],message:'Live input requires the live capability contract.'});
    if (request.context.ear && ![EAR_TEACHER_VERSION, INTEGRATED_TEACHER_VERSION].includes(request.schemaVersion))
      ctx.addIssue({
        code: 'custom',
        path: ['context', 'ear'],
        message: 'Ear capabilities require teacher-v3.',
      });
    if(request.schemaVersion === EAR_TEACHER_VERSION && request.context.ear && request.context.practice) ctx.addIssue({code:'custom',path:['schemaVersion'],message:'Ambiguous legacy teacher-v3 capabilities; use teacher-v5.'});
    if (request.context.listening) {
      const p = curatedHarmony.getPassage(request.context.listening.passageId);
      if (request.schemaVersion === TEACHER_VERSION || !p || !passageReady(p))
        ctx.addIssue({
          code: 'custom',
          path: ['context', 'listening'],
          message: 'Listening requires a reviewed passage and the v2 contract.',
        });
    }
    const selectedIds = new Set<string>();
    request.context.selectedNotes?.forEach((note, index) => {
      if (
        selectedIds.has(note.id) ||
        (note.spelling !== null && parsePitch(note.spelling) !== note.midi) ||
        (note.position !== null &&
          request.context.music.tuning[note.position.string - 1]! +
            request.context.music.capo +
            note.position.fret !==
            note.midi)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['context', 'selectedNotes', index],
          message:
            'Selected ordinary-note facts must have unique aliases and matching spelling, position, and sounding pitch.',
        });
      selectedIds.add(note.id);
    });
    if (
      request.context.workspace &&
      request.context.workspace.sourceSymbols.length !== request.context.music.spans.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['context', 'workspace', 'sourceSymbols'],
        message: 'Source and current harmonic spans must align.',
      });
    if (
      request.localAudio &&
      (![EAR_TEACHER_VERSION, INTEGRATED_TEACHER_VERSION].includes(request.schemaVersion) ||
        request.localAudio.contextRevision !== request.context.ear?.revision)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['localAudio'],
        message: 'Local audio binding requires the current ear revision.',
      });
    const spans = new Set<number>();
    request.context.bass.forEach((bass, index) => {
      if (bass.spanIndex >= request.context.music.spans.length || spans.has(bass.spanIndex))
        ctx.addIssue({
          code: 'custom',
          path: ['context', 'bass', index],
          message: 'Bass facts require one existing span each.',
        });
      spans.add(bass.spanIndex);
    });
    const evidenceIds = new Set<string>();
    request.context.evidence.forEach((evidence, index) => {
      if (
        evidenceIds.has(evidence.id) ||
        ['instrument', 'evidence-boundary', 'ranker-limit', 'workspace'].includes(evidence.id) ||
        /^(?:harmony|tone|bass|arrangement|selected):/.test(evidence.id)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['context', 'evidence', index, 'id'],
          message: 'Evidence IDs must be unique and separate from musical fact IDs.',
        });
      evidenceIds.add(evidence.id);
    });
  });
export type TeacherRequest = z.infer<typeof teacherRequestSchema>;

export const teacherTaskRecipeSchema = z
  .object({
    kind: z.enum([
      'note-name',
      'note-location',
      'chord-tone',
      'next-target',
      'changed-tone',
      'voice-connection',
    ]),
    spanIndex: z.number().int().min(0).max(7),
    degree: z.enum([
      '1',
      '2',
      'b3',
      '3',
      '4',
      'b5',
      '5',
      '#5',
      '6',
      'bb7',
      'b7',
      '7',
      '9',
      '11',
      '13',
    ]),
    targetDegree: z
      .enum(['1', '2', 'b3', '3', '4', 'b5', '5', '#5', '6', 'bb7', 'b7', '7', '9', '11', '13'])
      .optional(),
    semitones: z.number().int().min(-12).max(12).optional(),
    targetSymbol: z.string().min(1).max(24).optional(),
    assessment: z.enum(['practice', 'heldout']).default('practice'),
    region: z
      .object({
        minFret: z.number().int().min(0).max(24),
        maxFret: z.number().int().min(0).max(24),
      })
      .strict()
      .refine((region) => region.minFret <= region.maxFret, 'Fret region is reversed')
      .optional(),
  })
  .strict();
export type TeacherTaskRecipe = z.infer<typeof teacherTaskRecipeSchema>;
export const teacherHighlightActionSchema = z
    .object({
      type: z.literal('highlight'),
      spanIndex: z.number().int().min(0).max(7),
      degree: z.string().max(4),
    })
    .strict();
export const teacherAuditionActionSchema = z
    .object({
      type: z.literal('audition'),
      spanIndex: z.number().int().min(0).max(7),
      includeBass: z.boolean(),
      omitRoot: z.boolean().optional(),
    })
    .strict();
export const teacherActionSchema = z.discriminatedUnion('type', [
  practiceActionSchema,
  homeworkActionSchema,
  liveActionSchema,
  earActionSchema,
  z
    .object({
      type: z.literal('listening'),
      operation: z.enum(['replay', 'tonic', 'question', 'workspace', 'bass', 'transfer']),
      difficulty: difficultySchema,
    })
    .strict(),
  teacherHighlightActionSchema,
  z
    .object({
      type: z.literal('preview'),
      intent: arrangementIntentSchema,
      candidateId: z.string().min(1).max(512),
    })
    .strict(),
  z.object({ type: z.literal('question'), recipe: teacherTaskRecipeSchema }).strict(),
  teacherAuditionActionSchema,
]);
export type TeacherAction = z.infer<typeof teacherActionSchema>;
export const teacherClaimSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('tone-role'),
      spanIndex: z.number().int().min(0).max(7),
      noteName: z.string().max(8),
      degree: z.string().max(4),
    })
    .strict(),
  z
    .object({ kind: z.literal('position-pitch'), position, midi: z.number().int().min(0).max(127) })
    .strict(),
  z
    .object({
      kind: z.literal('observation'),
      evidenceId: id,
      outcome: z.enum(['correct', 'incorrect', 'revealed', 'interrupted', 'self-reported']),
      assisted: z.boolean(),
    })
    .strict(),
]);
const finalFields = {
  message: z.string().min(1).max(4000),
  actions: z.array(teacherActionSchema).max(4),
  factRefs: z.array(id).max(24),
  referenceIds: z.array(id).max(8),
  claims: z.array(teacherClaimSchema).max(16),
};
export const teacherToolNames = [
  'inspect_live_input', 'live_activity', 'homework_map', 'homework_activity', 'practice_activity',
  'inspect_audio',
  'ear_activity',
  'inspect_passage',
  'listening_activity',
  'inspect_music',
  'read_learner',
  'teaching_reference',
  'explore_voicings',
  'demonstrate',
  'create_question',
  'find_review',
  'research_ranker',
] as const;
export const teacherToolCallSchema = z
  .object({ name: z.enum(teacherToolNames), args: z.record(z.string(), z.unknown()) })
  .strict();
export type TeacherToolCall = z.infer<typeof teacherToolCallSchema>;
export const teacherActorStepSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('tools'), calls: z.array(teacherToolCallSchema).min(1).max(8) })
    .strict(),
  z.object({ kind: z.literal('final'), ...finalFields }).strict(),
]);
export type TeacherActorStep = z.infer<typeof teacherActorStepSchema>;
export const teacherTurnSchema = z
  .object({
    schemaVersion: z.enum([TEACHER_VERSION, LISTENING_TEACHER_VERSION, PRACTICE_TEACHER_VERSION, HOMEWORK_TEACHER_VERSION, LIVE_TEACHER_VERSION, INTEGRATED_TEACHER_VERSION]),
    lessonId: z.string().uuid(),
    turnId: z.string().uuid(),
    contextVersion: id,
    source: z.enum(['forge', 'local']),
    ...finalFields,
    versions: z
      .object({
        policy: z.string().max(128),
        prompt: z.string().max(128),
        model: z.string().max(128),
        curriculum: z.string().max(128),
      })
      .strict(),
    review: z
      .object({
        status: z.enum(['passed', 'withheld', 'local']),
        reasons: z.array(z.string().max(400)).max(12),
      })
      .strict(),
    audioJobs: z.array(audioJobReceiptSchema).max(8).optional(),
    fallbackReason: z.string().max(240).optional(),
    traceId: z.string().max(160).optional(),
  })
  .strict();
export type TeacherTurn = z.infer<typeof teacherTurnSchema>;
export interface TeacherFact {
  id: string;
  text: string;
  kind: 'music' | 'observation' | 'boundary';
}
export interface TeacherToolResult {
  status: 'ok' | 'unavailable' | 'invalid';
  facts: TeacherFact[];
  actions: TeacherAction[];
  data?: unknown;
  reason?: string;
}
