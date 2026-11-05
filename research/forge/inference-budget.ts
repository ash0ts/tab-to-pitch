import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SharedInferenceBudget } from './shared-budget.js';
import { digest, json, PRICES, type Model } from '../teacher-agent/budget.js';

/** Fail closed before a paid request; publication and model discovery remain read-only. */
export function budgetedInference(fetcher: typeof fetch, campaign: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (!new URL(request.url).pathname.endsWith('/chat/completions')) return fetcher(request);
    const path = process.env.TTP_SHARED_INFERENCE_LEDGER;
    const receiptPath = process.env.TTP_BUDGET_PARTICIPANTS_RECEIPT;
    if (!path || !isAbsolute(path) || !receiptPath)
      throw new Error('Shared inference accounting is required before paid calls.');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (receipt.ledger !== resolve(path) || receipt.allCampaignsMigrated !== true)
      throw new Error('Every active campaign must adopt the same ledger.');
    const pricing = receipt.pricing;
    if (
      !pricing ||
      JSON.stringify(pricing.prices) !== JSON.stringify(PRICES) ||
      !Number.isFinite(Date.parse(pricing.verifiedAt)) ||
      Date.now() - Date.parse(pricing.verifiedAt) > 7 * 86400000 ||
      Date.parse(pricing.verifiedAt) > Date.now()
    )
      throw new Error('Reverify the published inference prices before execution.');
    const body = await request.clone().text(),
      decoded = JSON.parse(body);
    const budget = new SharedInferenceBudget(path);
    try {
      const auth = budget.read().authorization as { provenance?: string } | undefined;
      if (!auth?.provenance || receipt.historicalHash !== digest(json(JSON.parse(auth.provenance))))
        throw new Error('The shared ledger does not match the reconciled history.');
      const id = `${campaign}:${randomUUID()}`;
      budget.reserve(
        id,
        campaign,
        decoded.model as Model,
        Buffer.byteLength(body),
        decoded.max_tokens,
      );
      // Errors, timeouts and unknown usage retain their reservation. No automatic retries.
      const response = await fetcher(request);
      const output = await response
        .clone()
        .json()
        .catch(() => null);
      budget.settle(id, output?.usage);
      return response;
    } finally {
      budget.close();
    }
  };
}
