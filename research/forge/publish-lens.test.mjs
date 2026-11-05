import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSpans } from './publish-lens.mjs';

test('hosted trace coverage requires exact spans in every expected conversation', () => {
  const batches = [{ receipt: { spans: [{ traceId: 't', spanId: 's' }] } }];
  const complete = { conversations: [{ conversation_id: 'c', spans: [{ trace_id: 't', span_id: 's' }] }] };
  assert.equal(reconcileSpans(batches, complete, ['c']).verified, true);
  assert.equal(reconcileSpans(batches, complete, ['another']).verified, false);
  assert.equal(reconcileSpans(batches, { conversations: [] }, ['c']).verified, false);
  assert.equal(reconcileSpans(batches, { conversations: [{ conversation_id: 'c', spans: [] }] }, ['c']).verified, false);
});
