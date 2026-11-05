import { it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerAudio, AudioWorkerClient } from './audio';
import { readConfig } from './config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('disables audio on hosted and non-loopback deployments', async () => {
  for (const config of [
    { production: true, host: '127.0.0.1' },
    { production: false, host: '0.0.0.0' },
  ]) {
    const app = Fastify();
    const call = vi.fn();
    await registerAudio(
      app,
      { ...readConfig({}), audioEnabled: true, ...config },
      { call, close: async () => {} },
    );
    expect((await app.inject('/api/audio/health')).json().enabled).toBe(false);
    expect(call).not.toHaveBeenCalled();
    await app.close();
  }
});
it('rejects rebinding, invalid IDs, and malformed jobs before the worker', async () => {
  const app = Fastify(),
    call = vi.fn(async () => ({}));
  await registerAudio(
    app,
    { ...readConfig({}), audioEnabled: true },
    { call, close: async () => {} },
  );
  expect(
    (await app.inject({ url: '/api/audio/jobs/invalid', headers: { host: 'attacker.test' } }))
      .statusCode,
  ).toBe(403);
  expect(
    (await app.inject({ url: '/api/audio/jobs/invalid', headers: { host: '127.0.0.1' } }))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/audio/jobs',
        headers: { host: '127.0.0.1' },
        payload: { assetId: '../file' },
      })
    ).statusCode,
  ).toBe(400);
  expect(call).not.toHaveBeenCalled();
  await app.close();
});
it('communicates with a real local worker and returns no local paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ttp-audio-')),
    worker = new AudioWorkerClient('python3', dir);
  try {
    const demo = (await worker.call('demo')) as { asset: { id: string } };
    expect(demo.asset.id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(demo)).not.toContain(dir);
    const req = {
      assetId: demo.asset.id,
      start: 0,
      end: 8,
      stages: ['timing'],
      contextRevision: 'test',
    };
    const a = (await worker.call('submit', req)) as { id: string };
    const b = (await worker.call('submit', req)) as { id: string };
    expect(a.id).toBe(b.id);
    await worker.call('cancel', { id: a.id });
  } finally {
    await worker.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);

it('trace projection retains only an actual receipt identity and status', async () => {
  const { audioTraceProjection } = await import('./tracing');
  const { randomUUID } = await import('node:crypto');
  const id = randomUUID();
  const result = {
    status: 'ok',
    data: {
      job: { id, contextRevision: 'local-context', status: 'queued' },
      assetId: 'private',
      filename: 'private.wav',
    },
  };
  expect(audioTraceProjection('audio_job_receipt', result)).toEqual({
    audioJobId: id,
    audioJobStatus: 'queued',
  });
  expect(audioTraceProjection('inspect_audio', result)).toEqual({});
});
