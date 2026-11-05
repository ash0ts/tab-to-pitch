import type { CoachContext, ReasonCode } from '../src/shared/coach.js';

/** Authored regression fixtures. These are not observations from real learners. */
export const fixtureContext: CoachContext = {
  schemaVersion: 1,
  phrase: {
    id: 'synthetic-phrase',
    noteCount: 8,
    distinctPitchClasses: 4,
    stringCrossings: 2,
    positionChanges: 1,
  },
  evidence: [],
  candidates: [
    {
      id: 'note-drill',
      kind: 'note-name',
      skillId: 'note-name',
      noteIds: ['n1', 'n2'],
      tempoBpm: 80,
      loop: { startTick: 0, endTick: 3840 },
    },
    {
      id: 'interval-drill',
      kind: 'interval',
      skillId: 'interval',
      noteIds: ['n3', 'n4'],
      tempoBpm: 80,
      loop: { startTick: 0, endTick: 3840 },
    },
  ],
};
export interface CoachFixture {
  id: string;
  context: CoachContext;
  expectedCandidateId: string;
  expectedReason: ReasonCode;
}
export const coachFixtures: CoachFixture[] = [
  {
    id: 'unseen-skills',
    context: structuredClone(fixtureContext),
    expectedCandidateId: 'note-drill',
    expectedReason: 'start-recall',
  },
  {
    id: 'review-incorrect-interval',
    context: {
      ...structuredClone(fixtureContext),
      evidence: [
        { id: 'notes-evidence', skillId: 'note-name', attempts: 4, correct: 4, assisted: 0 },
        { id: 'interval-evidence', skillId: 'interval', attempts: 4, correct: 1, assisted: 1 },
      ],
    },
    expectedCandidateId: 'interval-drill',
    expectedReason: 'review-errors',
  },
  {
    id: 'remove-hints',
    context: {
      ...structuredClone(fixtureContext),
      evidence: [
        { id: 'notes-evidence', skillId: 'note-name', attempts: 2, correct: 0, assisted: 2 },
        { id: 'interval-evidence', skillId: 'interval', attempts: 4, correct: 4, assisted: 0 },
      ],
    },
    expectedCandidateId: 'note-drill',
    expectedReason: 'reduce-hints',
  },
  {
    id: 'correct-does-not-imply-mastery',
    context: {
      ...structuredClone(fixtureContext),
      candidates: [fixtureContext.candidates[0]!],
      evidence: [
        { id: 'notes-evidence', skillId: 'note-name', attempts: 6, correct: 6, assisted: 0 },
      ],
    },
    expectedCandidateId: 'note-drill',
    expectedReason: 'extend-recall',
  },
];
