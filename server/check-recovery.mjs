import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// This rehearsal creates a database with no network access or exposed ports.
const image = process.argv[2] ?? 'tab-to-pitch:validation';
const suffix = randomUUID().slice(0, 8);
const database = `ttp-pg-${suffix}`;
const password = randomUUID();
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', ...options });
  if (result.status !== 0)
    throw new Error(`Recovery step failed: docker ${args[0]}. ${result.stderr}`);
  return result.stdout.trim();
}
function sql(name, query) {
  return docker(
    ['exec', '-i', database, 'psql', '-U', 'postgres', '-d', name, '-At', '-v', 'ON_ERROR_STOP=1'],
    { input: query },
  );
}
function migrate(name) {
  docker(
    [
      'run',
      '--rm',
      '--network',
      `container:${database}`,
      '--env',
      'DATABASE_URL',
      image,
      'node',
      'scripts/migrate.js',
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:5432/${name}`,
      },
    },
  );
}
const snapshot = `SELECT json_build_object(
  'invitations', (SELECT json_agg(r ORDER BY id) FROM invitations r),
  'sessions', (SELECT json_agg(r ORDER BY token_hash) FROM sessions r),
  'days', (SELECT json_agg(r ORDER BY day) FROM daily_token_budgets r),
  'reservations', (SELECT json_agg(r ORDER BY request_id) FROM token_reservations r),
  'migrations', (SELECT json_agg(r ORDER BY name) FROM schema_migrations r)
);`;
try {
  docker(
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      database,
      '--network',
      'none',
      '--env',
      'POSTGRES_PASSWORD',
      '--env',
      'POSTGRES_DB=ttp_source',
      'postgres:16',
    ],
    {
      env: { ...process.env, POSTGRES_PASSWORD: password },
    },
  );
  for (let attempt = 0; ; attempt++) {
    const ready = spawnSync('docker', [
      'exec',
      database,
      'pg_isready',
      '-U',
      'postgres',
      '-d',
      'ttp_source',
    ]);
    if (ready.status === 0) break;
    assert(attempt < 59, 'Disposable database became ready');
    await delay(500);
  }
  migrate('ttp_source');
  migrate('ttp_source');
  sql(
    'ttp_source',
    `
    INSERT INTO invitations(id,token_hash,expires_at,max_tokens,used_tokens,reserved_tokens)
    VALUES ('11111111-1111-4111-8111-111111111111','synthetic-invite-hash','2100-01-01',1000,37,53);
    INSERT INTO sessions(token_hash,invitation_id,expires_at)
    VALUES ('synthetic-session-hash','11111111-1111-4111-8111-111111111111','2100-01-01');
    INSERT INTO daily_token_budgets(day,used_tokens,reserved_tokens) VALUES ('2099-01-01',37,53);
    INSERT INTO token_reservations(invitation_id,request_id,day,reserved_tokens,charged_tokens,settled_at)
    VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2099-01-01',100,37,now()),
           ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','2099-01-01',53,NULL,NULL);
  `,
  );
  const before = JSON.parse(sql('ttp_source', snapshot));
  docker([
    'exec',
    database,
    'pg_dump',
    '-U',
    'postgres',
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file=/tmp/recovery.dump',
    'ttp_source',
  ]);
  docker(['exec', database, 'createdb', '-U', 'postgres', 'ttp_restored']);
  docker([
    'exec',
    database,
    'pg_restore',
    '-U',
    'postgres',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    '--single-transaction',
    '--dbname=ttp_restored',
    '/tmp/recovery.dump',
  ]);
  migrate('ttp_restored');
  assert.deepEqual(
    JSON.parse(sql('ttp_restored', snapshot)),
    before,
    'Restored authentication and quota records match',
  );
  assert.equal(
    sql('ttp_restored', 'SELECT count(*) FROM schema_migrations;'),
    '1',
    'Migration is idempotent',
  );
  console.info(
    'Recovery rehearsal passed: compiled migration, custom-format backup, isolated transactional restore, invitation/session/settled+reserved budget equality.',
  );
} finally {
  spawnSync('docker', ['rm', '--force', database], { stdio: 'ignore' });
}
