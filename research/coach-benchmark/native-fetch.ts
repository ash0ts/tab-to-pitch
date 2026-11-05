import { budgetedInference } from '../forge/inference-budget.js';
import { Agent, request } from 'node:https';

/** Reuse one authenticated TLS connection; never retry a completion request. */
export function createNativeInferenceFetch() {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  const fetcher: typeof fetch = async (input, init) => {
    const source = new Request(input, init);
    const url = new URL(source.url);
    if (
      url.origin !== 'https://api.inference.wandb.ai' ||
      url.search ||
      url.username ||
      url.password ||
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
            if (bytes > 2 * 1024 * 1024)
              connection.destroy(new Error('Response exceeded size limit'));
            else chunks.push(chunk);
          });
          response.once('error', reject);
          response.once('end', () => {
            clearTimeout(timer);
            source.signal.removeEventListener('abort', abort);
            const status = response.statusCode ?? 502;
            accept(
              new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
                status,
                headers: { 'Content-Type': 'application/json' },
              }),
            );
          });
        },
      );
      const abort = () => connection.destroy(new Error('Inference request cancelled'));
      source.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(
        () => connection.destroy(new Error('Inference transport deadline')),
        20_000,
      );
      connection.once('error', (error) => {
        clearTimeout(timer);
        source.signal.removeEventListener('abort', abort);
        reject(error);
      });
      if (source.signal.aborted) abort();
      connection.end(body);
    });
  };
  return { fetch: budgetedInference(fetcher, 'integrated-research'), close: () => agent.destroy() };
}
