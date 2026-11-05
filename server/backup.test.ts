import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
it('keeps a dump private while the writer runs and refuses to overwrite an existing backup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ttp-backup-'));
  directories.push(directory);
  const file = join(directory, 'backup.dump');
  writeFileSync(
    join(directory, 'pg_dump'),
    `#!${process.execPath}
const fs = require('node:fs');
const file = process.argv[process.argv.indexOf('--file') + 1];
if ((fs.statSync(file).mode & 0o777) !== 0o600) process.exit(2);
fs.writeFileSync(file, 'synthetic private backup');
`,
    { mode: 0o700 },
  );
  const run = () =>
    spawnSync(process.execPath, ['--import', 'tsx', 'scripts/backup.ts', file], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        DATABASE_URL: 'postgresql://private-user:private-password@localhost/test',
      },
    });
  const first = run();
  expect(first.status).toBe(0);
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(first.stdout + first.stderr).not.toMatch(/private-user|private-password/);
  writeFileSync(file, 'existing backup');
  const second = run();
  expect(second.status).toBe(1);
  expect(readFileSync(file, 'utf8')).toBe('existing backup');
  expect(second.stdout + second.stderr).not.toMatch(/private-user|private-password/);
});

it('removes an incomplete dump when pg_dump fails', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ttp-backup-'));
  directories.push(directory);
  const file = join(directory, 'backup.dump');
  writeFileSync(
    join(directory, 'pg_dump'),
    `#!${process.execPath}
require('node:fs').writeFileSync(process.argv[process.argv.indexOf('--file') + 1], 'partial dump');
process.exit(1);
`,
    { mode: 0o700 },
  );
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/backup.ts', file], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      DATABASE_URL: 'postgresql://private-user:private-password@localhost/test',
    },
  });
  expect(result.status).toBe(1);
  expect(existsSync(file)).toBe(false);
  expect(result.stdout + result.stderr).not.toMatch(/private-user|private-password/);
});
