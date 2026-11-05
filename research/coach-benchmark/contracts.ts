import { z } from 'zod';
import {
  coachContextSchema,
  coachResponseSchema,
  localCoach,
  proposalForCandidate,
  type CoachResponse,
} from '../../src/shared/coach.js';

export const campaignCaseSchema = z.object({
  id: z.string(),
  recordingId: z.string(),
  sourceSha256: z.string(),
  performerId: z.string(),
  progressionFamily: z.union([z.string(), z.number()]),
  split: z.string(),
  context: coachContextSchema,
  evidenceBasis: z.literal('real-recorded-music-with-no-learner-history'),
  exerciseIds: z.array(z.string()),
  noteFacts: z.array(
    z.object({
      id: z.string(),
      midi: z.number(),
      string: z.number(),
      inferredFret: z.number(),
      observedMidi: z.number(),
    }),
  ),
});
export type CampaignCase = z.infer<typeof campaignCaseSchema>;

export function scoreProposal(task: CampaignCase, output: CoachResponse) {
  const candidate = task.context.candidates.find((item) => item.id === output.proposal.candidateId);
  const expected = candidate && proposalForCandidate(task.context, candidate.id);
  const facts = new Set(task.noteFacts.map((note) => note.id));
  return {
    versionedContract: coachResponseSchema.safeParse(output).success,
    eligible: !!candidate && candidate.noteIds.every((id) => facts.has(id)),
    settingsUnchanged:
      !!expected &&
      output.proposal.kind === expected.kind &&
      output.proposal.tempoBpm === expected.tempoBpm &&
      JSON.stringify(output.proposal.loop) === JSON.stringify(expected.loop) &&
      JSON.stringify(output.proposal.noteIds) === JSON.stringify(expected.noteIds),
    groundedExplanation:
      !!expected &&
      expected.explanation === output.proposal.explanation &&
      JSON.stringify(expected.evidenceRefs) === JSON.stringify(output.proposal.evidenceRefs),
    noInventedHistory:
      output.proposal.evidenceRefs.length === 0 && output.proposal.reasonCode === 'start-recall',
    // This is compliance with deterministic tie-breaking, not teaching quality.
    policyAgreement: output.proposal.candidateId === localCoach(task.context).proposal.candidateId,
  };
}

export type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };
export function validUsage(value: unknown): Usage | undefined {
  const parsed = z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .safeParse(value);
  return parsed.success &&
    parsed.data.total_tokens >= parsed.data.prompt_tokens + parsed.data.completion_tokens
    ? parsed.data
    : undefined;
}

export type BudgetItem = { reservedTokens: number; usage?: Usage };
export function accountedTokens(items: BudgetItem[]): number {
  return items.reduce((sum, item) => sum + (item.usage?.total_tokens ?? item.reservedTokens), 0);
}
export function requireAllowance(
  items: BudgetItem[],
  reservation: number,
  maxCalls: number,
  maxTokens: number,
) {
  if (items.length >= maxCalls || accountedTokens(items) + reservation > maxTokens)
    throw new Error('Campaign inference allowance exhausted');
}
