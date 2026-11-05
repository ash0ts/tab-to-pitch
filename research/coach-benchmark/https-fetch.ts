import { spawn } from 'node:child_process';

const ALLOWED_ORIGIN = 'https://api.inference.wandb.ai';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const CURL_ARGS = ['--disable', '--config', '-'] as const;

/** curl config is passed through stdin, never a shell or process arguments. */
export function quoteCurlConfig(value: string): string {
  if (value.includes('\0')) throw new Error('NUL is not permitted in curl configuration');
  return JSON.stringify(value);
}

export function splitCurlResponse(output: string): { body: string; status: number } {
  const boundary = output.lastIndexOf('\n');
  const statusText = output.slice(boundary + 1);
  if (boundary < 0 || !/^[1-5][0-9]{2}$/.test(statusText))
    throw new Error('Missing HTTP response status');
  return { body: output.slice(0, boundary), status: Number(statusText) };
}

/** The benchmark uses the documented inference origin and never follows redirects. */
export const inferenceFetch: typeof fetch = async (input, init) => {
  const source = new Request(input, init);
  const url = new URL(source.url);
  if (
    url.origin !== ALLOWED_ORIGIN ||
    !['/v1/models', '/v1/chat/completions'].includes(url.pathname) ||
    url.search ||
    url.username ||
    url.password
  )
    throw new Error('Unapproved inference URL');
  if (source.signal.aborted) throw new Error('Inference request cancelled');
  const body = source.body ? await source.text() : undefined;
  const configuration =
    [
      `url = ${quoteCurlConfig(source.url)}`,
      `request = ${quoteCurlConfig(source.method)}`,
      'silent',
      'show-error',
      'connect-timeout = 8',
      'max-time = 19',
      'write-out = "\\n%{http_code}"',
      ...Array.from(
        source.headers,
        ([name, value]) => `header = ${quoteCurlConfig(`${name}: ${value}`)}`,
      ),
      ...(body === undefined ? [] : [`data-binary = ${quoteCurlConfig(body)}`]),
    ].join('\n') + '\n';
  return new Promise<Response>((accept, reject) => {
    const child = spawn('/usr/bin/curl', CURL_ARGS, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    const cancel = () => {
      failure = new Error('Inference request cancelled');
      child.kill('SIGKILL');
    };
    source.signal.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES) {
        failure = new Error('Inference response exceeded size limit');
        child.kill('SIGKILL');
      } else chunks.push(chunk);
    });
    // Never emit curl stderr: its network diagnostics are not an approved trace payload.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', () => {
      failure = new Error('Could not start inference transport');
    });
    child.once('close', (code) => {
      source.signal.removeEventListener('abort', cancel);
      if (failure || code !== 0)
        return reject(failure ?? new Error(`Inference transport failed (${code})`));
      try {
        const result = splitCurlResponse(Buffer.concat(chunks).toString('utf8'));
        accept(
          new Response([204, 205, 304].includes(result.status) ? null : result.body, {
            status: result.status,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      } catch {
        reject(new Error('Invalid inference transport response'));
      }
    });
    if (source.signal.aborted) cancel();
    child.stdin.end(configuration);
  });
};
