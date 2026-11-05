import {
  coachResponseSchema,
  proposalForCandidate,
  type CoachResponse,
} from '../src/shared/coach.js';
import type { CoachFixture } from './fixtures.js';

export function scoreCoach(fixture: CoachFixture, output: CoachResponse) {
  const candidate = fixture.context.candidates.find(
    (value) => value.id === output.proposal.candidateId,
  );
  const expected = candidate && proposalForCandidate(fixture.context, candidate.id);
  return {
    versionedContract: coachResponseSchema.safeParse(output).success,
    eligible: !!candidate,
    settingsUnchanged:
      !!candidate &&
      output.proposal.kind === candidate.kind &&
      output.proposal.tempoBpm === candidate.tempoBpm &&
      output.proposal.loop.startTick === candidate.loop.startTick &&
      output.proposal.loop.endTick === candidate.loop.endTick &&
      JSON.stringify(output.proposal.noteIds) === JSON.stringify(candidate.noteIds),
    groundedExplanation:
      !!expected &&
      expected.explanation === output.proposal.explanation &&
      JSON.stringify(expected.evidenceRefs) === JSON.stringify(output.proposal.evidenceRefs),
    expectedPriority: output.proposal.candidateId === fixture.expectedCandidateId,
    expectedReason: output.proposal.reasonCode === fixture.expectedReason,
  };
}
