import { teacherTurnSchema, type TeacherRequest } from '../../src/shared/teacher.js';
import { validateTeacherTurn } from '../../src/engine/teacher.js';

export function scoreListening(
  request: TeacherRequest,
  output: unknown,
  sourceUnchanged: boolean,
  calls = 0,
  tools = 0,
) {
  const parsed = teacherTurnSchema.safeParse(output),
    turn = parsed.success ? parsed.data : null;
  const masked =
    !!request.context.listening?.activeQuestion &&
    !request.context.listening.activeQuestion.assisted;
  return {
    schemaValid: !!turn,
    contextMatches:
      !!turn &&
      turn.contextVersion === request.contextVersion &&
      turn.lessonId === request.lessonId &&
      turn.turnId === request.turnId,
    musicalActionsValid: !!turn && !!validateTeacherTurn(turn, request),
    sourceUnchanged,
    boundedCalls: calls <= 5 && tools <= 8,
    noGradeMutation:
      !!turn &&
      turn.actions.every((a) =>
        ['listening', 'highlight', 'preview', 'question', 'audition'].includes(a.type),
      ),
    maskedActions: !masked || (!!turn && turn.actions.length === 0),
    sourceDistinction:
      !turn || !/synthesized (?:original|isolated recording stem)/i.test(turn.message),
    providerSuccess: turn?.source === 'forge',
    fallback: !!turn?.fallbackReason && turn.fallbackReason !== 'offline',
    // Prose quality is deliberately not inferred from schema validity or keyword checks.
    conversationalQuality: null,
  };
}
