import { resolveTeacherAction, validateTeacherTurn } from '../../src/engine/teacher.js';
import type { TeacherTurn } from '../../src/shared/teacher.js';
import type { HomeworkCase } from './cases.js';
export function scoreHomeworkCase(
  item: HomeworkCase,
  output: TeacherTurn,
  sourceUnchanged: boolean,
) {
  return {
    contractValid: !!validateTeacherTurn(output, item.request),
    executableActionsValid: output.actions.every(
      (a) => resolveTeacherAction(item.request, a) !== null,
    ),
    sourceUnchanged,
    respectsStop:
      item.category !== 'changed-goal' ||
      !output.actions.some(
        (a) => a.type === 'question' || (a.type === 'homework' && a.operation === 'task'),
      ),
    modelSuccess: output.source === 'forge' && output.review.status === 'passed',
    localFallback: output.source === 'local',
    // Prose quality is not inferred from structural acceptance or keyword presence.
    conversationalQuality: null,
    educationalEffectiveness: null,
  };
}
