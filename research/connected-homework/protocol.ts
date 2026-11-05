import type { TeacherRequest, TeacherTurn } from '../../src/shared/teacher';
import { validateTeacherTurn } from '../../src/engine/teacher';
export const PROTOCOL = 'connected-homework-demo-v1';
export const DEMO_PROMPTS = [
  'Why is E the third of C major? Just explain, and show me where to hear it.',
  'I reported needs another pass. In G7 to Cmaj7, explain why F moves to E and show the two roles. Do not grade my playing.',
  'I played a C. Did I use the right string and CAGED family? Then let me try the change again without a quiz.',
] as const;
/** Narrow smoke criteria, frozen before calls. These are not a pedagogical-quality judge. */
export function scoreDemo(
  request: TeacherRequest,
  response: TeacherTurn,
  calls: number,
  tools: number,
) {
  const index = DEMO_PROMPTS.indexOf(request.request as (typeof DEMO_PROMPTS)[number]);
  const text = response.message;
  const requestAddressed =
    index === 0
      ? /E/.test(text) && /third/i.test(text) && /C/.test(text)
      : index === 1
        ? /F/.test(text) &&
          /E/.test(text) &&
          /seventh|b7/i.test(text) &&
          /third/i.test(text) &&
          /semitone|half.step/i.test(text)
        : index === 2
          ? /cannot|can't|does not|doesn’t|not verify|not establish|can't tell|unable/i.test(
              text,
            ) && /fret|string|position|family/i.test(text)
          : false;
  return {
    schemaAndActionsValid: !!validateTeacherTurn(response, request),
    boundedCalls: calls <= 5 && tools <= 8,
    providerSuccess: response.source === 'forge' && response.review.status === 'passed',
    fallback: response.source === 'local',
    requestAddressedByKeywordCheck: requestAddressed,
    noUnrequestedQuiz: !response.actions.some(
      (a) => a.type === 'question' || (a.type === 'homework' && a.operation === 'task'),
    ),
    contextHasExpectedHarmony:
      index !== 1 || request.context.music.spans.map((s) => s.symbol).join(',') === 'G7,Cmaj7',
  };
}
