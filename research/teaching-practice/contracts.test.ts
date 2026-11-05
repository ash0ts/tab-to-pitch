import { it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SharedInferenceBudget } from '../forge/shared-budget';
import { practiceCases } from './cases';
import { canEvaluateHeldOut, scorePractice } from './contract';
import { localTeacher } from '../../src/engine/teacher';

it('uses one atomic authorization across two independent ledger connections and retains unknown usage', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ttp-budget-')), 'shared.sqlite');
  const prior = {
    sources: [
      {
        path: 'reconciled.json',
        sha256: 'fixture',
        calls: 1,
        dollars: 24.999,
        unknownUsage: 0,
        method: 'test fixture',
      },
    ],
    calls: 1,
    dollars: 24.999,
    unknownUsage: 0,
  };
  const a = new SharedInferenceBudget(path),
    b = new SharedInferenceBudget(path);
  try {
    a.initialize(prior);
    b.initialize(prior);
    a.reserve('actor', 'listening', 'openai/gpt-oss-20b', 100, 4096);
    expect(() => b.reserve('critic', 'practice', 'openai/gpt-oss-20b', 100, 4096)).toThrow(
      'authorization exhausted',
    );
    a.settle('actor', undefined);
    expect(() => b.reserve('critic', 'practice', 'openai/gpt-oss-20b', 100, 4096)).toThrow();
    expect(() => b.initialize({ ...prior, dollars: 0 })).toThrow();
    expect(() => a.reserve('actor', 'other', 'openai/gpt-oss-20b', 1, 1)).toThrow();
  } finally {
    a.close();
    b.close();
  }
});
it('separates development/evaluation contexts and retains unmeasured conversational dimensions', () => {
  const dev = practiceCases('development'),
    held = practiceCases('evaluation');
  expect(dev).toHaveLength(24);
  expect(held).toHaveLength(24);
  expect(dev.some((d) => held.some((h) => h.contextId === d.contextId))).toBe(false);
  for (const c of held) {
    const before = JSON.stringify(c.request),
      turn = localTeacher(c.request),
      score = scorePractice(c.request, turn, before === JSON.stringify(c.request));
    expect(score.executableActionsValid).toBe(true);
    expect(score.reservedMembership).toBe(true);
    expect(score.learnerChoice).toBeNull();
    expect(score.providerSuccess).toBe(false);
    expect(
      scorePractice(c.request, { ...turn, contextVersion: 'stale' }, true).contextMatches,
    ).toBe(false);
  }
});

it('halts every participating campaign when metered usage exceeds its reservation', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ttp-budget-halt-')), 'shared.sqlite');
  const a = new SharedInferenceBudget(path),
    b = new SharedInferenceBudget(path);
  const prior = {
    sources: [
      { path: 'history', sha256: 'hash', calls: 1, dollars: 1, unknownUsage: 0, method: 'fixture' },
    ],
    calls: 1,
    dollars: 1,
    unknownUsage: 0,
  };
  try {
    a.initialize(prior);
    a.reserve('a', 'practice', 'openai/gpt-oss-20b', 1, 1);
    expect(() =>
      a.settle('a', { prompt_tokens: 10000, completion_tokens: 10000, total_tokens: 20000 }),
    ).toThrow('exceeded');
    expect(() => b.reserve('b', 'listening', 'openai/gpt-oss-20b', 1, 1)).toThrow('halted');
  } finally {
    a.close();
    b.close();
  }
});

it('does not trade a critical accepted violation for a high average score', () => {
  const c = practiceCases('development')[0]!;
  const base = {
    scenario: 'identity-role',
    scores: { ...scorePractice(c.request, localTeacher(c.request), true), providerSuccess: true },
    judge: {
      overall: 'acceptable',
      answerLeakage: false,
      unsupportedPerformanceClaim: false,
      claims: [] as { critical: boolean; verdict: string }[],
    },
  };
  const rows = Array.from({ length: 24 }, () => structuredClone(base));
  expect(canEvaluateHeldOut(rows)).toBe(true);
  rows[0]!.judge.claims = [{ critical: true, verdict: 'contradicted' }];
  expect(canEvaluateHeldOut(rows)).toBe(false);
});
