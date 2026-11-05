import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ForgeTransport } from './transport.mjs';
import { ensurePrivateProject } from './project.mjs';

const directory = resolve(process.argv[2] ?? '../tabtopitch-real-data/forge');
await mkdir(directory, { recursive: true });
const transport = new ForgeTransport({
  directory: resolve(directory, 'requests'),
  mode: process.env.FORGE_TRANSPORT ?? 'native',
});
try {
  const project = await ensurePrivateProject(transport, {
    creationAttempt: process.env.FORGE_CREATION_ATTEMPT ?? '1',
  });
  await writeFile(resolve(directory, 'project.json'), `${JSON.stringify(project, null, 2)}\n`);
  console.info(JSON.stringify(project));
} finally {
  transport.close();
}
