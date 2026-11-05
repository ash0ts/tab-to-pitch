import { z } from 'zod';

export const COACH_POLICY_VERSION = 'eligible-candidate-v1';
export const COACH_PROMPT_VERSION = 'coach-v1';
export const LOCAL_COACH_VERSIONS = Object.freeze({
  policy: 'evidence-priority-v1',
  prompt: 'none',
  model: 'deterministic-baseline-v1',
} as const);
export function forgeCoachVersions(model: string) {
  return { policy: COACH_POLICY_VERSION, prompt: COACH_PROMPT_VERSION, model };
}
const localVersionsSchema = z
  .object({
    policy: z.literal(LOCAL_COACH_VERSIONS.policy),
    prompt: z.literal(LOCAL_COACH_VERSIONS.prompt),
    model: z.literal(LOCAL_COACH_VERSIONS.model),
  })
  .strict();
const forgeVersionsSchema = z
  .object({
    policy: z.literal(COACH_POLICY_VERSION),
    prompt: z.literal(COACH_PROMPT_VERSION),
    model: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/),
  })
  .strict();

const opaqueId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
export const drillKindSchema = z.enum(['note-name', 'note-location', 'interval', 'triad-role']);
export const evidenceSchema = z
  .object({
    id: opaqueId,
    skillId: opaqueId,
    attempts: z.number().int().min(0).max(100_000),
    correct: z.number().int().min(0).max(100_000),
    assisted: z.number().int().min(0).max(100_000),
  })
  .strict()
  .refine(
    (value) => value.correct + value.assisted <= value.attempts,
    'Evidence counts exceed attempts',
  );
export const drillCandidateSchema = z
  .object({
    id: opaqueId,
    kind: drillKindSchema,
    skillId: opaqueId,
    noteIds: z.array(opaqueId).min(1).max(32),
    tempoBpm: z.number().min(20).max(400),
    loop: z
      .object({ startTick: z.number().int().min(0), endTick: z.number().int().positive() })
      .strict()
      .refine((value) => value.endTick > value.startTick, 'Loop must have positive duration'),
  })
  .strict();
export const coachContextSchema = z
  .object({
    schemaVersion: z.literal(1),
    phrase: z
      .object({
        id: opaqueId,
        noteCount: z.number().int().min(1).max(10_000),
        distinctPitchClasses: z.number().int().min(1).max(12),
        stringCrossings: z.number().int().min(0).max(10_000),
        positionChanges: z.number().int().min(0).max(10_000),
      })
      .strict(),
    evidence: z.array(evidenceSchema).max(32),
    candidates: z.array(drillCandidateSchema).min(1).max(12),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const field of ['evidence', 'candidates'] as const) {
      const ids = value[field].map((item) => item.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', path: [field], message: 'IDs must be unique' });
    }
  });
export const coachRequestSchema = z
  .object({ requestId: z.string().uuid(), context: coachContextSchema })
  .strict();
export const reasonCodeSchema = z.enum([
  'start-recall',
  'review-errors',
  'reduce-hints',
  'extend-recall',
]);
export type CoachContext = z.infer<typeof coachContextSchema>;
export type DrillCandidate = z.infer<typeof drillCandidateSchema>;
export type CoachEvidence = z.infer<typeof evidenceSchema>;
export type CoachRequest = z.infer<typeof coachRequestSchema>;
export type ReasonCode = z.infer<typeof reasonCodeSchema>;
export interface CoachProposal {
  candidateId: string;
  kind: DrillCandidate['kind'];
  noteIds: string[];
  tempoBpm: number;
  loop: DrillCandidate['loop'];
  evidenceRefs: string[];
  reasonCode: ReasonCode;
  explanation: string;
}
export interface CoachResponse {
  source: 'forge' | 'local';
  versions: { policy: string; prompt: string; model: string };
  proposal: CoachProposal;
  fallbackReason?:
    | 'disabled'
    | 'session-required'
    | 'budget'
    | 'unavailable'
    | 'invalid-response'
    | 'duplicate';
  traceId?: string;
}
export interface SessionStatus {
  authenticated: boolean;
  cloudEnabled: boolean;
  expiresAt?: string;
}

export const coachResponseSchema = z
  .object({
    source: z.enum(['forge', 'local']),
    versions: z.union([localVersionsSchema, forgeVersionsSchema]),
    proposal: z
      .object({
        candidateId: opaqueId,
        kind: drillKindSchema,
        noteIds: z.array(opaqueId).min(1).max(32),
        tempoBpm: z.number().min(20).max(400),
        loop: z
          .object({ startTick: z.number().int().min(0), endTick: z.number().int().positive() })
          .strict(),
        evidenceRefs: z.array(opaqueId).max(32),
        reasonCode: reasonCodeSchema,
        explanation: z.string().max(512),
      })
      .strict(),
    fallbackReason: z
      .enum([
        'disabled',
        'session-required',
        'budget',
        'unavailable',
        'invalid-response',
        'duplicate',
      ])
      .optional(),
    traceId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((response, ctx) => {
    const schema = response.source === 'local' ? localVersionsSchema : forgeVersionsSchema;
    if (!schema.safeParse(response.versions).success)
      ctx.addIssue({
        code: 'custom',
        path: ['versions'],
        message: 'Versions must match the response source',
      });
    if (response.source === 'forge' && response.fallbackReason)
      ctx.addIssue({
        code: 'custom',
        path: ['fallbackReason'],
        message: 'A successful cloud response cannot be a fallback',
      });
  });

/** Browser boundary: accept only the exact fact-derived proposal for this context. */
export function validateCoachResponse(value: unknown, context: CoachContext): CoachResponse {
  const response = coachResponseSchema.parse(value);
  const expected = proposalForCandidate(context, response.proposal.candidateId);
  if (JSON.stringify(response.proposal) !== JSON.stringify(expected))
    throw new Error('Coach proposal does not match the current practice context');
  return response;
}

const kindNames: Record<DrillCandidate['kind'], string> = {
  'note-name': 'note names',
  'note-location': 'note locations',
  interval: 'intervals',
  'triad-role': 'triad roles',
};

/** All displayed facts are derived from validated evidence, never model prose. */
export function proposalForCandidate(context: CoachContext, candidateId: string): CoachProposal {
  const candidate = context.candidates.find((value) => value.id === candidateId);
  if (!candidate) throw new Error('Ineligible drill candidate');
  const evidence = context.evidence.filter((value) => value.skillId === candidate.skillId);
  const attempts = evidence.reduce((sum, value) => sum + value.attempts, 0);
  const correct = evidence.reduce((sum, value) => sum + value.correct, 0);
  const assisted = evidence.reduce((sum, value) => sum + value.assisted, 0);
  const errors = attempts - correct - assisted;
  const reasonCode: ReasonCode =
    attempts === 0
      ? 'start-recall'
      : errors > 0
        ? 'review-errors'
        : assisted > 0
          ? 'reduce-hints'
          : 'extend-recall';
  const task = kindNames[candidate.kind];
  const explanation =
    reasonCode === 'start-recall'
      ? `Start practicing ${task}. Support is chosen from your practice history.`
      : reasonCode === 'review-errors'
        ? `Your recorded ${task} attempts include ${errors} incorrect first answer${errors === 1 ? '' : 's'}. Review this drill with support chosen from your practice history.`
        : reasonCode === 'reduce-hints'
          ? `You used hints on ${assisted} ${task} attempt${assisted === 1 ? '' : 's'}. Practice this drill with support chosen from your history.`
          : `You answered ${correct} recorded ${task} attempt${correct === 1 ? '' : 's'} correctly without hints. Continue with support chosen from your practice history.`;
  return {
    candidateId: candidate.id,
    kind: candidate.kind,
    noteIds: [...candidate.noteIds],
    tempoBpm: candidate.tempoBpm,
    loop: { ...candidate.loop },
    evidenceRefs: evidence.map((value) => value.id),
    reasonCode,
    explanation,
  };
}

/** Stable baseline: review errors first, then hints, then unseen skills. */
export function localCoach(
  context: CoachContext,
  fallbackReason: CoachResponse['fallbackReason'] = 'disabled',
): CoachResponse {
  const ranked = context.candidates
    .map((candidate, index) => {
      const evidence = context.evidence.filter((value) => value.skillId === candidate.skillId);
      const attempts = evidence.reduce((sum, value) => sum + value.attempts, 0);
      const errors = evidence.reduce(
        (sum, value) => sum + value.attempts - value.correct - value.assisted,
        0,
      );
      const hints = evidence.reduce((sum, value) => sum + value.assisted, 0);
      const priority =
        errors > 0
          ? 3 + errors / attempts
          : hints > 0
            ? 2 + hints / attempts
            : attempts === 0
              ? 1
              : 0;
      return { candidate, index, priority };
    })
    .sort((a, b) => b.priority - a.priority || a.index - b.index);
  return {
    source: 'local',
    versions: { ...LOCAL_COACH_VERSIONS },
    proposal: proposalForCandidate(context, ranked[0]!.candidate.id),
    fallbackReason,
  };
}
