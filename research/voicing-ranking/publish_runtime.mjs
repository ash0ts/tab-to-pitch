/** Publish the post-evaluation fit separately from the immutable CV model. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ForgeTransport } from '../forge/transport.mjs';
import { ensurePrivateProject, ENTITY, PROJECT_NAME } from '../forge/project.mjs';
import { readRun } from '../forge/models.mjs';

const source = resolve(process.argv[2]);
const prior = JSON.parse(
  await readFile(join(resolve(process.argv[3]), 'publication.json'), 'utf8'),
);
const output = resolve(process.argv[4]);
const recovery = process.argv[5]
  ? JSON.parse(await readFile(join(resolve(process.argv[5]), 'publication.json'), 'utf8'))
  : null;
const runName = 'voicing-runtime-fit-v1';
const collection = 'tabtopitch-voicing-ranker-runtime-v1';
const files = [
  'voicing-ranker-v1.json',
  'manifest.json',
  'fit.json',
  'parity.json',
  'source/fit_runtime.py',
  'source/benchmark.py',
  'source/protocol.json',
  'source/verify_runtime.py',
  'source/voicing-ranker.ts',
  'source/voicing-ranker.test.ts',
];
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);
const receipt = {
  status: 'pending',
  inferenceCalls: 0,
  newHeldoutScore: false,
  productionPromotion: false,
};
await mkdir(output, { recursive: true });
const receiptPath = join(output, 'publication.json');
await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
const checkpoint = () => writeFile(receiptPath, JSON.stringify(receipt, null, 2));
const transport = new ForgeTransport({
  directory: join(output, 'requests'),
  mode: 'native',
  deadlineMs: 30000,
});

async function transfer(url, path, method = 'GET', headers = []) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    !/(^|\.)(coreweave\.com|wandb\.ai|googleapis\.com|amazonaws\.com|windows\.net)$/.test(
      parsed.hostname,
    )
  )
    throw new Error('Unexpected storage host');
  let config = `url = ${JSON.stringify(url)}\nrequest = ${JSON.stringify(method)}\n`;
  for (const header of headers) config += `header = ${JSON.stringify(header)}\n`;
  config +=
    method === 'PUT'
      ? `upload-file = ${JSON.stringify(path)}\noutput = "/dev/null"\n`
      : `output = ${JSON.stringify(path)}\n`;
  await new Promise((done, reject) => {
    const child = spawn(
      'curl',
      ['--silent', '--show-error', '--fail', '--max-time', '45', '--config', '-'],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? done()
        : reject(new Error(`Storage transfer failed (${code}); inspect before retry`)),
    );
    child.stdin.end(config);
  });
}

try {
  if (prior.artifacts.length !== 3 || prior.artifacts.some((a) => a.status !== 'download-verified'))
    throw new Error('Verified CV artifacts required');
  const model = JSON.parse(await readFile(join(source, 'voicing-ranker-v1.json'), 'utf8'));
  const fit = JSON.parse(await readFile(join(source, 'fit.json'), 'utf8'));
  if (!fit.converged || model.newHeldoutScore !== false)
    throw new Error('Expected converged post-evaluation fit');
  // Preserve existing snapshots. Newly reproduced fits can be packaged directly.
  await mkdir(join(source, 'source'), { recursive: true });
  for (const name of files.filter((name) => name.startsWith('source/'))) {
    try {
      await readFile(join(source, name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const filename = name.slice('source/'.length);
      const directory = filename.endsWith('.ts') ? 'src/engine' : 'research/voicing-ranking';
      await copyFile(join(directory, filename), join(source, name));
    }
  }
  const fitManifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  if (
    hash(await readFile(join(source, 'source/benchmark.py'))) !== fitManifest.fittingCodeSha256 ||
    hash(await readFile(join(source, 'source/fit_runtime.py'))) !== fitManifest.runtimeFitCodeSha256
  )
    throw new Error('Source snapshot differs from the measured fit');
  receipt.project = await ensurePrivateProject(transport, { createIfMissing: false });
  const contents = {},
    hashes = {};
  for (const name of files) {
    const bytes = await readFile(join(source, name));
    contents[name] = { digest: hash(bytes, 'md5', 'base64'), size: bytes.length };
    hashes[name] = hash(bytes);
  }
  receipt.sha256 = hashes;
  const config = {
    kind: 'post-evaluation-all-data-fit',
    modelSha256: hashes['voicing-ranker-v1.json'],
    heldoutReportSha256: model.heldoutReportSha256,
    productionPromotion: false,
    newHeldoutScore: false,
  };
  let run = await readRun(transport, runName);
  if (run) {
    if (!recovery) throw new Error('Run exists; read prior receipt before recovery');
    const detail = await transport.graphql(
      'query($e:String!,$p:String!,$r:String!){project(entityName:$e,name:$p){run(name:$r){config}}}',
      { e: ENTITY, p: PROJECT_NAME, r: runName },
    );
    const observed = JSON.parse(detail.project.run.config);
    if (Object.entries(config).some(([key, value]) => observed[key]?.value !== value))
      throw new Error('Existing run configuration differs');
  } else {
    await transport.graphql(
      'mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name}}}',
      {
        input: {
          entityName: ENTITY,
          modelName: PROJECT_NAME,
          name: runName,
          displayName: 'Recorded-choice runtime model: separate all-data fit',
          jobType: 'research-runtime-fit',
          state: 'running',
          config: JSON.stringify(
            Object.fromEntries(Object.entries(config).map(([key, value]) => [key, { value }])),
          ),
        },
      },
      { write: true, key: 'runtime-run-create' },
    );
  }
  // Use only the verified identities; server readback protects lineage from drift.
  for (const artifact of prior.artifacts) {
    const observed = await transport.graphql('query($id:ID!){artifact(id:$id){id state digest}}', {
      id: artifact.id,
    });
    if (observed.artifact?.state !== 'COMMITTED' || observed.artifact.digest !== artifact.digest)
      throw new Error('Predecessor changed');
    await transport.graphql(
      'mutation($input:UseArtifactInput!){useArtifact(input:$input){artifact{id}}}',
      {
        input: { entityName: ENTITY, projectName: PROJECT_NAME, runName, artifactID: artifact.id },
      },
      { write: true, key: `runtime-use-${artifact.type}` },
    );
  }
  const manifest = {
    version: 1,
    storagePolicy: 'wandb-storage-policy-v1',
    storagePolicyConfig: { storageLayout: 'V2' },
    contents,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const digest = hash(
    Buffer.from(
      'wandb-artifact-manifest-v1\n' +
        Object.keys(contents)
          .sort()
          .map((name) => `${name}:${contents[name].digest}\n`)
          .join(''),
    ),
    'md5',
  );
  let artifactID = recovery?.artifact?.id;
  if (artifactID) {
    const observed = await transport.graphql('query($id:ID!){artifact(id:$id){id state digest}}', {
      id: artifactID,
    });
    if (observed.artifact?.state !== 'COMMITTED' || observed.artifact.digest !== digest)
      throw new Error('Incomplete artifact requires inspection before recovery');
  } else {
    const created = await transport.graphql(
      'mutation($input:CreateArtifactInput!){createArtifact(input:$input){artifact{id}}}',
      {
        input: {
          entityName: ENTITY,
          projectName: PROJECT_NAME,
          artifactTypeName: 'model',
          artifactCollectionName: collection,
          runName,
          digest,
          digestAlgorithm: 'MANIFEST_MD5',
          description:
            'Separate all-data GuitarSet fit for explicitly optional one-step observed-choice ordering. CC BY 4.0. No new held-out score or production promotion.',
          metadata: JSON.stringify({
            sha256: hashes,
            newHeldoutScore: false,
            productionPromotion: false,
          }),
        },
      },
      { write: true, key: 'runtime-artifact-create' },
    );
    artifactID = created.createArtifact.artifact.id;
    receipt.artifact = { id: artifactID, digest, status: 'created' };
    await checkpoint();
    const mf = await transport.graphql(
      'mutation($input:CreateArtifactManifestInput!){createArtifactManifest(input:$input){artifactManifest{id file{uploadUrl uploadHeaders}}}}',
      {
        input: {
          artifactID,
          name: 'wandb_manifest.json',
          digest: hash(manifestBytes, 'md5', 'base64'),
          entityName: ENTITY,
          projectName: PROJECT_NAME,
          runName,
          type: 'FULL',
        },
      },
      { write: true, key: 'runtime-manifest-create' },
    );
    const uploaded = await transport.graphql(
      'mutation($input:CreateArtifactFilesInput!){createArtifactFiles(input:$input){files{edges{node{name uploadUrl uploadHeaders}}}}}',
      {
        input: {
          storageLayout: 'V2',
          artifactFiles: files.map((name) => ({
            artifactID,
            artifactManifestID: mf.createArtifactManifest.artifactManifest.id,
            name,
            md5: contents[name].digest,
          })),
        },
      },
      { write: true, key: 'runtime-files-create' },
    );
    for (const { node } of uploaded.createArtifactFiles.files.edges)
      if (node.uploadUrl)
        await transfer(node.uploadUrl, join(source, node.name), 'PUT', node.uploadHeaders);
    const manifestPath = join(output, 'wandb_manifest.json');
    await writeFile(manifestPath, manifestBytes);
    const location = mf.createArtifactManifest.artifactManifest.file;
    if (location.uploadUrl)
      await transfer(location.uploadUrl, manifestPath, 'PUT', location.uploadHeaders);
    await transport.graphql(
      'mutation($input:CommitArtifactInput!){commitArtifact(input:$input){artifact{id state}}}',
      { input: { artifactID } },
      { write: true, key: 'runtime-artifact-commit' },
    );
  }
  const observed = await transport.graphql(
    'query($id:ID!){artifact(id:$id){id state digest versionIndex files(first:100){edges{node{name directUrl}}}}}',
    { id: artifactID },
  );
  if (observed.artifact?.state !== 'COMMITTED' || observed.artifact.digest !== digest)
    throw new Error('Artifact readback differs');
  receipt.artifact = {
    id: artifactID,
    digest,
    qualifiedName: `${ENTITY}/${PROJECT_NAME}/${collection}:v${observed.artifact.versionIndex}`,
    status: 'committed',
  };
  await checkpoint();
  const destination = join(output, 'downloaded');
  const seen = new Set();
  for (const { node } of observed.artifact.files.edges) {
    if (!Object.hasOwn(hashes, node.name)) continue;
    const path = join(destination, node.name);
    await mkdir(resolve(path, '..'), { recursive: true });
    await transfer(node.directUrl, path);
    if (hash(await readFile(path)) !== hashes[node.name])
      throw new Error('Downloaded bytes differ');
    seen.add(node.name);
  }
  if (seen.size !== files.length) throw new Error('Artifact files missing');
  receipt.artifact.status = 'download-verified';
  await checkpoint();
  await new Promise((done, reject) => {
    const child = spawn(
      resolve('ml/.venv/bin/python'),
      [resolve('research/voicing-ranking/verify_runtime.py'), '--bundle', destination],
      { stdio: ['ignore', 'ignore', 'ignore'] },
    );
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? done() : reject(new Error('Downloaded runtime replay failed')),
    );
  });
  receipt.replay = JSON.parse(await readFile(join(destination, 'runtime-replay.json'), 'utf8'));
  const summary = {
    rows: model.trainingRows,
    recordings: model.trainingRecordings,
    optimizerIterations: fit.iterations,
    trainingObjective: fit.trainingObjective,
    parityCases: receipt.replay.cases,
    replayedCandidateScores: receipt.replay.candidateScores,
    newHeldoutScore: false,
    productionPromotion: false,
  };
  run = await readRun(transport, runName);
  if (run.state !== 'finished')
    await transport.post(
      'api',
      `/files/${ENTITY}/${PROJECT_NAME}/${runName}/file_stream`,
      {
        files: {
          'wandb-history.jsonl': { offset: 0, content: [JSON.stringify({ ...summary, _step: 0 })] },
          'wandb-summary.json': { offset: 0, content: [JSON.stringify(summary)] },
        },
        complete: true,
        exitcode: 0,
      },
      { write: true, key: 'runtime-run-finish' },
    );
  const matches = (value) =>
    value.state === 'finished' &&
    Object.entries(summary).every(
      ([key, expected]) => JSON.parse(value.summaryMetrics || '{}')[key] === expected,
    );
  for (let attempt = 0; attempt < 5 && !matches(run); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    run = await readRun(transport, runName);
  }
  receipt.run = {
    url: `https://forge.coreweave.com/wandb/${ENTITY}/${PROJECT_NAME}/runs/${runName}`,
    state: run.state,
    summaryMatches: matches(run),
  };
  await checkpoint();
  if (!matches(run)) throw new Error('Run summary not yet verified');
  const entity = 'wandb32',
    registry = 'wandb-registry-TabToPitch Research',
    portfolio = 'Recorded-choice runtime ranker';
  const lookup = () =>
    transport.graphql(
      'query($e:String!,$p:String!,$a:String!){project(entityName:$e,name:$p){access isRegistryProject artifact(name:$a){id digest}}}',
      { e: entity, p: registry, a: `${portfolio}:research-candidate` },
    );
  let reg = await lookup();
  if (reg.project?.access !== 'PRIVATE' || !reg.project.isRegistryProject)
    throw new Error('Registry privacy/type mismatch');
  if (reg.project.artifact && reg.project.artifact.id !== artifactID)
    throw new Error('Research alias already refers to another model');
  if (!reg.project.artifact)
    await transport.graphql(
      'mutation($input:LinkArtifactInput!){linkArtifact(input:$input){artifactID artifactCollectionID versionIndex}}',
      {
        input: {
          artifactID,
          artifactPortfolioName: portfolio,
          entityName: entity,
          projectName: registry,
          aliases: [{ artifactCollectionName: portfolio, alias: 'research-candidate' }],
        },
      },
      { write: true, key: 'runtime-registry-link' },
    );
  reg = await lookup();
  if (reg.project?.access !== 'PRIVATE' || reg.project.artifact?.id !== artifactID)
    throw new Error('Registry alias readback differs');
  receipt.registry = {
    entity,
    project: registry,
    collection: portfolio,
    alias: 'research-candidate',
    aliasVerified: true,
    access: 'PRIVATE',
  };
  receipt.status = 'verified';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  process.exitCode = 2;
} finally {
  receipt.finishedAt = new Date().toISOString();
  await checkpoint();
  transport.close();
  console.log(
    JSON.stringify({
      status: receipt.status,
      error: receipt.error,
      artifact: receipt.artifact,
      run: receipt.run,
      registry: receipt.registry,
    }),
  );
}
