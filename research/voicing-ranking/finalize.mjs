/** Finish verified artifact replay and Registry linkage after a read-only timeout. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { ForgeTransport } from '../forge/transport.mjs';
import { ensurePrivateProject, ENTITY, PROJECT_NAME } from '../forge/project.mjs';
import { readRun } from '../forge/models.mjs';

const priorPath = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const prior = JSON.parse(await readFile(join(priorPath, 'publication.json'), 'utf8'));
const replay = JSON.parse(
  await readFile(join(priorPath, 'downloaded', 'prediction-replay.json'), 'utf8'),
);
if (
  prior.artifacts.length !== 3 ||
  prior.artifacts.some((a) => a.status !== 'download-verified') ||
  replay.matched !== 4317 ||
  replay.maximumLogLossDifference !== 0
)
  throw new Error('Verified predecessor required');
const receipt = {
  status: 'pending',
  priorReceiptSha256: createHash('sha256')
    .update(await readFile(join(priorPath, 'publication.json')))
    .digest('hex'),
  matchedPredictions: replay.matched,
  productionPromotion: false,
};
const receiptPath = join(output, 'finalization.json');
await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
const transport = new ForgeTransport({
  directory: join(output, 'requests'),
  mode: process.env.FORGE_TRANSPORT ?? 'native',
  deadlineMs: 30000,
});
try {
  receipt.project = await ensurePrivateProject(transport, { createIfMissing: false });
  for (const artifact of prior.artifacts) {
    const observed = await transport.graphql('query($id:ID!){artifact(id:$id){id state digest}}', {
      id: artifact.id,
    });
    if (observed.artifact?.state !== 'COMMITTED' || observed.artifact.digest !== artifact.digest)
      throw new Error('Artifact changed');
  }
  const name = 'voicing-artifact-replay-v1';
  let run = await readRun(transport, name);
  if (!run) throw new Error('Verification run missing');
  const summary = {
    matchedPredictions: replay.matched,
    downloadHashesMatch: true,
    productionPromotion: false,
  };
  if (run.state !== 'finished')
    await transport.post(
      'api',
      `/files/${ENTITY}/${PROJECT_NAME}/${name}/file_stream`,
      {
        files: {
          'wandb-history.jsonl': { offset: 0, content: [JSON.stringify({ ...summary, _step: 0 })] },
          'wandb-summary.json': { offset: 0, content: [JSON.stringify(summary)] },
        },
        complete: true,
        exitcode: 0,
      },
      { write: true, key: 'finish-verified-artifact-replay' },
    );
  // Explicit summary update is a supported run mutation; use the measured replay
  // result, and read it back instead of waiting on asynchronous file indexing.
  const matches = (value) =>
    value?.state === 'finished' &&
    Object.entries(summary).every(
      ([key, expected]) => JSON.parse(value.summaryMetrics || '{}')[key] === expected,
    );
  if (!matches(run))
    await transport.graphql(
      'mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name}}}',
      {
        input: {
          entityName: ENTITY,
          modelName: PROJECT_NAME,
          name,
          summaryMetrics: JSON.stringify(summary),
        },
      },
      { write: true, key: 'replay-summary' },
    );
  for (let attempt = 0; attempt < 5 && !matches(run); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    run = await readRun(transport, name);
  }
  receipt.verificationReadback = {
    state: run.state,
    summary: JSON.parse(run.summaryMetrics || '{}'),
    historyLineCount: run.historyLineCount,
  };
  if (!matches(run)) throw new Error('Verification summary mismatch');
  receipt.verificationRun = {
    url: `https://forge.coreweave.com/wandb/${ENTITY}/${PROJECT_NAME}/runs/${name}`,
    summaryMatches: true,
    state: run.state,
  };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  const org = await transport.graphql(
    'query($entity:String!){entity(name:$entity){organization{name orgEntity{name}}}}',
    { entity: ENTITY },
  );
  const orgEntity = org.entity?.organization?.orgEntity?.name;
  if (!orgEntity) throw new Error('Registry organization unavailable');
  const registry = 'wandb-registry-TabToPitch Research';
  let reg = await transport.graphql(
    'query($e:String!,$p:String!){project(entityName:$e,name:$p){id name access isRegistryProject}}',
    { e: orgEntity, p: registry },
  );
  if (!reg.project) {
    await transport.graphql(
      'mutation($input:UpsertModelInput!){upsertModel(input:$input){project{id name access}}}',
      {
        input: {
          entityName: orgEntity,
          name: registry,
          access: 'PRIVATE',
          description:
            'Private TabToPitch research candidates; no production deployment or learning efficacy claim.',
          allowAllArtifactTypesInRegistry: true,
        },
      },
      { write: true, key: 'create-private-registry' },
    );
    reg = await transport.graphql(
      'query($e:String!,$p:String!){project(entityName:$e,name:$p){id name access isRegistryProject}}',
      { e: orgEntity, p: registry },
    );
  }
  if (reg.project?.access !== 'PRIVATE' || !reg.project.isRegistryProject)
    throw new Error('Registry privacy or type mismatch');
  const model = prior.artifacts.find((a) => a.type === 'model');
  const alias = await transport.graphql(
    'query($e:String!,$p:String!,$a:String!){project(entityName:$e,name:$p){access artifact(name:$a){id digest}}}',
    { e: orgEntity, p: registry, a: 'Observed voicing ranker:research-candidate' },
  );
  if (alias.project?.artifact && alias.project.artifact.id !== model.id)
    throw new Error('Registry alias already refers to another model');
  if (!alias.project?.artifact) {
    const linked = await transport.graphql(
      'mutation($input:LinkArtifactInput!){linkArtifact(input:$input){artifactID artifactCollectionID versionIndex aliases{alias}}}',
      {
        input: {
          artifactID: model.id,
          artifactPortfolioName: 'Observed voicing ranker',
          entityName: orgEntity,
          projectName: registry,
          aliases: [
            { artifactCollectionName: 'Observed voicing ranker', alias: 'research-candidate' },
          ],
        },
      },
      { write: true, key: 'registry-link' },
    );
    receipt.registry = {
      entity: orgEntity,
      project: registry,
      access: reg.project.access,
      ...linked.linkArtifact,
    };
  } else
    receipt.registry = {
      entity: orgEntity,
      project: registry,
      access: reg.project.access,
      artifactID: model.id,
    };
  const readback = await transport.graphql(
    'query($e:String!,$p:String!,$a:String!){project(entityName:$e,name:$p){access artifact(name:$a){id digest}}}',
    { e: orgEntity, p: registry, a: 'Observed voicing ranker:research-candidate' },
  );
  if (readback.project?.access !== 'PRIVATE' || readback.project.artifact?.id !== model.id)
    throw new Error('Registry alias readback differs');
  receipt.registry.aliasVerified = true;
  receipt.trainingRun = await readRun(transport, 'voicing-ranking-v1');
  receipt.status = 'verified';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error.message;
  process.exitCode = 2;
} finally {
  receipt.finishedAt = new Date().toISOString();
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
  transport.close();
  console.log(
    JSON.stringify({
      status: receipt.status,
      error: receipt.error,
      registry: receipt.registry,
      verificationRun: receipt.verificationRun,
    }),
  );
}
