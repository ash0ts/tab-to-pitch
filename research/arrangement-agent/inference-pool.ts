import { budgetedInference } from '../forge/inference-budget.js';
import { Agent, request } from 'node:https';
import { lookup, resolve4 } from 'node:dns/promises';
/** One completion attempt per call. Only unauthenticated GET probes try alternate DNS addresses. */
export async function createInferencePool(options: { callerReserves?: boolean } = {}) {
  const addresses = await resolve4('api.inference.wandb.ai')
    .then((values) => values.map((address) => ({ address, family: 4 })))
    .catch(() => lookup('api.inference.wandb.ai', { all: true, family: 4 }));
  const probes: { address: string; httpStatus?: number; failure?: string }[] = [];
  let address: string | undefined;
  let selectedAgent: Agent | undefined;
  for (const candidate of addresses) {
    const row: { address: string; httpStatus?: number; failure?: string } = {
      address: candidate.address,
    };
    probes.push(row);
    const probeAgent = new Agent({
      keepAlive: true,
      maxSockets: 4,
      maxVersion: 'TLSv1.2',
      ecdhCurve: 'X25519:P-256',
      lookup: (_hostname, _options, callback) => callback(null, candidate.address, 4),
    });
    try {
      row.httpStatus = await new Promise<number>((accept, reject) => {
        const connection = request(
          'https://api.inference.wandb.ai/v1/models',
          {
            method: 'GET',
            agent: probeAgent,
            family: 4,
            lookup: (_hostname, _options, callback) => callback(null, candidate.address, 4),
          },
          (response) => {
            response.resume();
            response.on('end', () => {
              clearTimeout(timer);
              accept(response.statusCode ?? 0);
            });
          },
        );
        const timer = setTimeout(() => connection.destroy(new Error('Probe timeout')), 15_000);
        connection.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        connection.end();
      });
      if (row.httpStatus === 401 || row.httpStatus === 200) {
        address = candidate.address;
        selectedAgent = probeAgent;
        break;
      }
    } catch (error) {
      probeAgent.destroy();
      row.failure = error instanceof Error ? error.message : 'Probe failed';
    }
  }
  if (!address) throw new Error('No discovered inference address connected');
  const agent = selectedAgent!;
  const fetcher: typeof fetch = async (input, init) => {
    const source = new Request(input, init),
      url = new URL(source.url);
    if (
      url.origin !== 'https://api.inference.wandb.ai' ||
      url.search ||
      !['/v1/models', '/v1/chat/completions'].includes(url.pathname)
    )
      throw new Error('Unapproved inference URL');
    source.signal.throwIfAborted();
    const body = source.body ? Buffer.from(await source.arrayBuffer()) : undefined;
    return new Promise<Response>((accept, reject) => {
      const connection = request(
        url,
        {
          agent,
          family: 4,
          method: source.method,
          headers: {
            ...Object.fromEntries(source.headers),
            ...(body ? { 'Content-Length': String(body.length) } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 2 * 1024 * 1024) connection.destroy(new Error('Response limit'));
            else chunks.push(chunk);
          });
          response.once('error', reject);
          response.once('end', () => {
            clearTimeout(timer);
            source.signal.removeEventListener('abort', abort);
            accept(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode ?? 502,
                headers: { 'Content-Type': 'application/json' },
              }),
            );
          });
        },
      );
      const abort = () => connection.destroy(new Error('Inference deadline'));
      source.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 30_000);
      connection.once('error', (error) => {
        clearTimeout(timer);
        source.signal.removeEventListener('abort', abort);
        reject(error);
      });
      if (source.signal.aborted) abort();
      connection.end(body);
    });
  };
  return {
    fetch: options.callerReserves ? fetcher : budgetedInference(fetcher, 'integrated-research'),
    close: () => agent.destroy(),
    probes,
    address,
  };
}
