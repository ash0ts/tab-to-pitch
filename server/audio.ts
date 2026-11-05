import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  audioJobRequestSchema,
  audioReviewSchema,
  audioJobReceiptSchema,
  type AudioJobRequest,
} from '../src/shared/audio.js';
import type { ServerConfig } from './config.js';

export class AudioWorkerClient {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<
    number,
    { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(python: string, dataDir: string) {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PYTHONPATH: fileURLToPath(new URL('../audio_worker', import.meta.url)),
      EAR_LAB_DATA_DIR: dataDir,
    };
    for (const key of [
      'TORCH_HOME',
      'HF_HOME',
      'HF_TOKEN',
      'EAR_LAB_RESEARCH_MODE',
      'EAR_LAB_BASIC_PITCH_CHECKPOINT',
    ])
      if (process.env[key]) env[key] = process.env[key];
    this.child = spawn(python, ['-m', 'tabtopitch_audio.worker'], { env, stdio: 'pipe' });
    this.child.stderr.on('data', () => {}); // Payloads and paths never enter HTTP or cloud logs.
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', (line) => {
      try {
        const msg = JSON.parse(line),
          p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error('audio-worker-request-failed'));
        else p.resolve(msg.result);
      } catch {
        this.fail();
      }
    });
    this.child.on('error', () => this.fail());
    this.child.on('exit', () => this.fail());
  }
  private fail() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('audio-worker-unavailable'));
    }
    this.pending.clear();
  }
  call(method: string, params: unknown = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.child.exitCode !== null || this.child.killed || this.pending.size >= 16) {
        reject(new Error('audio-worker-unavailable'));
        return;
      }
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('audio-worker-timeout'));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error('audio-worker-unavailable'));
        }
      });
    });
  }
  async close() {
    this.fail();
    this.child.stdin.end();
    if (this.child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill('SIGKILL');
        resolve();
      }, 12000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
export async function registerAudio(
  app: FastifyInstance,
  config: ServerConfig,
  injected?: Pick<AudioWorkerClient, 'call' | 'close'>,
) {
  const enabled =
    config.audioEnabled &&
    ['127.0.0.1', 'localhost', '::1'].includes(config.host) &&
    !config.production;
  const worker = enabled
    ? (injected ??
      new AudioWorkerClient(config.audioPython ?? 'python3', config.audioDataDir ?? '.local/audio'))
    : null;
  app.get('/api/audio/health', async () =>
    worker
      ? worker.call('health').catch(() => ({ enabled: false, reason: 'worker-unavailable' }))
      : { enabled: false, reason: 'local-worker-disabled' },
  );
  if (!worker) return undefined;
  app.addHook('onClose', () => worker.close());
  await app.register(async (scope) => {
    scope.addHook('onRequest', async (req, reply) => {
      // Origin protects writes in the parent hook. Reject DNS rebinding and cross-site reads too.
      if (
        !['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname) ||
        (req.headers['sec-fetch-site'] &&
          !['same-origin', 'same-site', 'none'].includes(String(req.headers['sec-fetch-site'])))
      )
        return reply.code(403).send({ error: 'local-audio-only' });
    });
    scope.addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer', bodyLimit: 32 * 1024 * 1024 },
      (_req, body, done) => done(null, body),
    );
    scope.post('/api/audio/assets', { bodyLimit: 32 * 1024 * 1024 }, async (req, reply) => {
      const permission = z
        .enum(['owned', 'permission', 'public-domain'])
        .safeParse(req.headers['x-audio-permission']);
      if (!permission.success || !Buffer.isBuffer(req.body))
        return reply.code(400).send({ error: 'audio-permission-and-bytes-required' });
      return worker.call('import', {
        permission: permission.data,
        data: req.body.toString('base64'),
      });
    });
    scope.post('/api/audio/projects', { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
      if (!Buffer.isBuffer(req.body))
        return reply.code(400).send({ error: 'project-bytes-required' });
      return worker.call('import-project', { data: req.body.toString('base64') });
    });
    scope.post('/api/audio/demo', async () => worker.call('demo'));
    scope.post('/api/audio/jobs', async (req, reply) => {
      const parsed = audioJobRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid-audio-job' });
      return worker.call('submit', parsed.data);
    });
    for (const [method, operation] of [
      ['GET', 'job'],
      ['DELETE', 'cancel'],
    ] as const)
      scope.route({
        method,
        url: '/api/audio/jobs/:id',
        handler: async (req, reply) => {
          const parsed = z.object({ id: z.string().uuid() }).safeParse(req.params);
          if (!parsed.success) return reply.code(400).send({ error: 'invalid-job-id' });
          return worker.call(operation, parsed.data);
        },
      });
    scope.get('/api/audio/jobs/:id/reviews', async (req, reply) => {
      const parsed = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid-job-id' });
      return worker.call('reviews', parsed.data);
    });
    scope.post('/api/audio/reviews', async (req, reply) => {
      const parsed = audioReviewSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid-review' });
      return worker.call('review', parsed.data);
    });
    scope.get('/api/audio/artifacts/:id', async (req, reply) => {
      const parsed = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(req.params);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid-artifact' });
      const result = (await worker.call('artifact', parsed.data)) as { data: string };
      return reply.type('application/octet-stream').send(Buffer.from(result.data, 'base64'));
    });
  });
  return {
    requestAnalysis: async (request: AudioJobRequest, signal: AbortSignal) => {
      signal.throwIfAborted();
      const job = (await worker.call('submit', audioJobRequestSchema.parse(request))) as Record<
        string,
        unknown
      >;
      const receipt = audioJobReceiptSchema.parse({
        id: job.id,
        contextRevision: job.contextRevision,
        status: job.status,
      });
      if (signal.aborted) {
        await worker.call('cancel', { id: receipt.id });
        signal.throwIfAborted();
      }
      return receipt;
    },
  };
}
