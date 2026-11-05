import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { postgresEnvironment } from './backup-env.js';

try {
  if (process.argv.length !== 4 || process.argv[3] !== '--confirm-restore')
    throw new Error('Explicit restore flag required');
  const file = resolve(process.argv[2]!);
  const environment = postgresEnvironment();
  const result = spawnSync(
    'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '--single-transaction',
      '--dbname',
      environment.PGDATABASE!,
      file,
    ],
    { env: environment, stdio: 'pipe' },
  );
  if (result.status !== 0) throw new Error('Restore failed');
  console.info('Restore completed. Run migrations before restarting the application.');
} catch {
  console.error(
    'Restore failed. Usage: npx tsx scripts/restore.ts <input.dump> --confirm-restore. Requires DATABASE_URL and pg_restore.',
  );
  process.exitCode = 1;
}
