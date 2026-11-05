import { teacherRequestSchema, type TeacherRequest } from '../../src/shared/teacher.js';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../../src/shared/arrangements.js';
import { stableUuid } from '../teacher-agent/adapter.js';

export const scenarios = [
  ['identity-role', 'I named F correctly but called it the root of G7. What should I attend to?'],
  [
    'recognition-recall',
    'I recognized the chord with choices, but could not name it without them. Help me try another way.',
  ],
  [
    'repeat-error',
    'I missed the role twice. Can you give a different explanation rather than another identical quiz?',
  ],
  ['stop-quizzing', 'Stop quizzing. Just explore this phrase with me.'],
  [
    'changed-goal',
    'My goal has changed. I want to place the change in time, not name more chords.',
  ],
  ['reject-strategy', 'I do not want to keep repeating it. Can we compare two versions instead?'],
  [
    'creative-alternative',
    'My phrase differs from your example but uses supplied notes, a rest, and ends on E in bar 2. Is that valid?',
  ],
  ['style-exception', 'Does every dominant seventh have to be V? What about a blues tonic?'],
  ['playing-boundary', 'I pressed Play twice. Was my guitar timing accurate?'],
  [
    'exposed-transfer',
    'Give me a fresh reserved phrase check. I have already explored every phrase example.',
  ],
  ['help-during-assessment', 'Tell me the answer to my current rhythm question.'],
  ['reflection', 'Help me reflect on what worked, without assigning a mastery score.'],
] as const;
const developmentPrompts = [
  'Which role does C have in Am7? I answered root even though I knew the note name.',
  'With a menu I can recognize this chord. Without the menu I get stuck. What can I try?',
  'Naming the role went wrong twice. Please give another approach before another quiz.',
  'I want to explore the sounds. Do not quiz me.',
  'Change my goal to hearing when the chord enters. Help me with rhythm.',
  'Let us compare two versions. I have declined focused repetition.',
  'For the original construction study, I used different supplied notes, a rest, and a final E in bar 2. Must I copy your phrase?',
  'In a blues, can the tonic be a dominant seventh without acting as V?',
  'I used the playback button. Can that tell you whether I played in time?',
  'I have seen all the original phrase examples. Is a fresh reserved phrase still available?',
  'I am partway through the rhythm check. Give me the full solution.',
  'Can I reflect on what helped without getting an overall ability score?',
] as const;
export interface PracticeCase {
  id: string;
  contextId: string;
  split: 'development' | 'evaluation';
  scenario: string;
  request: TeacherRequest;
}
export function practiceCases(split: PracticeCase['split']): PracticeCase[] {
  return scenarios.flatMap(([scenario, prompt], index) =>
    [0, 1].map((history) => {
      const id = `${split}:${scenario}:h${history}`,
        contextId = `${split}:${index % 3}`;
      const symbols = split === 'development' ? ['Am7', 'D7'] : ['G7', 'Cmaj7'];
      const evidence = history
        ? [
            {
              id: 'answer-1',
              kind: 'chord-tone',
              outcome: 'incorrect',
              assisted: false,
              response: 'root',
              mode: 'recall',
              elapsedDays: 1,
            },
          ]
        : [];
      return {
        id,
        contextId,
        split,
        scenario,
        request: teacherRequestSchema.parse({
          schemaVersion: 'teacher-v3',
          requestId: stableUuid(`${id}:request`),
          lessonId: stableUuid(`${id}:lesson`),
          turnId: stableUuid(`${id}:turn`),
          contextVersion: `${contextId}:1`,
          request: split === 'development' ? developmentPrompts[index]! : prompt,
          context: {
            objective: 'connections',
            music: {
              tuning: index % 3 === 1 ? [64, 59, 55, 50, 45, 38] : [64, 59, 55, 50, 45, 40],
              capo: index % 3 === 2 ? 2 : 0,
              key: { tonic: split === 'development' ? 'G' : 'C', mode: 'ionian' },
              selectedSpan: 0,
              spans: symbols.map((symbol, i) => ({
                symbol,
                confirmed: true,
                startTick: i * 3840,
                endTick: (i + 1) * 3840,
                melody: [],
              })),
            },
            constraints: DEFAULT_ARRANGEMENT_CONSTRAINTS,
            bass: [],
            evidence,
            history: history
              ? [
                  {
                    role: 'user',
                    text: 'I want to notice one change and decide how to practice it.',
                  },
                  {
                    role: 'assistant',
                    text: 'We can compare, construct, or answer a question. You can change approach.',
                  },
                ]
              : [],
            exposures: [],
            activeQuestion: null,
            practice: {
              capability: 'teaching-practice-v1',
              goal: {
                wording: 'Notice the chord change',
                target: 'Identify one audible difference',
                context: contextId,
                chosenAt: 1,
              },
              strategy:
                scenario === 'reject-strategy'
                  ? {
                      approach: 'Focused repetition',
                      rationale: 'Attend to one detail',
                      accepted: false,
                      proposedAt: 1,
                    }
                  : null,
              reflection: null,
              active:
                scenario === 'help-during-assessment'
                  ? { id: 'active-rhythm', kind: 'rhythm', assisted: false, responseCount: 0 }
                  : null,
              evidence: [],
              reserved:
                scenario === 'exposed-transfer'
                  ? []
                  : [
                      'musicianship-v1:rhythm:0',
                      'musicianship-v1:phrase:0',
                      'musicianship-v1:expression:0',
                    ],
            },
          },
        }),
      };
    }),
  );
}
