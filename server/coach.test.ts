import { describe, expect, it } from 'vitest';
import {
  coachContextSchema,
  forgeCoachVersions,
  LOCAL_COACH_VERSIONS,
  localCoach,
  proposalForCandidate,
  validateCoachResponse,
} from '../src/shared/coach.js';
import { coachFixtures, fixtureContext } from '../evals/fixtures.js';
import { scoreCoach } from '../evals/scorers.js';
import { modelContext } from './forge-agent.js';
import { InMemoryTestRepository } from './test-repository.js';

describe('grounded coach behavior', () => {
  for (const fixture of coachFixtures)
    it(fixture.id, () => {
      const scores = scoreCoach(fixture, localCoach(fixture.context));
      expect(Object.values(scores).every(Boolean)).toBe(true);
    });
  it('fails regression scoring when a proposal changes the candidate drill kind', () => {
    const fixture = coachFixtures[0]!;
    const output = localCoach(fixture.context);
    output.proposal.kind = 'interval';
    expect(scoreCoach(fixture, output).settingsUnchanged).toBe(false);
  });
  it('cannot propose a note outside the offered candidate and rejects invalid evidence', () => {
    expect(() => proposalForCandidate(fixtureContext, 'invented')).toThrow();
    expect(
      coachContextSchema.safeParse({
        ...fixtureContext,
        evidence: [{ id: 'e', skillId: 'note-name', attempts: 1, correct: 1, assisted: 1 }],
      }).success,
    ).toBe(false);
    expect(
      coachContextSchema.safeParse({
        ...fixtureContext,
        candidates: [fixtureContext.candidates[0], fixtureContext.candidates[0]],
      }).success,
    ).toBe(false);
  });
  it('removes all identifiers and learner-supplied text before inference', () => {
    const context = structuredClone(fixtureContext);
    context.phrase.id = 'private-song-id';
    context.candidates[0]!.noteIds = ['private-note-id'];
    const serialized = JSON.stringify(modelContext(context));
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('note-drill');
    expect(serialized).toContain('c0');
  });
  it('rejects changed settings, invented narration, and stale-context responses at the browser boundary', () => {
    const response = localCoach(fixtureContext);
    expect(validateCoachResponse(response, fixtureContext)).toEqual(response);
    expect(() =>
      validateCoachResponse(
        {
          ...response,
          proposal: { ...response.proposal, explanation: 'You have mastered the guitar.' },
        },
        fixtureContext,
      ),
    ).toThrow();
    expect(() =>
      validateCoachResponse(
        { ...response, proposal: { ...response.proposal, tempoBpm: 200 } },
        fixtureContext,
      ),
    ).toThrow();
    expect(() =>
      validateCoachResponse(response, {
        ...fixtureContext,
        candidates: [fixtureContext.candidates[1]!],
      }),
    ).toThrow();
  });
  it('requires source-appropriate version metadata and rejects unknown version fields', () => {
    const response = localCoach(fixtureContext);
    expect(response.versions).toEqual(LOCAL_COACH_VERSIONS);
    const { versions: _versions, ...missing } = response;
    expect(() => validateCoachResponse(missing, fixtureContext)).toThrow();
    expect(() =>
      validateCoachResponse(
        { ...response, versions: forgeCoachVersions('openai/gpt-oss-20b') },
        fixtureContext,
      ),
    ).toThrow();
    expect(() =>
      validateCoachResponse(
        { ...response, versions: { ...response.versions, privateNote: 'text' } },
        fixtureContext,
      ),
    ).toThrow();
    const cloud = {
      source: 'forge' as const,
      proposal: response.proposal,
      versions: forgeCoachVersions('openai/gpt-oss-20b'),
    };
    expect(validateCoachResponse(cloud, fixtureContext)).toEqual(cloud);
    expect(() =>
      validateCoachResponse({ ...cloud, fallbackReason: 'disabled' }, fixtureContext),
    ).toThrow();
    expect(() =>
      validateCoachResponse(
        { ...cloud, versions: { ...cloud.versions, prompt: 'unknown-prompt' } },
        fixtureContext,
      ),
    ).toThrow();
  });
  it('describes recorded evidence without promising hidden labels or support the scheduler has not selected', () => {
    for (const fixture of coachFixtures) {
      const response = localCoach(fixture.context);
      expect(response.proposal.explanation).toMatch(/support/i);
      expect(response.proposal.explanation).not.toMatch(/labels hidden|without a hint|mastered/i);
    }
  });
  it('atomically reserves a global budget across invitations and settles exactly once', async () => {
    const repository = new InMemoryTestRepository();
    const now = new Date('2026-10-29');
    for (const id of ['a', 'b'])
      await repository.createInvitation({
        id,
        tokenHash: id,
        expiresAt: new Date('2030-01-01'),
        maxTokens: 1000,
      });
    const outcomes = await Promise.all(
      ['a', 'b'].map((id) => repository.reserveBudget(id, 'request', 600, 1000, now)),
    );
    expect(outcomes.filter((result) => result.ok)).toHaveLength(1);
    await repository.settleBudget('a', 'request', 100);
    await repository.settleBudget('a', 'request', 100);
    expect(repository.days.get('2026-10-29')).toEqual({ used: 100, reserved: 0 });
    expect((await repository.reserveBudget('b', 'retry', 600, 1000, now)).ok).toBe(true);
  });
});
