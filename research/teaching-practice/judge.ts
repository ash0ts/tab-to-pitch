import { z } from 'zod';
import { JUDGE_PROMPT, judgeSchema, validateJudgment } from '../teacher-agent/judge';

const rating = z.enum(['acceptable', 'revise', 'unusable']);
export const practiceJudgeSchema = judgeSchema.extend({
  relevance: rating,
  actionableFeedback: rating,
  learnerChoice: rating,
  instructionalLoad: rating,
  practiceReasons: z
    .object({
      relevance: z.string().min(1).max(500),
      actionableFeedback: z.string().min(1).max(500),
      learnerChoice: z.string().min(1).max(500),
      instructionalLoad: z.string().min(1).max(500),
    })
    .strict(),
});
export type PracticeJudgment = z.infer<typeof practiceJudgeSchema>;
export const PRACTICE_JUDGE_PROMPT = `${JUDGE_PROMPT}
Also rate relevance, actionable feedback, learner choice and instructional load separately, with a reason for each. Evaluate continuity and evidence use using their existing fields. Factual correctness comes from the quoted claims, not a prose-quality score. Useful feedback names a supported discrepancy and offers a feasible next action; it need not reveal the answer. Honor changed goals, declined strategies and requests to stop quizzing. A valid construction need not match an authored example. Recognition, recall, location, construction, reflection and performing are different evidence. Do not require a specific lesson sequence. Rate null or absent evidence as unknown, not as success. These are behavioral judgments, not evidence of educational effectiveness.`;
export function validatePracticeJudgment(raw: unknown, payload: unknown): PracticeJudgment {
  const result = practiceJudgeSchema.parse(raw);
  const base = Object.fromEntries(
    Object.keys(judgeSchema.shape).map((key) => [key, result[key as keyof PracticeJudgment]]),
  );
  validateJudgment(base, payload);
  return result;
}
