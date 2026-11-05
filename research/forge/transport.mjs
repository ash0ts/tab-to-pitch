import { Agent, request as httpsRequest } from 'node:https';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCurlFetch } from './curl-fetch.mjs';

export const ENDPOINTS = Object.freeze({
  api: 'https://forge.coreweave.com/api/wandb',
  trace: 'https://forge.coreweave.com/api/trace',
});

export function jsonHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function targetUrl(service, path) {
  if (
    !(service in ENDPOINTS) ||
    !/^\/[a-zA-Z0-9_/.:-]+$/.test(path) ||
    path.includes('..') ||
    path.startsWith('//')
  ) {
    throw new Error('Unknown service or invalid API path');
  }
  return `${ENDPOINTS[service]}${path}`;
}

export class PublicationError extends Error {
  constructor(message, receipt) {
    super(message);
    this.receipt = receipt;
  }
}

/** Native HTTPS retains the documented Forge proxy prefixes that the pinned SDKs rewrite. */
export class ForgeTransport {
  constructor({
    apiKey = process.env.WANDB_API_KEY,
    directory,
    deadlineMs = 15000,
    request = httpsRequest,
    fetch,
    mode = 'native',
  } = {}) {
    if (!apiKey) throw new Error('WANDB_API_KEY is required in the environment');
    if (!directory) throw new Error('A receipt directory is required');
    this.apiKey = apiKey;
    this.directory = directory;
    this.deadlineMs = deadlineMs;
    this.request = request;
    this.fetch = fetch ?? (mode === 'curl' ? createCurlFetch({ deadlineMs }) : undefined);
    this.agent = new Agent({ keepAlive: true, maxSockets: 1, ...(process.env.FORGE_MAX_TLS_VERSION === 'TLSv1.2' ? {maxVersion:'TLSv1.2',ecdhCurve:'X25519:P-256'} : {}) });
    this.counter = 0;
  }

  close() {
    this.agent.destroy();
  }

  async post(
    service,
    path,
    value,
    { write = false, key, responseFormat = 'json', contentType = 'application/json' } = {},
  ) {
    if (!['json', 'jsonl'].includes(responseFormat) || (write && responseFormat !== 'json'))
      throw new Error('Unsupported response format');
    const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    if (body.length > 16 * 1024 * 1024) throw new Error('Publication request exceeds 16 MiB');
    if (write && !key) throw new Error('Writes require a stable operation key');
    const name = key ?? `read-${Date.now()}-${this.counter++}`;
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('Invalid receipt key');
    await mkdir(this.directory, { recursive: true });
    const receiptPath = join(this.directory, `${name}.json`);
    const expected = {
      service,
      path,
      requestSha256: Buffer.isBuffer(value)
        ? createHash('sha256').update(value).digest('hex')
        : jsonHash(value),
    };
    if (write) {
      try {
        const previous = JSON.parse(await readFile(receiptPath, 'utf8'));
        if (Object.entries(expected).some(([field, item]) => previous[field] !== item))
          throw new Error('Operation key refers to different content');
        if (previous.status === 'acknowledged') return previous.response;
        throw new Error(
          'Prior write outcome is unresolved; inspect its independent readback before retrying',
        );
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const receipt = {
      schemaVersion: 1,
      ...expected,
      write,
      startedAt: new Date().toISOString(),
      status: 'pending',
      stages: {},
    };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      flag: write ? 'wx' : 'w',
    });
    const start = performance.now();
    try {
      const result = this.fetch
        ? await (async () => {
            const response = await this.fetch(targetUrl(service, path), {
              method: 'POST',
              body,
              headers: {
                'Content-Type': contentType,
                Accept: responseFormat === 'jsonl' ? 'application/jsonl' : 'application/json',
                Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`,
              },
            });
            receipt.stages = response.timings ?? {};
            return { status: response.status, text: await response.text() };
          })()
        : await new Promise((resolve, reject) => {
            let settled = false;
            let timer;
            const done = (error, value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (error) reject(error);
              else resolve(value);
            };
            const connection = this.request(
              targetUrl(service, path),
              {
                method: 'POST',
                family: 4,
                agent: this.agent,
                headers: {
                  'Content-Type': contentType,
                  'Content-Length': String(body.length),
                  Accept: responseFormat === 'jsonl' ? 'application/jsonl' : 'application/json',
                  Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`,
                },
              },
              (response) => {
                receipt.stages.headersMs = Math.round(performance.now() - start);
                const chunks = [];
                let bytes = 0;
                response.on('data', (chunk) => {
                  bytes += chunk.length;
                  if (bytes > 32 * 1024 * 1024)
                    connection.destroy(new Error('Response exceeds 32 MiB'));
                  else chunks.push(chunk);
                });
                response.once('error', (error) => done(error));
                response.once('end', () =>
                  done(null, {
                    status: response.statusCode,
                    text: Buffer.concat(chunks).toString('utf8'),
                  }),
                );
              },
            );
            connection.on('socket', (socket) => {
              receipt.stages.socketMs = Math.round(performance.now() - start);
              if (!socket.connecting) {
                receipt.stages.reusedSocket = true;
                return;
              }
              socket.once('lookup', () => {
                receipt.stages.dnsMs = Math.round(performance.now() - start);
              });
              socket.once('connect', () => {
                receipt.stages.connectMs = Math.round(performance.now() - start);
              });
              socket.once('secureConnect', () => {
                receipt.stages.tlsMs = Math.round(performance.now() - start);
              });
            });
            connection.once('error', (error) => done(error));
            timer = setTimeout(
              () => connection.destroy(new Error('Request deadline exceeded')),
              this.deadlineMs,
            );
            connection.end(body);
          });
      receipt.httpStatus = result.status;
      let parsed;
      try {
        parsed =
          responseFormat === 'jsonl'
            ? result.text
                .split('\n')
                .filter((line) => line.trim())
                .map((line) => JSON.parse(line))
            : JSON.parse(result.text);
      } catch {
        // Never persist an unexpected HTML page or an echoed credential.
        throw new Error('Expected a JSON response');
      }
      receipt.response = parsed;
      if (result.status < 200 || result.status >= 300) throw new Error(`HTTP ${result.status}`);
      if (service === 'api' && path === '/graphql' && parsed.errors?.length)
        throw new Error('GraphQL returned errors');
      receipt.status = write ? 'acknowledged' : 'read';
      return parsed;
    } catch (error) {
      if (error.timings) receipt.stages = error.timings;
      receipt.status = write ? 'unknown-write-outcome' : 'read-failed';
      receipt.error = error.message;
      throw new PublicationError(error.message, receipt);
    } finally {
      receipt.elapsedMs = Math.round(performance.now() - start);
      receipt.finishedAt = new Date().toISOString();
      await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    }
  }

  async graphql(query, variables, options) {
    return (await this.post('api', '/graphql', { query, variables }, options)).data;
  }
}
