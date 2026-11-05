import { it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { budgetedInference } from './inference-budget';
import { SharedInferenceBudget } from './shared-budget';
import { PRICES, digest, json } from '../teacher-agent/budget';
const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true });
});
const url = 'https://api.inference.wandb.ai/v1/chat/completions';
const init = {
  method: 'POST',
  body: JSON.stringify({ model: 'openai/gpt-oss-20b', max_tokens: 512, messages: [] }),
};
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'ttp-budget-'));
  directories.push(dir);
  const ledger = join(dir, 'shared.sqlite'),
    receipt = join(dir, 'receipt.json');
  const prior = {
    sources: [
      {
        path: 'fixture',
        sha256: 'x',
        calls: 0,
        dollars: 0,
        unknownUsage: 0,
        method: 'authored fixture',
      },
    ],
    calls: 0,
    dollars: 0,
    unknownUsage: 0,
  };
  const budget = new SharedInferenceBudget(ledger);
  budget.initialize(prior);
  budget.close();
  writeFileSync(
    receipt,
    json({
      ledger,
      historicalHash: digest(json(prior)),
      allCampaignsMigrated: true,
      pricing: { prices: PRICES, verifiedAt: new Date().toISOString() },
    }),
  );
  vi.stubEnv('TTP_SHARED_INFERENCE_LEDGER', ledger);
  vi.stubEnv('TTP_BUDGET_PARTICIPANTS_RECEIPT', receipt);
  return ledger;
}
it('refuses a paid call before transport when shared accounting is absent', async () => {
  vi.stubEnv('TTP_SHARED_INFERENCE_LEDGER', '');
  const send = vi.fn();
  await expect(budgetedInference(send, 'test')(url, init)).rejects.toThrow('Shared inference');
  expect(send).not.toHaveBeenCalled();
});
it('reserves before transmission and records split usage once', async () => {
  const ledger = setup();
  const send = vi.fn(async () => {
    const db = new SharedInferenceBudget(ledger);
    expect(db.read().reservations).toHaveLength(1);
    db.close();
    return Response.json({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } });
  });
  await budgetedInference(send, 'test')(url, init);
  const db = new SharedInferenceBudget(ledger);
  expect(db.read().reservations[0]).toMatchObject({ settled: 1, charged: 3 });
  db.close();
});
it('retains a failed request reservation and never retries', async () => {
  const ledger = setup();
  const send = vi.fn(async () => {
    throw new Error('timeout');
  });
  await expect(budgetedInference(send, 'test')(url, init)).rejects.toThrow('timeout');
  const db = new SharedInferenceBudget(ledger);
  expect(db.read().reservations[0]).toMatchObject({ settled: 0, charged: null });
  expect(send).toHaveBeenCalledTimes(1);
  db.close();
});
it('allows model discovery without paid accounting', async () => {
  vi.stubEnv('TTP_SHARED_INFERENCE_LEDGER', '');
  const send = vi.fn(async () => Response.json({ data: [] }));
  await budgetedInference(send, 'test')('https://api.inference.wandb.ai/v1/models');
  expect(send).toHaveBeenCalledOnce();
});
