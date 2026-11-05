import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ForgeTransport, targetUrl } from './transport.mjs';
import { ensurePrivateProject } from './project.mjs';
import { verifyEvaluation } from './weave-client.mjs';

async function withTransport(fetch, fn) {
  const directory = await mkdtemp(join(tmpdir(), 'tabtopitch-transport-test-'));
  const transport = new ForgeTransport({ directory, fetch, apiKey: 'test-secret' });
  try {
    await fn(transport, directory);
  } finally {
    transport.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test('routes preserve proxy prefixes and reject traversal', () => {
  assert.equal(targetUrl('trace', '/obj/read'), 'https://forge.coreweave.com/api/trace/obj/read');
  for (const path of ['//attacker.test', '/../graphql', '/x?token=1'])
    assert.throws(() => targetUrl('api', path));
  assert.throws(() => targetUrl('unknown', '/graphql'));
});

test('acknowledged operation is cached only for identical content; receipts omit credentials', async () => {
  let calls = 0;
  await withTransport(
    async (_url, options) => {
      calls++;
      assert.ok(options.headers.Authorization.startsWith('Basic '));
      return Response.json({ digest: 'expected-digest' });
    },
    async (transport, directory) => {
      const options = { write: true, key: 'stable-op' };
      await transport.post('trace', '/obj/create', { obj: 1 }, options);
      assert.deepEqual(await transport.post('trace', '/obj/create', { obj: 1 }, options), {
        digest: 'expected-digest',
      });
      assert.equal(calls, 1);
      await assert.rejects(
        transport.post('trace', '/obj/create', { obj: 2 }, options),
        /different content/,
      );
      const receipt = await readFile(join(directory, 'stable-op.json'), 'utf8');
      assert.ok(!receipt.includes('test-secret'));
      assert.ok(!receipt.includes(Buffer.from('api:test-secret').toString('base64')));
    },
  );
});

test('unknown write outcome blocks automatic replay', async () => {
  let calls = 0;
  await withTransport(
    async () => {
      calls++;
      throw new Error('deadline');
    },
    async (transport) => {
      await assert.rejects(
        transport.post('trace', '/table/create', {}, { write: true, key: 'table' }),
        /deadline/,
      );
      await assert.rejects(
        transport.post('trace', '/table/create', {}, { write: true, key: 'table' }),
        /independent readback/,
      );
      assert.equal(calls, 1);
    },
  );
});

test('GraphQL errors fail qualification even when HTTP succeeds', async () => {
  await withTransport(
    async () => Response.json({ errors: [{ message: 'unsupported field' }] }),
    async (transport, directory) => {
      await assert.rejects(transport.graphql('query{x}', {}), /GraphQL/);
      const files = await readdir(directory);
      const receipt = JSON.parse(await readFile(join(directory, files[0]), 'utf8'));
      assert.equal(receipt.status, 'read-failed');
    },
  );
});

test('existing public project never receives experiment writes', async () => {
  const requests = [];
  const transport = {
    graphql: async (...args) => {
      requests.push(args);
      return {
        project: { name: 'tab-to-pitch-public-data-research', entityName: 'wandb', access: 'OPEN' },
      };
    },
  };
  await assert.rejects(ensurePrivateProject(transport), /PRIVATE/);
  assert.equal(requests.length, 1);
});

test('new project privacy is independently read after creation', async () => {
  let calls = 0;
  const transport = {
    graphql: async (_query, variables, options) => {
      calls++;
      if (calls === 1) return { project: null };
      if (calls === 2) {
        assert.equal(variables.input.access, 'PRIVATE');
        assert.equal(options.write, true);
        return {};
      }
      return {
        project: {
          name: 'tab-to-pitch-public-data-research',
          entityName: 'wandb',
          access: 'PRIVATE',
        },
        viewer: { username: 'tester' },
      };
    },
  };
  assert.equal((await ensurePrivateProject(transport)).access, 'PRIVATE');
  assert.equal(calls, 3);
});

test('evaluation proof rejects different dataset or incomplete calls', async () => {
  const evaluationRef = 'weave:///wandb/tab-to-pitch-public-data-research/object/evaluation:hash';
  const expected = { callId: 'call', evaluationRef, datasetRef: 'dataset', scorerRefs: ['scorer'] };
  const transport = {
    post: async (_service, path) =>
      path === '/call/read'
        ? { call: { ended_at: '2026-10-29', inputs: { self: evaluationRef } } }
        : { obj: { val: { dataset: 'wrong', scorers: ['scorer'] } } },
  };
  await assert.rejects(verifyEvaluation(transport, expected), /frozen dataset/);
  transport.post = async () => ({ call: { inputs: { self: evaluationRef } }, obj: {} });
  await assert.rejects(verifyEvaluation(transport, expected), /incomplete/);
});
