import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Derive publication metadata without changing frozen cases, outputs or scores.
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, '../tabtopitch-real-data/arrangement-agent-v2');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const json = (v) => JSON.stringify(v, null, 2) + '\n';
const load = async (name) => JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const campaign = await load('campaign.json');
if (campaign.status !== 'complete') throw new Error('Wait for the complete campaign');
const changes = [];
async function replace(path, value, reason) {
  const destination = resolve(directory, path);
  const before = await readFile(destination);
  const after = Buffer.from(json(value));
  if (before.equals(after)) return;
  await writeFile(destination + '.before-metadata-reconciliation', before, { flag: 'wx' });
  await writeFile(destination, after);
  changes.push({ path, reason, beforeSha256: sha(before), afterSha256: sha(after) });
}
const summary = await load('summary.json');
summary.contexts = new Set(campaign.rows.filter(r => r.phase === 'test').map(r => r.contextId)).size;
summary.uniqueRequests = new Set(campaign.rows.filter(r => r.phase === 'test').map(r => r.taskId)).size;
await replace('summary.json', summary, 'Combined campaign has 128 requests in 32 musical contexts; frozen runner inherited v1 display counts. No score changed.');
for (const suite of ['regression', 'confirmation']) {
  const subset = await load(suite + '/campaign.json');
  const ids = new Set(subset.rows.map(r => r.taskId));
  subset.requests = campaign.requests.filter(r => r.phase === 'test' && ids.has(r.taskId));
  await replace(suite + '/campaign.json', subset, 'Scope derivative request ledger to this suite; original combined campaign retains qualification and all requests.');
  const derived = await load(suite + '/summary.json');
  derived.calls = subset.requests.length;
  derived.tokens = subset.requests.reduce((n, r) => n + (r.usage?.total_tokens ?? r.reservedTokens), 0);
  derived.dollars = subset.requests.reduce((n, r) => n + (r.costDollars ?? r.reservedDollars), 0);
  derived.knownTokens = subset.requests.reduce((n, r) => n + (r.usage?.total_tokens ?? 0), 0);
  derived.unknownUsage = subset.requests.filter(r => !r.usage).length;
  derived.costScope = suite + ' requests only; qualification and prior campaigns are reported in the combined campaign';
  await replace(suite + '/summary.json', derived, 'Scope derived cost metadata without changing row membership or criterion scores.');
}
await writeFile(resolve(directory, 'metadata-reconciliation.json'), json({
  performedAt: new Date().toISOString(), sourceCampaignSha256: sha(await readFile(resolve(directory, 'campaign.json'))),
  scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))), changes,
}), { flag: 'wx' });
console.info(json({ reconciled: true, changes }));
