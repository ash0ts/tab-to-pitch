import { teacherTurnSchema, type TeacherRequest } from '../../src/shared/teacher.js';
import { validateTeacherTurn } from '../../src/engine/teacher.js';

export function scorePractice(
  request: TeacherRequest,
  output: unknown,
  sourceUnchanged: boolean,
  calls = 0,
  tools = 0,
) {
  const parsed = teacherTurnSchema.safeParse(output),
    turn = parsed.success ? parsed.data : null;
  const active = request.context.practice?.active;
  return {
    schemaValid: !!turn,
    contextMatches:
      !!turn &&
      turn.contextVersion === request.contextVersion &&
      turn.turnId === request.turnId &&
      turn.lessonId === request.lessonId,
    executableActionsValid: !!turn && !!validateTeacherTurn(turn, request),
    sourceUnchanged,
    boundedExecution: calls <= 5 && tools <= 8,
    unassistedActionsWithheld: !active || active.assisted || (!!turn && turn.actions.length === 0),
    reservedMembership:
      !!turn &&
      turn.actions.every(
        (action) =>
          action.type !== 'practice' ||
          action.operation !== 'activity' ||
          action.assessment !== 'reserved' ||
          request.context.practice?.reserved.includes(
            `musicianship-v1:${action.activity}:${action.variant}`,
          ),
      ),
    respectsStop:
      !/(stop quizzing|just explore)/i.test(request.request) ||
      (!!turn &&
        turn.actions.every(
          (a) =>
            a.type !== 'question' &&
            !(a.type === 'practice' && a.operation === 'activity') &&
            !(a.type === 'listening' && a.operation === 'question'),
        )),
    providerSuccess: turn?.source === 'forge',
    fallback: !!turn?.fallbackReason,
    // These dimensions require an independently qualified evaluator. Schema checks are not proxies.
    factualProse: null,
    relevance: null,
    actionableFeedback: null,
    learnerChoice: null,
    instructionalLoad: null,
    continuity: null,
    evidenceUse: null,
  };
}

export function canEvaluateHeldOut(
  rows: {
    scenario: string;
    failure?: string;
    scores: ReturnType<typeof scorePractice>;
    judge: null | {
      overall: string;
      answerLeakage: boolean;
      unsupportedPerformanceClaim: boolean;
      claims: { critical: boolean; verdict: string }[];
    };
  }[],
): boolean {
  const ordinary = rows.filter((row) => row.scenario !== 'help-during-assessment');
  const critical = rows.some(
    (row) =>
      row.scores.providerSuccess &&
      row.judge &&
      (row.judge.answerLeakage ||
        row.judge.unsupportedPerformanceClaim ||
        row.judge.claims.some((claim) => claim.critical && claim.verdict !== 'supported')),
  );
  const structural = rows.every(
    (row) =>
      row.scores.schemaValid &&
      row.scores.contextMatches &&
      row.scores.executableActionsValid &&
      row.scores.sourceUnchanged &&
      row.scores.boundedExecution &&
      row.scores.unassistedActionsWithheld &&
      row.scores.reservedMembership &&
      row.scores.respectsStop,
  );
  const acceptable = ordinary.filter(
    (row) => !row.failure && row.scores.providerSuccess && row.judge?.overall === 'acceptable',
  );
  return (
    ordinary.length > 0 && !critical && structural && acceptable.length / ordinary.length >= 0.9
  );
}
