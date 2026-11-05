import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export const PRICES = {
  'openai/gpt-oss-20b': { input: 0.03, output: 0.13 },
  'openai/gpt-oss-120b': { input: 0.03, output: 0.17 },
} as const;
export type Model = keyof typeof PRICES;
export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
export function validUsage(value: unknown): Usage | undefined {
  const v = value as Partial<Usage> | null;
  return v &&
    [v.prompt_tokens, v.completion_tokens, v.total_tokens].every(
      (n) => Number.isSafeInteger(n) && n! >= 0,
    ) &&
    v.prompt_tokens! + v.completion_tokens! === v.total_tokens
    ? (v as Usage)
    : undefined;
}
export const digest = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
export const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
export async function atomicJson(path: string, value: unknown) {
  await writeFile(path + '.tmp', json(value), { mode: 0o600 });
  await rename(path + '.tmp', path);
}
function nonnegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`Missing or invalid ${label}`);
  return value;
}
export interface HistoricalLedger {
  sources: {
    path: string;
    sha256: string;
    calls: number;
    dollars: number;
    unknownUsage: number;
    method: string;
  }[];
  calls: number;
  dollars: number;
  unknownUsage: number;
}
/** Root campaign files are authoritative; nested suite copies and publication snapshots are excluded. */
export async function reconcileHistoricalSpending(
  dataRoot: string,
  legacyDemo: string,
): Promise<HistoricalLedger> {
  const sources: HistoricalLedger['sources'] = [];
  const seenResponseIds = new Set<string>();
  for (const entry of (await readdir(dataRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    let raw: string;
    try {
      raw = await readFile(join(dataRoot, entry.name, 'campaign.json'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const campaign = JSON.parse(raw) as { requests?: Record<string, unknown>[] };
    if (!Array.isArray(campaign.requests))
      throw new Error(`Unrecognized historical campaign ${entry.name}`);
    let dollars = 0,
      unknownUsage = 0;
    for (const receipt of campaign.requests) {
      const responseId = receipt.responseId;
      if (typeof responseId === 'string' && seenResponseIds.has(responseId))
        throw new Error('Duplicate historical response identity; reconcile before spending');
      if (typeof responseId === 'string') seenResponseIds.add(responseId);
      const usage = validUsage(receipt.usage);
      if (!usage) unknownUsage++;
      const arm = String(receipt.arm ?? receipt.model ?? 'openai/gpt-oss-20b');
      const prices = PRICES[arm as Model];
      if (!prices) throw new Error(`Unknown historical model ${arm}`);
      if (receipt.costDollars !== undefined)
        dollars += nonnegative(receipt.costDollars, 'historical cost');
      else if (usage)
        dollars +=
          (usage.prompt_tokens * prices.input + usage.completion_tokens * prices.output) / 1e6;
      else if (receipt.reservedDollars !== undefined)
        dollars += nonnegative(receipt.reservedDollars, 'historical reservation');
      else
        dollars +=
          (nonnegative(receipt.reservedTokens, 'historical token reservation') *
            Math.max(prices.input, prices.output)) /
          1e6;
    }
    sources.push({
      path: `${entry.name}/campaign.json`,
      sha256: digest(raw),
      calls: campaign.requests.length,
      dollars,
      unknownUsage,
      method:
        'actual dollars, then valid split usage, then full reservation; no inherited priorCosts double-counting',
    });
  }
  const legacyRaw = await readFile(legacyDemo, 'utf8');
  const legacy = JSON.parse(legacyRaw) as {
    completionRequests: number;
    rows: { execution: { completionRequests: number; chargedTokens: number } }[];
  };
  const calls = legacy.rows.reduce(
    (n, r) => n + nonnegative(r.execution.completionRequests, 'legacy calls'),
    0,
  );
  if (calls !== legacy.completionRequests) throw new Error('Legacy request totals differ');
  const tokens = legacy.rows.reduce(
    (n, r) => n + nonnegative(r.execution.chargedTokens, 'legacy charged tokens'),
    0,
  );
  sources.push({
    path: 'legacy-synthetic/live-coach.json',
    sha256: digest(legacyRaw),
    calls,
    dollars: (tokens * Math.max(...Object.values(PRICES).map((p) => p.output))) / 1e6,
    unknownUsage: calls,
    method:
      'legacy charged total tokens reserved entirely at highest published output price; input/output split absent',
  });
  return {
    sources,
    calls: sources.reduce((n, s) => n + s.calls, 0),
    dollars: sources.reduce((n, s) => n + s.dollars, 0),
    unknownUsage: sources.reduce((n, s) => n + s.unknownUsage, 0),
  };
}
export interface CallReceipt {
  sequence: number;
  identity: string;
  kind: 'actor' | 'runtime-critic' | 'judge' | 'qualification' | 'judge-calibration';
  model: Model;
  startedAt: string;
  requestHash: string;
  reservedInputTokens: number;
  reservedOutputTokens: number;
  reservedDollars: number;
  status: 'started' | 'responded' | 'failed';
  httpStatus?: number;
  responseId?: string;
  returnedModel?: string;
  usage?: Usage;
  costDollars?: number;
  elapsedMs?: number;
  failure?: string;
}
export interface BudgetLedger {
  schemaVersion: 1;
  cumulativeCeilingDollars: 25;
  campaignCeilingDollars: number;
  prior: HistoricalLedger;
  requests: CallReceipt[];
}
export function accountedDollars(receipts: CallReceipt[]) {
  return receipts.reduce((n, r) => n + (r.costDollars ?? r.reservedDollars), 0);
}
export function createBudgetLedger(prior: HistoricalLedger): BudgetLedger {
  if (prior.dollars >= 25) throw new Error('Cumulative inference allowance exhausted');
  return {
    schemaVersion: 1,
    cumulativeCeilingDollars: 25,
    campaignCeilingDollars: Math.min(15, 25 - prior.dollars),
    prior,
    requests: [],
  };
}
export function reserve(
  ledger: BudgetLedger,
  input: {
    identity: string;
    kind: CallReceipt['kind'];
    model: Model;
    body: string;
    maxOutputTokens: number;
    maxInputBytes: number;
  },
): CallReceipt {
  const bytes = Buffer.byteLength(input.body);
  if (bytes > input.maxInputBytes) throw new Error('Request exceeds the frozen input bound');
  if (
    !Number.isSafeInteger(input.maxOutputTokens) ||
    input.maxOutputTokens <= 0 ||
    input.maxOutputTokens > 4096
  )
    throw new Error('Invalid completion cap');
  const prices = PRICES[input.model],
    reservedInputTokens = bytes + 128;
  const reservedDollars =
    (reservedInputTokens * prices.input + input.maxOutputTokens * prices.output) / 1e6;
  const used = accountedDollars(ledger.requests);
  if (
    used + reservedDollars > ledger.campaignCeilingDollars ||
    ledger.prior.dollars + used + reservedDollars > 25
  )
    throw new Error('Inference allowance exhausted before request');
  const receipt: CallReceipt = {
    sequence: ledger.requests.length + 1,
    identity: input.identity,
    kind: input.kind,
    model: input.model,
    startedAt: new Date().toISOString(),
    requestHash: digest(input.body),
    reservedInputTokens,
    reservedOutputTokens: input.maxOutputTokens,
    reservedDollars,
    status: 'started',
  };
  ledger.requests.push(receipt);
  return receipt;
}
export function settle(
  receipt: CallReceipt,
  output: { usage?: unknown; model?: string; id?: string },
  status: number,
) {
  receipt.status = 'responded';
  receipt.httpStatus = status;
  receipt.returnedModel = output.model;
  receipt.responseId = output.id;
  receipt.usage = validUsage(output.usage);
  if (receipt.usage)
    receipt.costDollars =
      (receipt.usage.prompt_tokens * PRICES[receipt.model].input +
        receipt.usage.completion_tokens * PRICES[receipt.model].output) /
      1e6;
}
