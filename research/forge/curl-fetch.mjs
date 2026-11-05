import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const quote = (value) =>
  `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r', '\\r').replaceAll('\n', '\\n')}"`;

/** Scope this adapter to Forge SDK work; it deliberately rejects inference requests. */
export function createForgeSdkFetch(options) {
  const fetch = createCurlFetch(options);
  return async (input, init) => {
    const original = new Request(input, init);
    const url = new URL(original.url);
    const prefixes = {
      'https://api.forge.coreweave.com': 'https://forge.coreweave.com/api/wandb',
      'https://api.wandb.ai': 'https://forge.coreweave.com/api/wandb',
      'https://trace.wandb.ai': 'https://forge.coreweave.com/api/trace',
    };
    const rewritten = prefixes[url.origin]
      ? `${prefixes[url.origin]}${url.pathname}${url.search}`
      : original.url;
    return fetch(new Request(rewritten, original));
  };
}

/** A scoped fetch with no retries, redirects, or credentials in process arguments. */
export function createCurlFetch({
  deadlineMs = 15000,
  spawnProcess = spawn,
  signedStorageUrls = new Set(),
} = {}) {
  return async (input, init) => {
    const request = new Request(input, init);
    if (
      request.url !== 'https://forge.coreweave.com/api/wandb/graphql' &&
      !request.url.startsWith('https://forge.coreweave.com/api/wandb/files/') &&
      !request.url.startsWith('https://forge.coreweave.com/api/trace/') &&
      !(request.url.startsWith('https://') && signedStorageUrls.has(request.url))
    ) {
      throw new Error('Publication fetch only permits Forge API proxy routes');
    }
    request.signal.throwIfAborted();
    const directory = await mkdtemp(join(tmpdir(), 'tabtopitch-publish-'));
    try {
      const body = Buffer.from(await request.arrayBuffer());
      if (body.length > 16 * 1024 * 1024) throw new Error('Request exceeds 16 MiB');
      const bodyPath = join(directory, 'body');
      await writeFile(bodyPath, body, { mode: 0o600 });
      const config = [
        `url = ${quote(request.url)}`,
        `request = ${quote(request.method)}`,
        ...Array.from(request.headers, ([key, value]) => `header = ${quote(`${key}: ${value}`)}`),
        ...(body.length ? [`data-binary = ${quote(`@${bodyPath}`)}`] : []),
      ].join('\n');
      const marker = '\n__TABTOPITCH_CURL_METRICS__';
      const result = await new Promise((resolve, reject) => {
        const child = spawnProcess(
          '/usr/bin/curl',
          [
            '--disable',
            '--config',
            '-',
            '--silent',
            '--show-error',
            '--max-time',
            String(deadlineMs / 1000),
            '--connect-timeout',
            String(Math.min(deadlineMs / 1000, 8)),
            '--retry',
            '0',
            '--write-out',
            `${marker}%{json}`,
          ],
          { stdio: ['pipe', 'pipe', 'pipe'] },
        );
        let bytes = 0;
        const chunks = [];
        let stderr = '';
        const abort = () => child.kill('SIGTERM');
        request.signal.addEventListener('abort', abort, { once: true });
        child.stdout.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 32 * 1024 * 1024) child.kill('SIGTERM');
          else chunks.push(chunk);
        });
        child.stderr.on('data', (chunk) => {
          stderr = (stderr + chunk).slice(0, 2000);
        });
        child.once('error', reject);
        child.stdin.once('error', reject);
        child.once('close', (code) => {
          request.signal.removeEventListener('abort', abort);
          if (request.signal.aborted) return reject(request.signal.reason);
          const raw = Buffer.concat(chunks).toString('utf8');
          const split = raw.lastIndexOf(marker);
          let metadata;
          try {
            metadata = JSON.parse(raw.slice(split + marker.length));
          } catch {
            /* Report a bounded transport error below. */
          }
          if (code !== 0 || split < 0 || !metadata?.http_code) {
            const error = new Error(`curl transport failed (exit ${code}): ${stderr.trim()}`);
            error.timings = metadata && {
              connectSeconds: metadata.time_connect,
              tlsSeconds: metadata.time_appconnect,
              totalSeconds: metadata.time_total,
            };
            return reject(error);
          }
          resolve({ text: raw.slice(0, split), metadata });
        });
        child.stdin.end(config);
      });
      const response = new Response(
        [204, 205, 304].includes(result.metadata.http_code) ? null : result.text,
        { status: result.metadata.http_code, headers: { 'Content-Type': 'application/json' } },
      );
      response.timings = {
        connectSeconds: result.metadata.time_connect,
        tlsSeconds: result.metadata.time_appconnect,
        totalSeconds: result.metadata.time_total,
      };
      return response;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
