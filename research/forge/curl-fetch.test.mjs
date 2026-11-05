import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createCurlFetch, createForgeSdkFetch } from './curl-fetch.mjs';

function fakeSpawn(inspect) {
  return (command, args) => {
    const process = new EventEmitter();
    process.stdout = new PassThrough();
    process.stderr = new PassThrough();
    process.kill = () => setImmediate(() => process.emit('close', 15));
    let config = '';
    process.stdin = new Writable({
      write(chunk, _encoding, callback) {
        config += chunk;
        callback();
      },
      final(callback) {
        setImmediate(async () => {
          try {
            await inspect({ command, args, config });
            process.stdout.write(
              '{"ok":true}\n__TABTOPITCH_CURL_METRICS__{"http_code":200,"time_connect":0.1,"time_appconnect":0.2,"time_total":0.3}',
            );
            process.emit('close', 0);
          } catch (error) {
            process.emit('error', error);
          }
        });
        callback();
      },
    });
    return process;
  };
}

test('curl disables local config and keeps credentials off argv', async () => {
  let bodyPath;
  const fetch = createCurlFetch({
    spawnProcess: fakeSpawn(async ({ command, args, config }) => {
      assert.equal(command, '/usr/bin/curl');
      assert.equal(args[0], '--disable');
      assert.ok(!args.join(' ').includes('private-key'));
      assert.ok(
        config.includes('Authorization: Basic private-key') ||
          config.includes('authorization: Basic private-key'),
      );
      assert.ok(!args.includes('--location'));
      bodyPath = config.match(/data-binary = "@([^\"]+)"/)[1];
      assert.equal(await readFile(bodyPath, 'utf8'), '{"aggregate":3}');
    }),
  });
  const response = await fetch('https://forge.coreweave.com/api/trace/obj/create', {
    method: 'POST',
    headers: { Authorization: 'Basic private-key' },
    body: '{"aggregate":3}',
  });
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(response.timings, { connectSeconds: 0.1, tlsSeconds: 0.2, totalSeconds: 0.3 });
  await assert.rejects(readFile(bodyPath), { code: 'ENOENT' });
});

test('SDK origin rewrite preserves payload and never permits inference', async () => {
  const fetch = createForgeSdkFetch({
    spawnProcess: fakeSpawn(({ config }) => {
      assert.ok(config.includes('https://forge.coreweave.com/api/wandb/graphql'));
    }),
  });
  await fetch('https://api.forge.coreweave.com/graphql', { method: 'POST', body: '{}' });
  await assert.rejects(
    fetch('https://api.inference.wandb.ai/v1/chat/completions', { method: 'POST', body: '{}' }),
    /only permits/,
  );
});

test('foreign storage is denied unless exact server-returned URL was granted', async () => {
  const url = 'https://storage.example.test/object?signed=token';
  const fetch = createCurlFetch({ spawnProcess: fakeSpawn(() => {}) });
  await assert.rejects(fetch(url, { method: 'PUT', body: '{}' }), /only permits/);
  const allowed = createCurlFetch({
    signedStorageUrls: new Set([url]),
    spawnProcess: fakeSpawn(({ args }) => {
      assert.ok(!args.join(' ').includes('signed=token'));
    }),
  });
  assert.equal((await allowed(url, { method: 'PUT', body: '{}' })).status, 200);
});

test('already-aborted request creates no process', async () => {
  let calls = 0;
  const fetch = createCurlFetch({
    spawnProcess: () => {
      calls++;
    },
  });
  await assert.rejects(
    fetch('https://forge.coreweave.com/api/trace/call/read', { signal: AbortSignal.abort() }),
  );
  assert.equal(calls, 0);
});
