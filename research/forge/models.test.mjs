import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadRecallBundle, RECALL_FILES } from './models.mjs';

test('aggregate upload gate enforces fixed allowlist, frozen bytes, and no source identifiers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recall-bundle-unit-'));
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const model = '{"testFixture":true}';
  const report = '{"unitTest":true}';
  const manifest = {
    synthetic: false,
    promotionEligible: false,
    target: 'Anki self-rated recall (review_rating > 1)',
    publicationAllowlist: RECALL_FILES,
    modelSha256: hash(model),
    reportSha256: hash(report),
  };
  const files = {
    'model.json': model,
    'report.json': report,
    'dataset-manifest.json': '{}',
    'run-manifest.json': JSON.stringify(manifest),
    'metrics.json': '{"brier":0.25}',
  };
  try {
    await Promise.all(
      Object.entries(files).map(([name, value]) => writeFile(join(directory, name), value)),
    );
    assert.deepEqual((await loadRecallBundle(directory)).metrics, { brier: 0.25 });
    await writeFile(join(directory, 'model.json'), '{}');
    await assert.rejects(loadRecallBundle(directory), /frozen manifest/);
    await writeFile(join(directory, 'model.json'), model);
    await writeFile(join(directory, 'dataset-manifest.json'), '{"card_id":123}');
    await assert.rejects(loadRecallBundle(directory), /private identifier/);
    await writeFile(join(directory, 'dataset-manifest.json'), '{}');
    manifest.publicationAllowlist = [...RECALL_FILES, 'raw.json'];
    await writeFile(join(directory, 'run-manifest.json'), JSON.stringify(manifest));
    await assert.rejects(loadRecallBundle(directory), /allowlist/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
