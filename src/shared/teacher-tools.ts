import { z } from 'zod';
import { arrangementIntentSchema } from './arrangements.js';
import { teacherActionSchema, teacherTaskRecipeSchema, type TeacherToolCall } from './teacher.js';

const emptyArgs = z.object({}).strict();
export const teacherToolArgumentSchemas = {
  inspect_music: emptyArgs,
  inspect_passage: emptyArgs,
  listening_activity: z
    .object({
      operation: z.enum(['replay', 'tonic', 'question', 'workspace', 'bass', 'transfer']),
      difficulty: z.enum(['guided', 'recall', 'transfer']),
    })
    .strict(),
  read_learner: emptyArgs,
  teaching_reference: z.object({ id: z.string().max(80).optional() }).strict(),
  explore_voicings: z.object({ intent: arrangementIntentSchema }).strict(),
  demonstrate: z
    .object({
      action: z.discriminatedUnion('type', [
        teacherActionSchema.options[1],
        teacherActionSchema.options[4],
      ]),
    })
    .strict(),
  create_question: z.object({ recipe: teacherTaskRecipeSchema }).strict(),
  find_review: emptyArgs,
  research_ranker: z
    .object({
      spanIndex: z.number().int().min(0).max(7),
      previous: z
        .array(
          z
            .object({
              string: z.number().int().min(1).max(6),
              fret: z.number().int().min(0).max(24),
            })
            .strict(),
        )
        .min(3)
        .max(6),
      candidateId: z.string().max(512),
    })
    .strict(),
} satisfies Record<TeacherToolCall['name'], z.ZodType>;
