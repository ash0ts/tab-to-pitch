import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Pool } from 'pg';

export async function migrate(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    // A process-independent lock keeps concurrent deploys from applying the same file twice.
    await client.query('SELECT pg_advisory_lock(728419632)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
    const files = (await readdir(directory))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    for (const name of files) {
      if ((await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).rowCount)
        continue;
      const sql = await readFile(resolve(directory, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.info(`Applied ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(728419632)').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required.');
    process.exitCode = 1;
  } else
    await migrate(databaseUrl).catch(() => {
      console.error('Migration failed. Check database access and schema state.');
      process.exitCode = 1;
    });
}
