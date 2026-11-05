import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { ForgeTransport, ENDPOINTS, jsonHash } from './transport.mjs';
import { ensurePrivateProject, PROJECT } from './project.mjs';

const require = createRequire(import.meta.url);
const sdkRoot = dirname(require.resolve('weave'));
const sdkVersion = require(join(sdkRoot, '../package.json')).version;
const reads = new Set([
  '/call/read',
  '/calls/query',
  '/calls/query_stats',
  '/obj/read',
  '/objs/query',
  '/table/query',
  '/table/query_stats',
  '/agents/conversations/spans',
  '/agents/conversations/chat',
]);

/** Keep official serialization and evaluation objects; replace only transport initialization. */
export async function createWeavePublisher({
  directory,
  mode = process.env.FORGE_TRANSPORT ?? 'curl',
  transport: suppliedTransport,
  qualificationReadAttempts = 3,
}) {
  if (sdkVersion !== '0.16.10')
    throw new Error('Requalify the Weave initialization adapter after a dependency update');
  const transport =
    suppliedTransport ?? new ForgeTransport({ directory: join(directory, 'requests'), mode });
  let project;
  for (let attempt = 1; attempt <= qualificationReadAttempts; attempt++) {
    try {
      project = await ensurePrivateProject(transport, { createIfMissing: false });
      break;
    } catch (error) {
      // Only initial read-only connection failures qualify for another bounded attempt.
      if (
        attempt === qualificationReadAttempts ||
        error.receipt?.write !== false ||
        error.receipt.httpStatus !== undefined
      ) {
        transport.close();
        throw error;
      }
    }
  }
  if (!project) throw new Error('Private project qualification did not execute');
  const failures = [];
  const fetch = async (input, init) => {
    if (failures.length) {
      return new Response(
        JSON.stringify({
          error: 'Publication circuit is open; independent readback is required before resuming.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (!request.url.startsWith(`${ENDPOINTS.trace}/`))
      throw new Error('Unexpected Weave request origin');
    const path = url.pathname.slice('/api/trace'.length);
    const body = Buffer.from(await request.arrayBuffer());
    const hash = createHash('sha256').update(body).digest('hex');
    try {
      if ((request.headers.get('content-type') ?? '').startsWith('application/json')) {
        const result = await transport.post('trace', path, JSON.parse(body.toString('utf8')), {
          write: !reads.has(path),
          key: reads.has(path) ? undefined : `weave-${path.replaceAll('/', '-')}-${hash}`,
        });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (path !== '/file/create') throw new Error('Unexpected non-JSON Weave request');
      // Reuse the same HTTPS agent for op-source multipart uploads and JSON writes.
      const result = await transport.post('trace', path, body, {
        write: true,
        key: `weave-file-${hash}`,
        contentType: request.headers.get('content-type'),
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      failures.push({ path, requestSha256: hash, error: error.message });
      throw error;
    }
  };
  const [{ createTraceServerClient }, { WeaveClient }, { setGlobalClient }, { makeSettings }] =
    await Promise.all([
      import(join(sdkRoot, 'traceServerClient.mjs')),
      import(join(sdkRoot, 'weaveClient.mjs')),
      import(join(sdkRoot, 'clientApi.mjs')),
      import(join(sdkRoot, 'settings.mjs')),
    ]);
  const traceServerApi = createTraceServerClient({
    apiKey: process.env.WANDB_API_KEY,
    baseURL: ENDPOINTS.trace,
    fetch,
  });
  const client = new WeaveClient({
    traceServerApi,
    projectId: PROJECT,
    settings: makeSettings({ printCallLink: false }),
  });
  setGlobalClient(client);
  return {
    client,
    transport,
    sdkVersion,
    project,
    async flush() {
      await client.waitForBatchProcessing();
      if (failures.length)
        throw new Error(
          `Weave publication failed for ${failures.length} request(s); inspect receipts before retrying`,
        );
    },
    close() {
      transport.close();
      setGlobalClient(undefined);
    },
  };
}

export async function verifyEvaluation(
  transport,
  { callId, evaluationRef, datasetRef, scorerRefs },
) {
  const match = evaluationRef.match(
    /^weave:\/\/\/wandb\/tab-to-pitch-public-data-research\/object\/([^:]+):([^/]+)$/,
  );
  if (!match) throw new Error('Evaluation ref does not belong to the private research project');
  const { call } = await transport.post('trace', '/call/read', { project_id: PROJECT, id: callId });
  const { obj } = await transport.post('trace', '/obj/read', {
    project_id: PROJECT,
    object_id: match[1],
    digest: match[2],
  });
  if (!call?.ended_at || call.exception || call.inputs?.self !== evaluationRef)
    throw new Error('Evaluation call is incomplete or points to another evaluation');
  if (
    obj.val.dataset !== datasetRef ||
    JSON.stringify(obj.val.scorers) !== JSON.stringify(scorerRefs)
  )
    throw new Error('Evaluation does not use the frozen dataset and shared scorers');
  return { verifiedAt: new Date().toISOString(), call, evaluation: obj };
}

export async function verifyDataset(transport, { datasetRef, expectedRows }) {
  const match = datasetRef.match(
    /^weave:\/\/\/wandb\/tab-to-pitch-public-data-research\/object\/([^:]+):([^/]+)$/,
  );
  if (!match) throw new Error('Dataset ref does not belong to the private research project');
  const { obj } = await transport.post('trace', '/obj/read', {
    project_id: PROJECT,
    object_id: match[1],
    digest: match[2],
  });
  const table = obj.val.rows?.match(
    /^weave:\/\/\/wandb\/tab-to-pitch-public-data-research\/table\/([^/]+)$/,
  );
  if (!table) throw new Error('Dataset has no versioned table reference');
  const result = await transport.post('trace', '/table/query', {
    project_id: PROJECT,
    digest: table[1],
    limit: expectedRows.length + 1,
  });
  const rows = result.rows.map((row) => row.val);
  // Object key order is serialization detail; array order is part of the frozen cohort.
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  if (jsonHash(canonical(rows)) !== jsonHash(canonical(expectedRows)))
    throw new Error('Published dataset rows differ from the frozen cohort');
  return {
    verifiedAt: new Date().toISOString(),
    datasetRef,
    tableDigest: table[1],
    rowCount: rows.length,
    rowsSha256: jsonHash(canonical(rows)),
    rowDigests: Object.fromEntries(result.rows.map((row) => [row.val.id, row.digest])),
  };
}
