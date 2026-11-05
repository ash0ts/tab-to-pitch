import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SharedInferenceBudget } from './shared-budget';
import type { HistoricalLedger } from '../teacher-agent/budget';

const prior = (dollars: number): HistoricalLedger => ({
  calls: 1,
  dollars,
  unknownUsage: 0,
  sources: [
    {
      path: 'authored-receipt',
      sha256: 'test-only',
      calls: 1,
      dollars,
      unknownUsage: 0,
      method: 'fixture',
    },
  ],
});
it('shares reservations across connections and retains unknown usage without resetting history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'homework-budget-'));
  const path = join(directory, 'budget.sqlite'),
    a = new SharedInferenceBudget(path),
    b = new SharedInferenceBudget(path);
  try {
    a.initialize(prior(24.998));
    b.initialize(prior(24.998));
    const reserved = a.reserve('actor', 'homework-caged-v1', 'openai/gpt-oss-20b', 32768, 4096);
    expect(reserved).toBeGreaterThan(0.001);
    expect(() =>
      b.reserve('critic', 'another-campaign', 'openai/gpt-oss-20b', 32768, 4096),
    ).toThrow('exhausted');
    b.settle('actor', undefined);
    expect(b.read().reservations).toMatchObject([
      { id: 'actor', charged: Math.round(reserved * 1e6), settled: 1 },
    ]);
    expect(() => a.initialize(prior(0))).toThrow('never reset');
    expect(() =>
      a.settle('actor', { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }),
    ).toThrow('already settled');
  } finally {
    a.close();
    b.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
it('keeps duplicate and over-bound calls reserved until accounting is reconciled', () => {
  const directory = mkdtempSync(join(tmpdir(), 'homework-budget-'));
  const budget = new SharedInferenceBudget(join(directory, 'budget.sqlite'));
  try {
    budget.initialize(prior(0));
    budget.reserve('one', 'homework-caged-v1', 'openai/gpt-oss-20b', 1, 1);
    expect(() => budget.reserve('one', 'homework-caged-v1', 'openai/gpt-oss-20b', 1, 1)).toThrow();
    expect(() =>
      budget.settle('one', { prompt_tokens: 10000, completion_tokens: 10000, total_tokens: 20000 }),
    ).toThrow('reserved bound');
    expect(budget.read().reservations).toMatchObject([{ id: 'one', settled: 0, charged: null }]);
  } finally {
    budget.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
