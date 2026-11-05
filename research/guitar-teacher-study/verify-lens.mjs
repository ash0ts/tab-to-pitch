import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ForgeTransport } from '../forge/transport.mjs';
import { loadCapture } from '../forge/publish-lens.mjs';
import { ensurePrivateProject, PROJECT } from '../forge/project.mjs';
export async function verifyStudyLens(directory) {
  const c = JSON.parse(await readFile(join(directory, 'campaign.json'), 'utf8'));
  const batches = await loadCapture(join(directory, 'lens-capture'));
  const expected = batches.flatMap((b) => b.receipt.spans),
    traceIds = [...new Set(expected.map((s) => s.traceId))];
  const out = join(directory, 'publication', 'lens-detail');
  await mkdir(out, { recursive: true });
  const transport = new ForgeTransport({
    directory: join(out, 'requests'),
    mode: 'native',
    deadlineMs: 30000,
  });
  const spans = [];
  try {
    await ensurePrivateProject(transport, { createIfMissing: false });
    for (let i = 0; i < traceIds.length; i += 25) {
      const result = await transport.post('trace', '/agents/spans/query', {
        project_id: PROJECT,
        query: {
          $expr: {
            $or: traceIds
              .slice(i, i + 25)
              .map((id) => ({ $eq: [{ $getField: 'trace_id' }, { $literal: id }] })),
          },
        },
        limit: 1000,
      });
      if (result.total_count !== result.spans.length) throw new Error('Span query truncated');
      spans.push(...result.spans);
    }
    if (
      spans.length !== expected.length ||
      new Set(spans.map((s) => s.trace_id + '/' + s.span_id)).size !== spans.length
    )
      throw new Error('Span membership mismatch');
    const parent = (p) => (!p || /^0+$/.test(p) ? null : p);
    for (const e of expected) {
      const s = spans.find((s) => s.trace_id === e.traceId && s.span_id === e.spanId);
      if (!s || parent(s.parent_span_id) !== parent(e.parentSpanId) || s.span_name !== e.name)
        throw new Error('Span parent/name differs');
    }
    const conversations = [];
    const rows = [...c.rows, ...(c.criticRows ?? [])].filter((r) => r.traceId);
    for (const conversationId of new Set(rows.map((r) => r.traceId))) {
      const identities = rows.filter((r) => r.traceId === conversationId).map((r) => r.id);
      const actual = spans.filter((s) => s.conversation_id === conversationId),
        calls = actual.filter((s) => s.operation_name === 'chat');
      const requests = c.requests.filter((q) => identities.includes(q.identity)),
        sum = (xs, key) => xs.reduce((n, x) => n + (x[key] ?? 0), 0);
      const input = sum(calls, 'input_tokens'),
        output = sum(calls, 'output_tokens');
      const requestedInput = requests.reduce((n, q) => n + (q.usage?.prompt_tokens ?? 0), 0),
        requestedOutput = requests.reduce((n, q) => n + (q.usage?.completion_tokens ?? 0), 0);
      if (
        !actual.length ||
        calls.length !== requests.length ||
        input !== requestedInput ||
        output !== requestedOutput
      )
        throw new Error(`Conversation usage/call mismatch: ${conversationId}`);
      conversations.push({
        identities,
        conversationId,
        spans: actual.length,
        calls: calls.length,
        inputTokens: input,
        outputTokens: output,
        unknownUsage: requests.filter((q) => !q.usage).length,
      });
    }
    const receipt = {
      status: 'verified',
      parentsAndNamesMatch: true,
      usageMatchesProviderReceipts: true,
      conversations,
      spans: spans.length,
      checkedAt: new Date().toISOString(),
    };
    await writeFile(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2));
    return receipt;
  } finally {
    transport.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const r = await verifyStudyLens(resolve(process.argv[2]));
  console.info(
    JSON.stringify({ status: r.status, spans: r.spans, conversations: r.conversations.length }),
  );
}
