import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ForgeTransport } from './transport.mjs';
import { ensurePrivateProject, PROJECT } from './project.mjs';

export async function loadCapture(directory) {
  const batches = [];
  for (const name of (await readdir(directory)).filter(name => /^batch-\d+\.json$/.test(name)).sort()) {
    const receipt = JSON.parse(await readFile(join(directory, name), 'utf8'));
    if (receipt.source !== 'forge-sdk-actual-spans' || !/^batch-\d+\.otlp\.pb$/.test(receipt.filename))
      throw new Error('Expected a captured SDK batch');
    const bytes = await readFile(join(directory, receipt.filename));
    if (receipt.sha256 !== createHash('sha256').update(bytes).digest('hex') || receipt.bytes !== bytes.length)
      throw new Error('Captured span bytes do not match their receipt');
    if (!Array.isArray(receipt.spans) || receipt.spans.length !== receipt.spanCount ||
      new Set(receipt.spans.map(span => span.spanId)).size !== receipt.spanCount)
      throw new Error('Invalid captured span membership');
    batches.push({ receipt, bytes });
  }
  if (!batches.length) throw new Error('No actual captured spans to publish');
  return batches;
}

export function reconcileSpans(batches, observed, conversationIds) {
  const expected = batches.flatMap(batch => batch.receipt.spans).map(span => `${span.traceId}/${span.spanId}`).sort();
  const returned = observed.conversations ?? [];
  const actual = returned.flatMap(conversation => conversation.spans).map(span => `${span.trace_id}/${span.span_id}`).sort();
  const identitiesMatch = JSON.stringify(expected) === JSON.stringify(actual);
  const conversationsMatch = JSON.stringify(returned.map(item => item.conversation_id).sort()) === JSON.stringify([...conversationIds].sort()) &&
    returned.every(item => item.spans.length > 0);
  return { verified: identitiesMatch && conversationsMatch, identitiesMatch, conversationsMatch, expectedSpans: expected.length, observedSpans: actual.length };
}

export async function publishLens({ directory, coachDirectory, verifyOnly = false, deadlineMs = 15000 }) {
  const batches = await loadCapture(join(coachDirectory, 'lens-capture'));
  const campaign = JSON.parse(await readFile(join(coachDirectory, 'campaign.json'), 'utf8'));
  if (campaign.project !== PROJECT) throw new Error('Unexpected campaign project');
  const conversationIds = [...new Set(campaign.rows.flatMap(row => row.traceId ? [row.traceId] : []))];
  if (!conversationIds.length) throw new Error('Campaign has no captured conversations');
  const transport = new ForgeTransport({ directory: join(directory, 'requests'), mode: process.env.FORGE_TRANSPORT ?? 'native', deadlineMs });
  try {
    for (let attempt = 1; ; attempt++) {
      try { await ensurePrivateProject(transport, { createIfMissing: false }); break; }
      catch (error) {
        if (attempt >= 5 || error.receipt?.status !== 'read-failed' || error.receipt.httpStatus) throw error;
        console.info(JSON.stringify({ connectionAttempt: attempt, status: 'unavailable-before-http' }));
      }
    }
    if (!verifyOnly) for (const batch of batches) {
      const path = join(directory, `lens-${batch.receipt.sha256}.json`);
      try {
        const previous = JSON.parse(await readFile(path, 'utf8'));
        if (previous.status === 'acknowledged') continue;
        throw new Error('Prior trace upload is unresolved; use --verify before any manual recovery');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const receipt = { schemaVersion: 1, project: PROJECT, payloadSha256: batch.receipt.sha256,
        spanCount: batch.receipt.spanCount, status: 'pending', startedAt: new Date().toISOString() };
      await mkdir(directory, { recursive: true });
      await writeFile(path, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
      try {
        const result = await transport.post('trace', '/agents/otel/v1/traces', batch.bytes, {
          write: true, key: `lens-${batch.receipt.sha256}`, contentType: 'application/x-protobuf',
        });
        receipt.transportReceipt = `requests/lens-${batch.receipt.sha256}.json`;
        if (result.partialSuccess?.rejectedSpans || result.partial_success?.rejected_spans)
          throw new Error('Trace ingestion rejected spans');
        receipt.status = 'acknowledged';
      } catch (error) { receipt.status = 'unknown-write-outcome'; receipt.error = error.message; throw error; }
      finally { receipt.finishedAt = new Date().toISOString(); await writeFile(path, JSON.stringify(receipt, null, 2) + '\n'); }
    }
    const observed = await transport.post('trace', '/agents/conversations/spans', { project_id: PROJECT, conversation_ids: conversationIds });
    const verification = { ...reconcileSpans(batches, observed, conversationIds), checkedAt: new Date().toISOString(),
      project: PROJECT, conversationIds, capturedBatchHashes: batches.map(batch => batch.receipt.sha256),
      sourceCampaignHash: createHash('sha256').update(await readFile(join(coachDirectory, 'campaign.json'))).digest('hex') };
    await writeFile(join(directory, `lens-readback-${Date.now()}.json`), JSON.stringify({ verification, observed }, null, 2) + '\n');
    await writeFile(join(directory, 'lens-readback.json'), JSON.stringify(verification, null, 2) + '\n');
    return verification;
  } finally { transport.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const recovery = process.argv.includes('--recovery');
  const result = await publishLens({ directory: resolve(recovery ? '../tabtopitch-real-data/forge/lens-recovery' : '../tabtopitch-real-data/forge'),
    coachDirectory: resolve(recovery ? '../tabtopitch-real-data/coach-recovery' : '../tabtopitch-real-data/coach'), verifyOnly: process.argv.includes('--verify') });
  console.info(JSON.stringify(result));
  if (!result.verified) process.exitCode = 2;
}
