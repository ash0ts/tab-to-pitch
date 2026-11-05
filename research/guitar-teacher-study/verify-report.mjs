import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { score } from './scorer.ts';

// Recompute published results from original responses. This never calls an actor or judge.
const root = new URL('../../public/research/guitar-teacher/', import.meta.url);
const json = async (file) => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const report = await json('results.json');
const evidence = await json('evidence.json');
const manifest = await json('dataset-manifest.json');
for (const [file, expected] of Object.entries(manifest.files)) {
  assert.equal(
    createHash('sha256')
      .update(await readFile(new URL(file, root)))
      .digest('hex'),
    expected,
  );
}
const scorerHash = report.frozen.hashes.find(
  (entry) => entry.path === 'research/guitar-teacher-study/scorer.ts',
);
assert.equal(
  createHash('sha256')
    .update(await readFile(new URL('./scorer.ts', import.meta.url)))
    .digest('hex'),
  scorerHash.sha256,
);
const cases = new Map(evidence.manifest.cases.map((c) => [c.id, c]));
assert.equal(cases.size, 72);
assert.equal(evidence.campaign.rows.length, 360);
assert.equal(new Set(evidence.campaign.rows.map((r) => r.id)).size, 360);
for (const row of evidence.campaign.rows) {
  assert.deepEqual(score(cases.get(row.taskId), row), row.scores, row.id);
  const displayed = report.cases.find((c) => c.id === row.taskId).rows.find((r) => r.id === row.id);
  assert.deepEqual(displayed.scores, row.scores, row.id);
  assert.deepEqual(displayed.actions, row.output.actions, row.id);
  assert.deepEqual(displayed.resolved, row.resolved, row.id);
  assert.equal(displayed.message, row.output.message, row.id);
}
for (const arm of ['current', 'evidence-first', 'local']) {
  const rows = evidence.campaign.rows.filter((r) => r.arm === arm);
  const result = report.analysis.arms[arm];
  assert.equal(rows.length, result.executed);
  assert.equal(
    rows.filter((r) =>
      arm === 'local' ? r.scores.requestedActionDelivered : r.scores.actorDelivered,
    ).length,
    result.primarySuccesses,
  );
  assert.equal(
    rows.filter((r) => r.scores.requestedActionDelivered).length,
    result.productDeliveryIncludingFallback,
  );
  for (const kind of ['role', 'move']) {
    const selected = rows.filter((r) => cases.get(r.taskId).kind === kind);
    assert.equal(selected.length, result.taskSlices[kind].n);
    assert.equal(
      selected.filter((r) =>
        arm === 'local' ? r.scores.requestedActionDelivered : r.scores.actorDelivered,
      ).length,
      result.taskSlices[kind].delivered,
    );
  }
}
assert.equal(report.critic.length, 48);
for (const row of evidence.campaign.criticRows) {
  const displayed = report.critic.find((r) => r.fixtureId === row.fixtureId);
  const correct = !row.failure && row.output?.approved === row.expectedApproved;
  assert.equal(correct, row.correct, row.id);
  assert.equal(displayed.correct, correct, row.id);
  assert.deepEqual(displayed.output, row.output, row.id);
}
assert.equal(report.analysis.critic.correct, report.critic.filter((r) => r.correct).length);
assert.equal(report.table.rows, 408);
assert.equal(report.readback.rows, 408);
assert.equal(report.readback.conversations, 336);
assert.equal(report.readback.usageMatchesProviderReceipts, true);
console.info(
  'Verified 360 frozen response scores, 48 critic outcomes, source checksums and displayed totals. No inference.',
);
