import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readConfig } from '../../server/config.js';
import { createTraceRunner } from '../../server/tracing.js';
import { createLensCapture } from './lens-capture.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
  directories.length = 0;
});
async function setup(directory?: string) {
  const root = directory ?? (await mkdtemp(join(tmpdir(), 'ttp-lens-capture-')));
  if (!directory) directories.push(root);
  const capture = createLensCapture(root);
  const runner = createTraceRunner(
    {
      ...readConfig({}),
      cloudEnabled: true,
      tracingEnabled: true,
      forgeProject: 'test/project',
      forgeApiKey: 'never-persist-this-api-key',
    },
    { spanProcessor: capture.spanProcessor },
  );
  return { root, capture, runner };
}
async function produce(runner: ReturnType<typeof createTraceRunner>) {
  return runner.run(async (trace) => {
    await trace.model(
      'test-model',
      async () => ({ privateText: 'private-learner-secret', tokens: 7 }),
      (value) => ({ inputTokens: value.tokens, outputTokens: 3 }),
    );
    trace.tool('choose_drill', () => ({ answer: 'private-grading-key' }));
    return trace.id;
  });
}

it('persists real production SDK spans without learner payloads and resumes batch numbering', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Capture must stay offline'));
  const first = await setup();
  try {
    const conversationId = await produce(first.runner);
    expect(conversationId).toMatch(/^[\da-f-]{36}$/);
    const [receipt, empty] = await Promise.all([
      first.capture.checkpoint(),
      first.capture.checkpoint(),
    ]);
    expect(receipt!.sequence).toBe(1);
    expect(receipt!.spanCount).toBeGreaterThanOrEqual(3);
    expect(new Set(receipt!.spanIds).size).toBe(receipt!.spanCount);
    expect(empty).toBeNull();
    const bytes = await readFile(join(first.root, receipt!.filename));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt!.sha256);
    expect(bytes.length).toBe(receipt!.bytes);
    const payload = bytes.toString('utf8');
    expect(payload).toContain('choose_drill');
    expect(payload).toContain('test-model');
    expect(payload).toContain('no-learner-content');
    expect(payload).not.toContain('private-learner-secret');
    expect(payload).not.toContain('private-grading-key');
    expect(payload).not.toContain('never-persist-this-api-key');
    expect(JSON.parse(await readFile(join(first.root, 'batch-000001.json'), 'utf8'))).toEqual(
      receipt,
    );
    expect(fetch).not.toHaveBeenCalled();
    await first.runner.close();
    // A second SDK lifecycle captures fresh real spans into the same durable directory.
    const second = await setup(first.root);
    try {
      await produce(second.runner);
      const resumed = await second.capture.checkpoint();
      expect(resumed!.sequence).toBe(2);
      expect(await readFile(join(first.root, receipt!.filename))).toEqual(bytes);
    } finally {
      await second.runner.close();
    }
    expect((await readdir(first.root)).sort()).toEqual([
      'batch-000001.json',
      'batch-000001.otlp.pb',
      'batch-000002.json',
      'batch-000002.otlp.pb',
    ]);
  } finally {
    await first.runner.close();
    warning.mockRestore();
    fetch.mockRestore();
  }
});

it('retains finished spans after a filesystem failure and captures on shutdown', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const root = await mkdtemp(join(tmpdir(), 'ttp-lens-failure-'));
  directories.push(root);
  const blocked = join(root, 'blocked');
  await writeFile(blocked, 'not a directory');
  const { capture, runner } = await setup(blocked);
  try {
    await produce(runner);
    await expect(capture.checkpoint()).rejects.toThrow();
    await rm(blocked);
    const recovered = await capture.checkpoint();
    expect(recovered!.spanCount).toBeGreaterThanOrEqual(3);
    expect(recovered!.sequence).toBe(1);
    // Fail after protobuf commit but before metadata commit, then retry the same bytes.
    const blockedReceipt = join(blocked, 'batch-000002.json');
    await mkdir(blockedReceipt);
    await produce(runner);
    await expect(capture.checkpoint()).rejects.toThrow();
    const priorBytes = await readFile(join(blocked, 'batch-000002.otlp.pb'));
    await rm(blockedReceipt, { recursive: true });
    const retried = await capture.checkpoint();
    expect(retried!.sequence).toBe(2);
    expect(await readFile(join(blocked, retried!.filename))).toEqual(priorBytes);
    await produce(runner);
    await runner.close();
    const shutdownReceipt = JSON.parse(await readFile(join(blocked, 'batch-000003.json'), 'utf8'));
    expect(shutdownReceipt.spanCount).toBeGreaterThanOrEqual(3);
  } finally {
    await runner.close();
    warning.mockRestore();
  }
});
