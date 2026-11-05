import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig();
const staticRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const app = await buildApp({ config, ...(existsSync(staticRoot) ? { staticRoot } : {}) });
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
try {
  await app.listen({ host: config.host, port: config.port });
  console.info(
    `TabToPitch listening on port ${config.port}; cloud coach ${config.cloudEnabled ? 'enabled' : 'disabled'}.`,
  );
} catch {
  console.error('TabToPitch server could not start. Check port and database configuration.');
  await app.close();
  process.exitCode = 1;
}
