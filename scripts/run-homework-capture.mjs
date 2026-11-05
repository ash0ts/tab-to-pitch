import { build } from 'esbuild';
import { spawn } from 'node:child_process';
await build({
  entryPoints: ['scripts/capture-guitar-homework.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: '.local/capture-guitar-homework.mjs',
  keepNames: false,
});
const child = spawn(
  process.execPath,
  ['.local/capture-guitar-homework.mjs', ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
