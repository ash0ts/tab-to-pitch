import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { reconcileHistoricalSpending, type HistoricalLedger } from '../teacher-agent/budget.js';

/** Include this worktree's paid campaigns without counting the legacy demo twice. */
export async function earHistoricalSpending(
  roots: string[],
  legacy: string,
): Promise<HistoricalLedger> {
  const sources: HistoricalLedger['sources'] = [],
    hashes = new Set<string>(),
    responseIds = new Set<string>();
  for (const root of roots) {
    const ledger = await reconcileHistoricalSpending(root, legacy);
    for (const source of ledger.sources) {
      if (hashes.has(source.sha256)) continue;
      hashes.add(source.sha256);
      if (source.path !== 'legacy-synthetic/live-coach.json') {
        const c = JSON.parse(await readFile(join(root, source.path), 'utf8')) as {
          requests: { responseId?: string }[];
        };
        for (const r of c.requests)
          if (r.responseId) {
            if (responseIds.has(r.responseId))
              throw new Error('Duplicate response across campaign roots');
            responseIds.add(r.responseId);
          }
      }
      sources.push({
        ...source,
        path: source.path === 'legacy-synthetic/live-coach.json' ? legacy : join(root, source.path),
      });
    }
  }
  return {
    sources,
    calls: sources.reduce((n, s) => n + s.calls, 0),
    dollars: sources.reduce((n, s) => n + s.dollars, 0),
    unknownUsage: sources.reduce((n, s) => n + s.unknownUsage, 0),
  };
}
