import { createHash } from 'node:crypto';
import {
  teacherRequestSchema,
  type TeacherRequest,
  type TeacherTurn,
} from '../../src/shared/teacher.js';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../../src/shared/arrangements.js';
import { exposureKeysForTeacherTurn } from '../../src/engine/teacher.js';
import type { TeacherCase, TeacherEpisode } from './cases.js';

export function stableUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const rootBass: Record<string, number> = {
  C: 36,
  G: 43,
  D: 38,
  F: 41,
  Bb: 34,
  Eb: 39,
  A: 33,
  E: 40,
};
export function teacherRequest(
  task: TeacherCase,
  identity: string,
  options: { withholdHistory?: boolean } = {},
): TeacherRequest {
  const c = task.context;
  const evidence: TeacherRequest['context']['evidence'] =
    options.withholdHistory || task.evidence === 'unseen'
      ? []
      : Array.from({ length: task.evidence === 'unassisted' ? 2 : 1 }, (_, i) => ({
          id: `evidence-${i + 1}`,
          kind: c.lesson === 'connections' ? ('next-target' as const) : ('chord-tone' as const),
          outcome:
            task.evidence === 'incorrect'
              ? ('incorrect' as const)
              : task.evidence === 'assisted'
                ? ('revealed' as const)
                : ('correct' as const),
          assisted: task.evidence === 'assisted',
          response:
            task.evidence === 'incorrect'
              ? 'root'
              : task.evidence === 'assisted'
                ? 'reveal'
                : 'third',
          mode: 'recall' as const,
          elapsedDays: i,
        }));
  const request = teacherRequestSchema.parse({
    schemaVersion: 'teacher-v1',
    requestId: stableUuid(`${identity}:request`),
    lessonId: stableUuid(`${identity}:lesson`),
    turnId: stableUuid(`${identity}:turn`),
    contextVersion: `${task.contextId}:v1`,
    request: task.request,
    context: {
      objective: c.lesson,
      music: {
        tuning: c.tuning,
        capo: c.capo,
        key: { tonic: c.key, mode: 'ionian' },
        selectedSpan: c.lesson === 'extensions' ? 0 : 1,
        spans: c.chords.map((symbol, i) => ({
          symbol,
          confirmed: true,
          startTick: i * 3840,
          endTick: (i + 1) * 3840,
          melody: [],
        })),
      },
      constraints: {
        ...DEFAULT_ARRANGEMENT_CONSTRAINTS,
        minFret: c.minFret,
        maxFret: c.maxFret,
        strings: [1, 2, 3, 4, 5, 6],
        voiceCount: 4,
        omitFifth: true,
      },
      bass: c.bassConfirmed ? [{ spanIndex: 2, midi: rootBass[c.key]!, source: 'authored' }] : [],
      evidence,
      // The ablation removes only historical evidence. The current learner request is unchanged.
      history: options.withholdHistory ? [] : task.history,
      exposures: [],
      activeQuestion: null,
    },
  });
  if (task.evidence === 'assisted' && !options.withholdHistory) {
    // The authored state says the answer was revealed; use the same conservative key as the UI.
    request.context.exposures = exposureKeysForTeacherTurn(request, {
      schemaVersion: 'teacher-v1',
      lessonId: request.lessonId,
      turnId: request.turnId,
      contextVersion: request.contextVersion,
      source: 'local',
      message: 'Synthetic prior answer reveal.',
      actions: [],
      factRefs: [],
      referenceIds: [],
      claims: [],
      versions: {
        policy: 'teacher-v1',
        prompt: 'teacher-tools-v1',
        model: 'authored-fixture',
        curriculum: 'teacher-curriculum-v1',
      },
      review: { status: 'local', reasons: [] },
    });
  }
  return request;
}
export function episodeRequest(episode: TeacherEpisode, identity: string): TeacherRequest {
  return teacherRequest(
    {
      id: episode.id,
      contextId: episode.contextId,
      suite: 'fixed-history',
      context: episode.context,
      evidence: episode.trajectory === 'error-and-recovery' ? 'incorrect' : 'unseen',
      request: episode.opening,
      history: [],
      goal: episode.completion,
      rubric: [],
      forbiddenClaims: [],
    },
    identity,
  );
}
export function continueEpisode(
  request: TeacherRequest,
  output: TeacherTurn | null,
  followup: string,
  turn: number,
): TeacherRequest {
  const history = [...request.context.history, { role: 'user' as const, text: request.request }];
  if (output) history.push({ role: 'assistant', text: output.message.slice(0, 2000) });
  const question = output?.actions.find((a) => a.type === 'question');
  const evidence = [...request.context.evidence];
  if (question && /do not know|hint|explain|help/i.test(followup))
    evidence.push({
      id: `episode-help-${turn}`,
      kind: question.recipe.kind,
      outcome: 'revealed',
      assisted: true,
      response: 'script requested explanation',
      mode: 'recall',
      elapsedDays: 0,
    });
  return teacherRequestSchema.parse({
    ...request,
    requestId: stableUuid(`${request.lessonId}:${turn}:request`),
    turnId: stableUuid(`${request.lessonId}:${turn}:turn`),
    contextVersion: `${request.contextVersion.split(':turn-')[0]}:turn-${turn}`,
    request: followup,
    context: {
      ...request.context,
      exposures: [
        ...new Set([
          ...request.context.exposures,
          ...(output ? exposureKeysForTeacherTurn(request, output) : []),
        ]),
      ],
      history: history.slice(-8),
      evidence: evidence.slice(-12),
      activeQuestion: question
        ? { id: `episode-question-${turn}`, kind: question.recipe.kind, assisted: true }
        : null,
    },
  });
}
