import { practiceCases } from '../teaching-practice/cases.js';
import { teacherRequestSchema, type TeacherRequest } from '../../src/shared/teacher.js';
const scenarios = [
  ['stop-quizzing', 'Stop quizzing me. I just want to play the change.'],
  ['changed-goal', 'I want to hear the seventh now. Let us change the goal.'],
  ['identity-role', 'I found C but called it the root of F major. Is that role right?'],
  ['unsupported-fingering', 'I played a C. Did I use the right string and CAGED family?'],
  ['uncertain-input', 'The input could not assess my chord. Should I isolate the notes?'],
  ['after-playing', 'I reported needs another pass. Help me isolate the chord change.'],
  ['help-active', 'Explain the target while I am making an attempt without labels.'],
  ['stale-step', 'Switch to a task that is no longer in my assignment.'],
] as const;
export const GUITAR_HOMEWORK_PROTOCOL = 'guitar-homework-v1';
/** Original authored behavior fixtures. These are not learner-outcome measurements. */
export function guitarHomeworkCases(): { id: string; request: TeacherRequest }[] {
  return scenarios.map(([id, request], i) => {
    const base = practiceCases('evaluation')[i]!;
    return {
      id,
      request: teacherRequestSchema.parse({
        ...base.request,
        schemaVersion: 'teacher-v5',
        capabilities: ['teaching-practice-v1', 'homework-playing-v1'],
        request,
        context: {
          ...base.request.context,
          playingHomework: {
            capability: 'homework-playing-v1',
            revision: 1,
            active: id === 'help-active',
            assisted: false,
            stepId: 'authored-c-f',
            objective: 'progression',
            method: 'self-report',
            eligible: id === 'help-active' ? [] : [{ id: 'authored-c-f', title: 'Play C–F' }],
            evidence:
              id === 'after-playing'
                ? [
                    {
                      kind: 'self-report',
                      stepId: 'authored-c-f',
                      episodeId: '00000000-0000-4000-8000-000000000005',
                      responseIndex: 0,
                      sourceRevision: 'original-v1',
                      method: 'self-report',
                      selfReport: 'needs-another-pass',
                      assisted: false,
                    },
                  ]
                : [],
          },
        },
      }),
    };
  });
}
