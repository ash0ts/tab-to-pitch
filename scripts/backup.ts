import { spawnSync } from 'node:child_process';
import { mkdirSync, chmodSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { postgresEnvironment } from './backup-env.js';

try {
  if (process.argv.length !== 3) throw new Error('Expected one path');
  const file = resolve(process.argv[2]!);
  const environment = postgresEnvironment();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  process.umask(0o077);
  // Refuse an existing path and establish private permissions before the dump writes.
  closeSync(openSync(file, 'wx', 0o600));
  const result = spawnSync(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-acl', '--file', file],
    { env: environment, stdio: 'pipe' },
  );
  if (result.status !== 0) {
    unlinkSync(file);
    throw new Error('Backup failed');
  }
  chmodSync(file, 0o600);
  console.info(`Backup written to ${file}`);
} catch {
  console.error(
    'Backup failed. Usage: npx tsx scripts/backup.ts <new-output.dump>. Requires DATABASE_URL, pg_dump, and a new output path.',
  );
  process.exitCode = 1;
}
