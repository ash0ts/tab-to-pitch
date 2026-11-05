import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { computeDigest } from '../../node_modules/weave/dist/digest.mjs';
import { createCurlFetch } from '../forge/curl-fetch.mjs';
import { ForgeTransport } from '../forge/transport.mjs';
import { verifyDataset } from '../forge/weave-client.mjs';
import { PROJECT } from '../forge/project.mjs';
const directory = resolve('../tabtopitch-real-data/practice-intent-v2/publication');
const previous = JSON.parse(await readFile(join(directory, 'weave.json'), 'utf8'));
const cases = JSON.parse(await readFile(resolve(directory, '../cases.json'), 'utf8'));
if (previous.arms.length || Object.keys(previous.refs).some((key) => key !== 'dataset'))
  throw new Error(
    'Recovery restricted to dataset-only publication; no evaluation can have started',
  );
// This exact original arrow function is the source blob passed to the pinned SDK's saveOp.
const source = '({ datasetRow, modelOutput }) => scoreIntent(datasetRow, modelOutput.response)';
const digest = computeDigest(Buffer.from(source));
const fetch = createCurlFetch();
const receipt = {
  at: new Date().toISOString(),
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  expectedDigest: digest,
  attempts: [],
  evaluationStarted: false,
};
await mkdir(join(directory, 'recovery-readback'), { recursive: true });
for (let attempt = 1; attempt <= 3; attempt++) {
  const row = { attempt, at: new Date().toISOString() };
  try {
    const response = await fetch('https://forge.coreweave.com/api/trace/file/content', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${process.env.WANDB_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project_id: PROJECT, digest }),
    });
    row.httpStatus = response.status;
    if (response.ok) {
      const body = Buffer.from(await response.arrayBuffer());
      row.contentSha256 = createHash('sha256').update(body).digest('hex');
      row.matchesSource = body.equals(Buffer.from(source));
      receipt.fileState = row.matchesSource ? 'present-and-matches' : 'unexpected-content';
    } else if (response.status === 404) receipt.fileState = 'absent';
  } catch (error) {
    row.error = error.message;
    row.stages = error.timings;
  }
  receipt.attempts.push(row);
  await writeFile(
    join(directory, 'recovery-readback', 'source-file.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  if (receipt.fileState) break;
}
const transport = new ForgeTransport({
  directory: join(directory, 'recovery-readback'),
  mode: 'native',
});
try {
  receipt.dataset = await verifyDataset(transport, {
    datasetRef: previous.refs.dataset,
    expectedRows: cases,
  });
} catch (error) {
  receipt.datasetError = error.message;
} finally {
  transport.close();
}
await writeFile(
  join(directory, 'recovery-readback', 'source-file.json'),
  JSON.stringify(receipt, null, 2) + '\n',
);
console.info(JSON.stringify(receipt));
