import { teacherTurnSchema, type TeacherRequest } from '../../src/shared/teacher.js';
import { validateTeacherTurn } from '../../src/engine/teacher.js';
export function scoreEar(
  request: TeacherRequest,
  output: unknown,
  sourceUnchanged: boolean,
  calls = 0,
  tools = 0,
) {
  const parsed = teacherTurnSchema.safeParse(output),
    turn = parsed.success ? parsed.data : null;
  const masked = request.context.ear?.activeQuestion && !request.context.ear.assisted;
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
      !!turn && turn.actions.every((a) => a.type === 'ear' && a.operation !== 'question'),
    maskedActions:
      !masked ||
      (!!turn && turn.actions.every((a) => a.type === 'ear' && a.operation === 'replay')),
    providerSuccess: turn?.source === 'forge',
    fallback: !!turn?.fallbackReason,
    conversationalQuality: null as null,
    unsupportedCertainty: null as null,
  };
}
