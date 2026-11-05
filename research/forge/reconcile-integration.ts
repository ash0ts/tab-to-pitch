import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import {
  reconcileHistoricalSpending,
  atomicJson,
  type HistoricalLedger,
  digest,
} from '../teacher-agent/budget.js';
import { SharedInferenceBudget } from './shared-budget.js';
const [destination, legacy, ...roots] = process.argv.slice(2);
if (!destination || !legacy || !roots.length)
  throw new Error(
    'Usage: reconcile-integration.ts destination legacy-live-coach.json root [root ...]',
  );
const prior: HistoricalLedger = { sources: [], calls: 0, dollars: 0, unknownUsage: 0 };
const seen = new Set<string>();
for (const [index, root] of roots.entries()) {
  const ledger = await reconcileHistoricalSpending(resolve(root), resolve(legacy));
  for (const source of ledger.sources) {
    if (index && source.path.startsWith('legacy-')) continue;
    if (!source.path.startsWith('legacy-')) {
      const c = JSON.parse(await readFile(join(root, source.path), 'utf8'));
      for (const r of c.requests) {
        const key = r.responseId ?? `${source.sha256}:${r.sequence}`;
        if (seen.has(key))
          throw new Error(
            `Duplicate request in ${basename(root)}/${source.path}; reconcile before initializing`,
          );
        seen.add(key);
      }
    }
    prior.sources.push({
      ...source,
      path: source.path.startsWith('legacy-') ? source.path : `source-${index}/${source.path}`,
    });
  }
}
for (const s of prior.sources) {
  prior.calls += s.calls;
  prior.dollars += s.dollars;
  prior.unknownUsage += s.unknownUsage;
}
await mkdir(resolve(destination), { recursive: true });
await atomicJson(join(destination, 'historical.json'), prior);
const path = resolve(destination, 'shared-inference.sqlite');
const budget = new SharedInferenceBudget(path);
budget.initialize(prior);
const readback = budget.read();
budget.close();
await atomicJson(join(destination, 'readback.json'), {
  historicalHash: digest(JSON.stringify(prior, null, 2) + '\n'),
  authorization: readback.authorization,
  reservations: readback.reservations,
});
console.log(
  JSON.stringify({
    sources: prior.sources.length,
    calls: prior.calls,
    dollars: prior.dollars,
    unknownUsage: prior.unknownUsage,
    newReservations: readback.reservations.length,
  }),
);
