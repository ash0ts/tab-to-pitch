import { describe, expect, it } from 'vitest';
import {
  fixedCases,
  developmentCases,
  boundaryCases,
  episodes,
  scriptedFollowup,
} from './cases.js';
import { teacherRequest, continueEpisode } from './adapter.js';
import {
  claimFixtures,
  dialogueFixtures,
  judgeQualification,
  validateJudgment,
  scoreDialogueFixture,
  type JudgeResult,
} from './judge.js';
import { createBudgetLedger, reserve, settle, accountedDollars, validUsage } from './budget.js';
import { parseChordSymbol } from '../../src/engine/harmony.js';
import { localTeacher, exposureKeysForTeacherTurn } from '../../src/engine/teacher.js';
import { mapBounded } from './concurrency.js';

describe('teacher research fixtures', () => {
  it('keeps contexts, checkpoints, episodes, trials and calibration partitions distinct', () => {
    expect(developmentCases).toHaveLength(36);
    expect(fixedCases).toHaveLength(96);
    expect(new Set(fixedCases.map((c) => c.contextId)).size).toBe(24);
    expect(boundaryCases).toHaveLength(24);
    expect(episodes).toHaveLength(24);
    expect(
      new Set([...fixedCases, ...developmentCases, ...boundaryCases].map((c) => c.id)).size,
    ).toBe(156);
    expect(
      developmentCases.every((d) => fixedCases.every((t) => t.contextId !== d.contextId)),
    ).toBe(true);
    expect(claimFixtures).toHaveLength(120);
    expect(dialogueFixtures).toHaveLength(24);
    const developmentFacts = new Set(
      claimFixtures.filter((c) => c.split === 'development').map((c) => c.facts[0]!.text),
    );
    expect(
      claimFixtures
        .filter((c) => c.split === 'holdout')
        .every((c) => !developmentFacts.has(c.facts[0]!.text)),
    ).toBe(true);
  });
  it('uses valid independently spelled chords and production request contracts', () => {
    for (const task of [...fixedCases, ...developmentCases, ...boundaryCases]) {
      expect(() => teacherRequest(task, task.id), task.id).not.toThrow();
      expect(
        task.context.chords.every((c) => parseChordSymbol(c) !== null),
        task.id,
      ).toBe(true);
    }
  });
  it('withholds prior history without altering the request, selected music or goal', () => {
    const task = fixedCases.find((c) => c.evidence === 'unassisted')!;
    const regular = teacherRequest(task, 'same'),
      ablated = teacherRequest(task, 'same', { withholdHistory: true });
    expect(ablated.request).toBe(regular.request);
    expect(ablated.context.music).toEqual(regular.context.music);
    expect(ablated.context.evidence).toEqual([]);
    expect(ablated.context.history).toEqual([]);
    expect(regular.context.evidence).toHaveLength(2);
  });
  it('continues episodes without creating correct answers or claiming performance', () => {
    const request = teacherRequest(fixedCases[0]!, 'episode');
    const next = continueEpisode(request, null, 'Explain the difference.', 1);
    expect(next.context.evidence).toEqual([]);
    expect(next.lessonId).toBe(request.lessonId);
    expect(next.contextVersion).not.toBe(request.contextVersion);
    expect(
      scriptedFollowup(episodes[1]!, 0, { offeredQuestion: true, offeredVariation: false }),
    ).toContain('assisted');
  });
  it('does not qualify an incomplete or unavailable judge', () => {
    expect(
      judgeQualification(claimFixtures.slice(0, 2).map((fixture) => ({ fixture, result: null })))
        .qualified,
    ).toBe(false);
    expect(
      judgeQualification(claimFixtures.map((fixture) => ({ fixture, result: null }))).qualified,
    ).toBe(false);
    expect(
      judgeQualification(claimFixtures.map((fixture) => ({ fixture, result: null }))).completed,
    ).toBe(0);
    expect(
      judgeQualification(claimFixtures.map((fixture) => ({ fixture, result: null }))).accuracy,
    ).toBeNull();
  });
  it('rejects invented review references and scores dialogue relevance separately from factuality', () => {
    const result: JudgeResult = {
      claims: [
        {
          quote: 'E is the third.',
          verdict: 'supported',
          evidenceIds: ['c'],
          reason: 'Confirmed chord.',
          critical: false,
        },
      ],
      responsiveness: 'acceptable',
      continuity: 'acceptable',
      evidenceUse: 'acceptable',
      clarity: 'acceptable',
      nextAction: 'acceptable',
      answerLeakage: false,
      unsupportedPerformanceClaim: false,
      overall: 'acceptable',
      reason: 'The explanation matches the question.',
    };
    const payload = { response: 'E is the third.', facts: [{ id: 'c' }] };
    expect(validateJudgment(result, payload)).toEqual(result);
    expect(() => validateJudgment(result, { ...payload, facts: [] })).toThrow('evidence reference');
    expect(() => validateJudgment(result, { ...payload, response: 'Different prose.' })).toThrow(
      'claim quote',
    );
    expect(
      scoreDialogueFixture(
        dialogueFixtures.find((f) => f.expectedProblem === 'irrelevant')!,
        result,
      ).correct,
    ).toBe(false);
  });
  it('retains canonical exposure across scripted turns instead of creating a fresh holdout', () => {
    const request = teacherRequest(fixedCases.find((c) => c.evidence === 'assisted')!, 'exposure');
    expect(request.context.exposures.length).toBeGreaterThan(0);
    const output = localTeacher(request);
    const next = continueEpisode(request, output, 'Show me another example.', 1);
    for (const key of [
      ...request.context.exposures,
      ...exposureKeysForTeacherTurn(request, output),
    ])
      expect(next.context.exposures).toContain(key);
  });
});
it('drains inflight work and stops starting cases after a bounded worker fails', async () => {
  const started: number[] = [],
    finished: number[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const work = mapBounded([0, 1, 2, 3], 2, async (value) => {
    started.push(value);
    if (value === 0) throw new Error('budget exhausted');
    await pending;
    finished.push(value);
  });
  await Promise.resolve();
  release();
  await expect(work).rejects.toThrow('budget exhausted');
  expect(started).toEqual([0, 1]);
  expect(finished).toEqual([1]);
});
describe('teacher inference accounting', () => {
  const prior = { sources: [], calls: 0, dollars: 24.999, unknownUsage: 0 };
  const input = {
    identity: 'one',
    kind: 'actor' as const,
    model: 'openai/gpt-oss-20b' as const,
    body: '{}',
    maxOutputTokens: 4096,
    maxInputBytes: 32768,
  };
  it('reserves before a call and keeps unknown usage charged', () => {
    const ledger = createBudgetLedger(prior),
      receipt = reserve(ledger, input);
    expect(accountedDollars(ledger.requests)).toBe(receipt.reservedDollars);
    settle(receipt, {}, 500);
    expect(accountedDollars(ledger.requests)).toBe(receipt.reservedDollars);
    expect(() => reserve(ledger, { ...input, identity: 'two' })).toThrow('allowance');
  });
  it('replaces a reservation only with valid split usage and retains charged errors', () => {
    const ledger = createBudgetLedger({ ...prior, dollars: 0 }),
      receipt = reserve(ledger, input);
    settle(
      receipt,
      { usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } },
      400,
    );
    expect(receipt.costDollars).toBeCloseTo((100 * 0.03 + 200 * 0.13) / 1e6);
    expect(validUsage({ prompt_tokens: 1, completion_tokens: 2, total_tokens: 2 })).toBeUndefined();
    expect(() => reserve(ledger, { ...input, body: 'x'.repeat(32769) })).toThrow('input bound');
  });
});
