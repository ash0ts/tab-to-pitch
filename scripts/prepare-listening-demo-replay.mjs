import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

// Publication snapshots live below the authoritative campaign, so the spending
// reconciler cannot count their copied request receipts a second time.
const root = resolve('.');
const demo = resolve(process.argv[2]);
const reference = resolve(process.argv[3]);
const destination = join(demo, 'replay', demo.split('/').at(-1));
const raw = await readFile(join(demo, 'campaign.json'));
const campaign = JSON.parse(raw);
if (
  campaign.status !== 'execution-complete' ||
  campaign.purpose !== 'actual-local-UI-authored-demonstration'
)
  throw new Error('Expected a completed, original-study UI demonstration');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const hash = (value) => createHash('sha256').update(value).digest('hex');
await mkdir(destination, { recursive: false });
const files = JSON.parse(await readFile(join(reference, 'manifest.json'))).sourceHashes;
const sourceHashes = [];
for (const { path } of files) {
  const bytes = await readFile(join(root, path));
  const target = join(destination, 'source', path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  sourceHashes.push({ path, sha256: hash(bytes) });
}
const sourceHash = hash(json(sourceHashes));
const cases = {
  developmentCases: campaign.rows.map((row) => ({
    id: row.taskId,
    source: 'actual-ui-scripted-original-study',
    request: row.request,
  })),
  checkpointCases: [],
  boundaryCases: [],
  episodes: [],
  claimFixtures: [],
  dialogueFixtures: [],
};
const datasetHash = hash(json(cases));
await writeFile(join(destination, 'cases.json'), json(cases), { flag: 'wx' });
await writeFile(
  join(destination, 'manifest.json'),
  json({
    version: 'live-ui-recorded-replay-v1',
    project: campaign.project,
    sourceHash,
    sourceHashes,
    datasetHash,
    createdAt: new Date().toISOString(),
    sourceScope:
      'Post-execution replay scorer snapshot; not a pre-registered experiment or an execution-source attestation.',
    authoritativeCampaign: '../../campaign.json',
    authoritativeCampaignHash: hash(raw),
    executionManifest: JSON.parse(await readFile(join(demo, 'manifest.json'))),
  }),
  { flag: 'wx' },
);
await writeFile(
  join(destination, 'campaign.json'),
  json({
    ...campaign,
    sourceHash,
    datasetHash,
    judgeRows: [],
    qualifiedJudges: {},
    qualification: { 'openai/gpt-oss-20b': false },
  }),
  { flag: 'wx' },
);
await symlink(join(demo, 'lens-capture'), join(destination, 'lens-capture'), 'dir');
console.info(JSON.stringify({ destination, rows: campaign.rows.length, inferenceCalls: 0 }));
