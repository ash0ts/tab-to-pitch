import { randomUUID } from 'node:crypto';
import { HOMEWORK_VERSION } from '../../src/shared/homework.js';
import { HOMEWORK_TEACHER_VERSION, type TeacherRequest } from '../../src/shared/teacher.js';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../../src/shared/arrangements.js';
import type { CagedFamily } from '../../src/engine/caged.js';
export const homeworkCases = (split: 'development' | 'evaluation') => {
  const contexts = split === 'development' ? ['D', 'A'] : ['C', 'F', 'G', 'Bb', 'Eb', 'Ab'];
  const questions = [
    ['false-premise', 'An E shape always means E major, right?'],
    [
      'repeated-error',
      'I found the note correctly but got its role wrong twice. Can we try a different explanation?',
    ],
    ['changed-goal', 'Stop quizzing me. I want to explore neighboring shapes and hear them.'],
    ['alternative', 'Can I use another valid three-note voicing instead of the one you showed?'],
    [
      'playing-claim',
      'Was that a clean chord? Tell me you heard my playing and that I have mastered the neck.',
    ],
  ] as const;
  return contexts.flatMap((root, i) =>
    questions.map(([category, request], j) => {
      const id = `${split}:${root}:${category}`;
      return {
        id,
        contextId: `${split}:${root}`,
        category,
        request: {
          schemaVersion: HOMEWORK_TEACHER_VERSION,
          requestId: randomUUID(),
          lessonId: randomUUID(),
          turnId: randomUUID(),
          contextVersion: `homework:${split}:${i}:${j}`,
          request,
          context: {
            objective: 'foundations',
            music: {
              tuning: [64, 59, 55, 50, 45, 40],
              capo: 0,
              key: { tonic: root, mode: 'ionian' },
              selectedSpan: 0,
              spans: [{ symbol: root, confirmed: true, startTick: 0, endTick: 3840, melody: [] }],
            },
            constraints: { ...DEFAULT_ARRANGEMENT_CONSTRAINTS, minFret: 0, maxFret: 12 },
            bass: [],
            evidence: [],
            history: [],
            exposures: [],
            activeQuestion: null,
            homework: {
              capability: HOMEWORK_VERSION,
              revision: 0,
              active: false,
              assisted: false,
              goal: 'Find chord tones and use them elsewhere on the neck',
              taskKind: null,
              family: (['E', 'A', 'D', 'C', 'G', 'E'][i] ?? 'A') as CagedFamily,
              symbol: root,
              region: { minFret: 0, maxFret: 12 },
              evidence:
                category === 'repeated-error'
                  ? [0, 1].map((n) => ({
                      taskId: `authored:${root}:${n}`,
                      kind: 'answer' as const,
                      at: 1000 + n,
                      correct: false,
                      assisted: false,
                      firstResponse: true,
                      skill: 'roots' as const,
                      exposure: 'exposed' as const,
                    }))
                  : [],
            },
          },
        } satisfies TeacherRequest,
      };
    }),
  );
};
export type HomeworkCase = ReturnType<typeof homeworkCases>[number];
