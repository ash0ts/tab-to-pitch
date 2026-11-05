import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ForgeTransport } from '../forge/transport.mjs';
import { ensurePrivateProject, ENTITY, PROJECT_NAME } from '../forge/project.mjs';
import { readRun } from '../forge/models.mjs';

const source = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const previous = process.argv[4] ? JSON.parse(await readFile(join(resolve(process.argv[4]), 'publication.json'), 'utf8')) : null;
const transport = new ForgeTransport({ directory: join(output, 'requests'), mode: process.env.FORGE_TRANSPORT ?? 'curl', deadlineMs: 30000 });
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const receipt = { status: 'pending', project: `${ENTITY}/${PROJECT_NAME}`, artifacts: [], createdAt: new Date().toISOString(), inferenceCalls: 0 };
if (previous) receipt.recovery = { priorStatus: previous.status, priorReceiptSha256: digest(await readFile(join(resolve(process.argv[4]), 'publication.json'))), policy: 'Read back previously created identities; only resume incomplete stages, preserving prior receipts' };
const receiptPath = join(output, 'publication.json');
await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
const checkpoint = async () => writeFile(receiptPath, JSON.stringify(receipt, null, 2));

async function transfer(url, path, { method = 'GET', headers = [] } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/(^|\.)(coreweave\.com|wandb\.ai|googleapis\.com|amazonaws\.com|windows\.net)$/.test(parsed.hostname)) throw new Error('Unexpected artifact storage host');
  let config = `url = ${JSON.stringify(url)}\nrequest = ${JSON.stringify(method)}\n`;
  for (const header of headers) config += `header = ${JSON.stringify(header)}\n`;
  if (method === 'PUT') config += `upload-file = ${JSON.stringify(path)}\noutput = "/dev/null"\n`;
  else config += `output = ${JSON.stringify(path)}\n`;
  await new Promise((done, reject) => {
    const child = spawn('curl', ['--silent', '--show-error', '--fail', '--max-time', '45', '--config', '-'], { stdio: ['pipe', 'ignore', 'pipe'] });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', code => code === 0 ? done() : reject(new Error(`Artifact transfer failed (${code}); no automatic retry`)));
    child.stdin.end(config);
  });
}

async function createRun(name, title, jobType, config) {
  const existing = await readRun(transport, name);
  if (existing) {
    if (!previous) throw new Error(`Run ${name} already exists; independent readback required`);
    const detail=await transport.graphql('query($e:String!,$p:String!,$r:String!){project(entityName:$e,name:$p){run(name:$r){config}}}',{e:ENTITY,p:PROJECT_NAME,r:name});
    const actual=JSON.parse(detail.project.run.config);
    if(Object.entries(config).some(([k,v])=>JSON.stringify(actual[k]?.value)!==JSON.stringify(v))||!['running','finished'].includes(existing.state))throw new Error('Existing run does not match expected frozen configuration');
    return;
  }
  await transport.graphql('mutation($input:UpsertBucketInput!){upsertBucket(input:$input){bucket{id name}}}', { input: { entityName: ENTITY, modelName: PROJECT_NAME, name, displayName: title, jobType, state: 'running', config: JSON.stringify(Object.fromEntries(Object.entries(config).map(([k,v]) => [k,{value:v}]))) } }, { write: true, key: `${name}-create` });
}

async function finishRun(name, summary, points = [summary]) {
  let run=await readRun(transport,name);
  if(run.state!=='finished')await transport.post('api', `/files/${ENTITY}/${PROJECT_NAME}/${name}/file_stream`, { files: { 'wandb-history.jsonl': { offset: 0, content: points.map((p,i) => JSON.stringify({...p,_step:i})) }, 'wandb-summary.json': { offset: 0, content: [JSON.stringify(summary)] } }, complete: true, exitcode: 0 }, { write: true, key: `${name}-finish` });
  let matches=false;
  for(let attempt=0;attempt<5;attempt++){
    run=await readRun(transport,name);
    const observed=JSON.parse(run.summaryMetrics||'{}');
    matches=run.state==='finished'&&Object.entries(summary).every(([k,v])=>observed[k]===v);
    if(matches)break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!matches)throw new Error('Run readback mismatch');
  return { name, url: `https://forge.coreweave.com/wandb/${ENTITY}/${PROJECT_NAME}/runs/${name}`, state: run.state, summaryMatches: true };
}

async function artifact(collection, type, names, runName) {
  const contents = {}, hashes = {};
  for (const name of names) {
    const bytes = await readFile(join(source,name));
    contents[name] = { digest: digest(bytes, 'md5', 'base64'), size: bytes.length };
    hashes[name] = digest(bytes);
  }
  const manifest = { version: 1, storagePolicy: 'wandb-storage-policy-v1', storagePolicyConfig: { storageLayout: 'V2' }, contents };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const artifactDigest = digest(Buffer.from('wandb-artifact-manifest-v1\n' + Object.keys(contents).sort().map(name => `${name}:${contents[name].digest}\n`).join('')), 'md5');
  const prior = previous?.artifacts.find(a => a.collection === collection);
  let id;
  let alreadyCommitted=false;
  if (prior) {
    if (prior.digest !== artifactDigest || JSON.stringify(prior.sha256) !== JSON.stringify(hashes)) throw new Error('Prior artifact requires a different recovery path');
    const observed = await transport.graphql('query($id:ID!){artifact(id:$id){id state digest currentManifest{id} files(first:100){edges{node{name}}}}}', {id:prior.id});
    if(observed.artifact?.digest!==artifactDigest)throw new Error('Artifact digest changed');
    alreadyCommitted=observed.artifact.state==='COMMITTED'&&['committed','download-verified'].includes(prior.status);
    if(!alreadyCommitted&&(observed.artifact.currentManifest||observed.artifact.files?.edges?.length))throw new Error('Pending artifact has data; inspect before resuming upload');
    id = prior.id;
  } else {
    const created = await transport.graphql('mutation($input:CreateArtifactInput!){createArtifact(input:$input){artifact{id state versionIndex}}}', { input: { entityName: ENTITY, projectName: PROJECT_NAME, artifactTypeName: type, artifactCollectionName: collection, runName, digest: artifactDigest, digestAlgorithm: 'MANIFEST_MD5', description: 'GuitarSet CC BY 4.0 derived research. Observed voicing recovery only. No learner outcomes or production promotion.', metadata: JSON.stringify({ sha256: hashes, experiment: 'observed-voicing-ranking-v1', synthetic: false, servingEnabled: false }) } }, { write: true, key: `${collection}-create` });
    id = created.createArtifact.artifact.id;
  }
  const entry = { collection, type, id, digest: artifactDigest, sha256: hashes, status: 'created' };
  receipt.artifacts.push(entry); await checkpoint();
  if(!alreadyCommitted){
  const manifestPath = join(output,`${collection}.manifest.json`); await writeFile(manifestPath,manifestBytes);
  const createdManifest = await transport.graphql('mutation($input:CreateArtifactManifestInput!){createArtifactManifest(input:$input){artifactManifest{id file{uploadUrl uploadHeaders}}}}', {input:{artifactID:id,name:'wandb_manifest.json',digest:digest(manifestBytes,'md5','base64'),entityName:ENTITY,projectName:PROJECT_NAME,runName,type:'FULL'}}, {write:true,key:`${collection}-manifest`});
  const manifestId=createdManifest.createArtifactManifest.artifactManifest.id;
  const files = await transport.graphql('mutation($input:CreateArtifactFilesInput!){createArtifactFiles(input:$input){files{edges{node{name uploadUrl uploadHeaders}}}}}', { input: { storageLayout: 'V2', artifactFiles: Object.keys(contents).map(name => ({artifactID: id, artifactManifestID:manifestId, name, md5: contents[name].digest, mimetype: name.endsWith('.npz') ? 'application/octet-stream' : 'application/json'})) } }, {write: true, key: `${collection}-files`});
  for (const {node} of files.createArtifactFiles.files.edges) if (node.uploadUrl) await transfer(node.uploadUrl,join(source,node.name),{method:'PUT',headers:node.uploadHeaders});
  const mf=createdManifest.createArtifactManifest.artifactManifest.file;
  if (mf.uploadUrl) await transfer(mf.uploadUrl,manifestPath,{method:'PUT',headers:mf.uploadHeaders});
  const committed=await transport.graphql('mutation($input:CommitArtifactInput!){commitArtifact(input:$input){artifact{id state versionIndex}}}',{input:{artifactID:id}},{write:true,key:`${collection}-commit`});
  entry.version=committed.commitArtifact.artifact.versionIndex; entry.qualifiedName=`${ENTITY}/${PROJECT_NAME}/${collection}:v${entry.version}`; entry.status='committed'; await checkpoint();
  }else{entry.version=prior.version;entry.qualifiedName=prior.qualifiedName;entry.status='committed';await checkpoint();}
  const observed=await transport.graphql('query($id:ID!){artifact(id:$id){id state digest files(first:100){edges{node{name directUrl}}}}}',{id});
  if (observed.artifact.state !== 'COMMITTED' || observed.artifact.digest !== artifactDigest) throw new Error('Artifact readback state mismatch');
  const destination=join(output,'downloaded'); await mkdir(destination,{recursive:true});
  const remoteNames=[];
  for(const {node} of observed.artifact.files.edges){
    if(!(node.name in hashes)) continue;
    const path=join(destination,node.name); await mkdir(resolve(path,'..'),{recursive:true});
    if(prior?.status==='download-verified'){
      const verifiedPath=join(resolve(process.argv[4]),'downloaded',node.name);
      if(digest(await readFile(verifiedPath))!==hashes[node.name])throw new Error('Prior fresh download changed');
      await copyFile(verifiedPath,path);
      entry.downloadReceiptSha256=receipt.recovery.priorReceiptSha256;
    }else await transfer(node.directUrl,path);
    if(digest(await readFile(path))!==hashes[node.name]) throw new Error('Fresh artifact bytes differ');
    remoteNames.push(node.name);
  }
  if(remoteNames.length!==names.length)throw new Error('Artifact files missing from readback');
  entry.status='download-verified'; entry.freshDownload=prior?.status!=='download-verified'; await checkpoint(); return entry;
}

async function use(id,runName,key){await transport.graphql('mutation($input:UseArtifactInput!){useArtifact(input:$input){artifact{id}}}',{input:{entityName:ENTITY,projectName:PROJECT_NAME,runName,artifactID:id}},{write:true,key});}

try {
  receipt.projectReadback=await ensurePrivateProject(transport,{createIfMissing:false});await checkpoint();
  const report=JSON.parse(await readFile(join(source,'report.json'),'utf8'));
  const bundle=JSON.parse(await readFile(join(source,'bundle.json'),'utf8'));
  for(const [name,expected]of Object.entries(bundle.sha256))if(digest(await readFile(join(source,name)))!==expected)throw new Error('Frozen bundle drift');
  const replay=JSON.parse(await readFile(join(source,'prediction-replay.json'),'utf8'));
  if(replay.matched!==report.rows)throw new Error('Fresh-process replay incomplete');
  const prep='voicing-data-v1', training='voicing-ranking-v1', verification='voicing-artifact-replay-v1';
  await createRun(prep,'GuitarSet observed voicings: frozen data and features','dataset-preparation',{experiment:'observed-voicing-ranking-v1',license:'CC-BY-4.0',publicDataset:true});
  const dataset=await artifact('tabtopitch-observed-voicings-v1','dataset',['examples.json','split-manifest.json','manifest.json'],prep);
  const features=await artifact('tabtopitch-voicing-features-v1','features',['features.npz','features.json'],prep);
  receipt.dataRun=await finishRun(prep,{rows:report.rows,recordings:report.recordings,candidateCoverage:report.candidateCoverage});await checkpoint();
  await createRun(training,'Observed voicing ranking: 18 held-out performer/progression folds','cross-validation',{experiment:'observed-voicing-ranking-v1',target:report.target,synthetic:false,productionPromotion:false});
  await use(dataset.id,training,'voicing-train-use-dataset');await use(features.id,training,'voicing-train-use-features');
  const model=await artifact('tabtopitch-voicing-ranker-v1','model',['model.json','report.json','predictions.json','bundle.json','source/benchmark.py','source/protocol.json'],training);
  const summary={rows:report.rows,recordings:report.recordings,folds:report.folds,shadowGatePassed:report.shadowGatePassed,productionPromotion:false};
  for(const[arm,values]of Object.entries(report.metrics))for(const[k,v]of Object.entries(values))summary[`${arm}/${k}`]=v;
  const models=JSON.parse(await readFile(join(source,'model.json'),'utf8')).folds;
  receipt.trainingRun=await finishRun(training,summary,Object.entries(models).map(([fold,m],i)=>({foldIndex:i,fold,trainingObjective:m.objective,optimizerIterations:m.iterations,trainingRows:m.trainingRows,testEvaluationOnly:true})));await checkpoint();
  await createRun(verification,'Fresh download and prediction replay','artifact-verification',{experiment:'observed-voicing-ranking-v1',freshDownload:true});
  for(const a of [dataset,features,model])await use(a.id,verification,`voicing-verify-use-${a.type}`);
  await new Promise((done,reject)=>{const child=spawn(resolve('ml/.venv/bin/python'),[resolve('research/voicing-ranking/verify.py'),'--bundle',join(output,'downloaded')],{stdio:['ignore','pipe','pipe']});child.stdout.resume();child.stderr.resume();child.on('error',reject);child.on('close',code=>code===0?done():reject(new Error('Downloaded model prediction replay failed')));});
  receipt.verificationRun=await finishRun(verification,{matchedPredictions:report.rows,downloadHashesMatch:true,productionPromotion:false});
  // Registry uses a restricted project in the team's organization, independently
  // read back before linking. This alias denotes research status, not promotion.
  const org=await transport.graphql('query($entity:String!){entity(name:$entity){organization{name orgEntity{name}}}}',{entity:ENTITY});
  const orgEntity=org.entity?.organization?.orgEntity?.name;
  if(!orgEntity)throw new Error('Registry organization unavailable');
  const registry='wandb-registry-TabToPitch Research';
  let reg=await transport.graphql('query($e:String!,$p:String!){project(entityName:$e,name:$p){id name access isRegistryProject}}',{e:orgEntity,p:registry});
  if(!reg.project){await transport.graphql('mutation($input:UpsertModelInput!){upsertModel(input:$input){project{id name access}}}',{input:{entityName:orgEntity,name:registry,access:'PRIVATE',description:'Private TabToPitch research candidates. No production deployment or learning efficacy claim.',allowAllArtifactTypesInRegistry:true}},{write:true,key:'voicing-create-private-registry'});reg=await transport.graphql('query($e:String!,$p:String!){project(entityName:$e,name:$p){id name access isRegistryProject}}',{e:orgEntity,p:registry});}
  if(reg.project?.access!=='PRIVATE'||!reg.project.isRegistryProject)throw new Error('Registry privacy or type mismatch');
  const linked=await transport.graphql('mutation($input:LinkArtifactInput!){linkArtifact(input:$input){artifactID artifactCollectionID versionIndex aliases{alias}}}',{input:{artifactID:model.id,artifactPortfolioName:'Observed voicing ranker',entityName:orgEntity,projectName:registry,aliases:[{artifactCollectionName:'Observed voicing ranker',alias:'research-candidate'}]}},{write:true,key:'voicing-registry-link'});
  receipt.registry={entity:orgEntity,project:registry,access:reg.project.access,...linked.linkArtifact};
  const regRead=await transport.graphql('query($e:String!,$p:String!,$a:String!){project(entityName:$e,name:$p){access artifact(name:$a){id digest}}}',{e:orgEntity,p:registry,a:'Observed voicing ranker:research-candidate'});
  if(regRead.project?.access!=='PRIVATE'||regRead.project.artifact?.id!==model.id)throw new Error('Registry alias readback mismatch');
  receipt.registry.aliasVerified=true;receipt.status='verified';
}catch(error){receipt.status='failed';receipt.error=error.message;process.exitCode=2;}finally{receipt.finishedAt=new Date().toISOString();await checkpoint();transport.close();console.log(JSON.stringify({status:receipt.status,error:receipt.error,artifacts:receipt.artifacts.map(a=>({name:a.qualifiedName,status:a.status})),trainingRun:receipt.trainingRun?.url}));}
