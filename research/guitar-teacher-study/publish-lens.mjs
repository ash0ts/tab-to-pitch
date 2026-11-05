import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ForgeTransport } from '../forge/transport.mjs';
import { loadCapture, reconcileSpans } from '../forge/publish-lens.mjs';
import { ensurePrivateProject, PROJECT } from '../forge/project.mjs';
/** Ambiguous ingestion replies require exact independent readback, never blind resubmission. */
export async function publishStudyLens({ directory, coachDirectory, verifyOnly = false }) {
  await mkdir(directory, { recursive: true });
  const batches = await loadCapture(join(coachDirectory, 'lens-capture'));
  const campaign = JSON.parse(await readFile(join(coachDirectory, 'campaign.json'), 'utf8'));
  const ids = [
    ...new Set(
      [...campaign.rows, ...campaign.criticRows].flatMap((r) => (r.traceId ? [r.traceId] : [])),
    ),
  ];
  const transport = new ForgeTransport({
    directory: join(directory, 'requests'),
    mode: 'native',
    deadlineMs: 30000,
  });
  transport.agent.maxSockets = 4;
  async function recover(batch, attempt = 0) {
    const traceIds = batch.receipt.traceIds;
    const result = await transport.post('trace', '/agents/spans/query', {
      project_id: PROJECT,
      query: {
        $expr: {
          $or: traceIds.map((id) => ({ $eq: [{ $getField: 'trace_id' }, { $literal: id }] })),
        },
      },
      limit: 1000,
    });
    // Count and rows can observe different ingestion snapshots. This recovery
    // verifies every expected batch span by identity and name, not a count.
    const matches = batch.receipt.spans.every((e) =>
      result.spans.some(
        (s) => s.trace_id === e.traceId && s.span_id === e.spanId && s.span_name === e.name,
      ),
    );
    if (!matches) {
      if (attempt < 5) {
        await new Promise((done) => setTimeout(done, 400));
        return recover(batch, attempt + 1);
      }
      throw new Error('Unresolved trace upload: retain receipts and investigate, do not resubmit');
    }
    return {
      verified: true,
      spanIds: batch.receipt.spans.map((s) => s.spanId),
      checkedAt: new Date().toISOString(),
    };
  }
  try {
    await ensurePrivateProject(transport, { createIfMissing: false });
    const upload = async (batch) => {
      const path = join(directory, `lens-${batch.receipt.sha256}.json`);
      let receipt;
      try {
        receipt = JSON.parse(await readFile(path, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      if (receipt?.status === 'acknowledged' || receipt?.status === 'verified-after-unknown-write')
        return;
      if (receipt) {
        await writeFile(
          join(directory, `retained-failure-${batch.receipt.sha256}.json`),
          JSON.stringify(receipt, null, 2),
          { flag: 'wx' },
        ).catch((e) => {
          if (e.code !== 'EEXIST') throw e;
        });
        receipt.readback = await recover(batch);
        receipt.status = 'verified-after-unknown-write';
      } else {
        receipt = {
          source: 'forge-sdk-actual-spans',
          payloadSha256: batch.receipt.sha256,
          spanCount: batch.receipt.spanCount,
          status: 'pending',
          startedAt: new Date().toISOString(),
        };
        await writeFile(path, JSON.stringify(receipt, null, 2), { flag: 'wx' });
        try {
          const result = await transport.post('trace', '/agents/otel/v1/traces', batch.bytes, {
            write: true,
            key: `lens-${batch.receipt.sha256}`,
            contentType: 'application/x-protobuf',
          });
          if (result.partialSuccess?.rejectedSpans || result.partial_success?.rejected_spans)
            throw new Error('Trace ingestion rejected spans');
          receipt.status = 'acknowledged';
        } catch (e) {
          receipt.status = 'unknown-write-outcome';
          receipt.error = e.message;
          await writeFile(path, JSON.stringify(receipt, null, 2));
          await writeFile(
            join(directory, `retained-failure-${batch.receipt.sha256}.json`),
            JSON.stringify(receipt, null, 2),
            { flag: 'wx' },
          );
          receipt.readback = await recover(batch);
          receipt.status = 'verified-after-unknown-write';
        }
      }
      await writeFile(path, JSON.stringify(receipt, null, 2));
    };
    if (!verifyOnly) {
      let next = 0,
        stopped = false;
      const workers = await Promise.allSettled(
        Array.from({ length: 4 }, async () => {
          while (!stopped && next < batches.length) {
            const batch = batches[next++];
            try {
              await upload(batch);
            } catch (error) {
              stopped = true;
              throw error;
            }
          }
        }),
      );
      const failure = workers.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
    const observed = await transport.post('trace', '/agents/conversations/spans', {
      project_id: PROJECT,
      conversation_ids: ids,
    });
    const verification = {
      ...reconcileSpans(batches, observed, ids),
      conversationIds: ids,
      project: PROJECT,
      sourceCampaignHash: createHash('sha256')
        .update(await readFile(join(coachDirectory, 'campaign.json')))
        .digest('hex'),
      checkedAt: new Date().toISOString(),
    };
    await writeFile(
      join(directory, `lens-readback-${Date.now()}.json`),
      JSON.stringify({ verification, observed }, null, 2),
    );
    await writeFile(join(directory, 'lens-readback.json'), JSON.stringify(verification, null, 2));
    return verification;
  } finally {
    transport.close();
  }
}
