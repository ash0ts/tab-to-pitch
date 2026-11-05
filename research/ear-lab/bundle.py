"""Build an allowlisted publication bundle. No recordings, stems, or credentials."""
import argparse
import hashlib
import json
import math
from pathlib import Path

def read(p): return json.loads(p.read_text())
def write(p,value): p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,indent=2)+'\n')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def bundle(audio,teacher,out):
    out.mkdir(parents=True,exist_ok=False)
    manifest=read(audio/'manifest.json');report=read(audio/'report.json');model=read(audio/'model.json')
    rows=[read(p) for p in sorted((audio/'rows').glob('*.json'))]
    ids=[r['id'] for r in rows]
    if len(ids)!=len(set(ids)) or set(ids)!={f['id'] for f in manifest['fixtures']}:raise ValueError('membership mismatch')
    for name in ['manifest.json','model.json','report.json']:(out/name).write_bytes((audio/name).read_bytes())
    (out/'dataset-cards.md').write_bytes(Path('research/ear-lab/dataset-cards.md').read_bytes())
    for name in ['fit.py','analysis.py','protocol.json']:
        original=audio/'source/research/ear-lab'/name
        if sha(original)!=manifest['sources']['research/ear-lab/'+name]:raise ValueError('frozen source drift')
        target=out/'source'/name;target.parent.mkdir(exist_ok=True);target.write_bytes(original.read_bytes())
    features=[];predictions=[];analysis=[];table=[]
    for r in rows:
        analysis.append({k:r[k] for k in ['id','dataset','group','split','conditions','failures']})
        for f in r['features']:
            x=f['x'];z=model['intercept']+sum((v-model['mean'][i])/model['scale'][i]*model['coefficients'][i] for i,v in enumerate(x))
            p=1/(1+math.exp(-max(-700,min(700,z))))
            features.append({'id':r['id'],'group':r['group'],'split':r['split'],**f})
            predictions.append({'id':r['id'],'noteId':f['noteId'],'x':x,'p':p})
        for arm,c in r['conditions'].items():
            m=c['metrics'];table.append([r['id'],r['dataset'],r['split'],arm,m['notes'],m['referenceNotes'],m['precision'],m['recall'],m['f1'],m['offsetMatched'],m['pitchClassTimeIoU'],m['lowestPitchTimeAccuracy'],m['singleNotePlayableFraction']])
    write(out/'features.json',features);write(out/'predictions.json',predictions);write(out/'analysis.json',analysis)
    write(out/'audio.table.json',{'columns':['recording','dataset','split','condition','predicted_notes','reference_notes','precision','recall','note_f1','offset_matched','pitch_class_time_iou','lowest_pitch_time_accuracy','single_note_playable_fraction'],'data':table})
    c=read(teacher/'campaign.json');teacherrows=[]
    for r in c['rows']:
        calls=[q for q in c['requests'] if q['identity']==r['id']]
        cost=sum(q.get('costDollars',q['reservedDollars']) for q in calls)
        teacherrows.append([r['id'],r['arm'],r['suite'],r['request']['request'],r['request']['context']['ear'],r['output']['message'],r['output']['actions'],r.get('failure'),r['scores'],r['elapsedMs'],cost,'https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/'+r['traceId'] if r.get('traceId') else None])
    write(out/'teacher.table.json',{'columns':['case_id','actor','suite','question','verified_context','displayed_response','actions','failure','criteria','execution_ms','accounted_dollars','lens_trace'],'data':teacherrows})
    # The original invalid actor text is retained alongside the displayed fallback.
    write(out/'teacher-evidence.json',{'campaignSha256':sha(teacher/'campaign.json'),'rows':c['rows'],'requests':c['requests'],'rawResponses':[read(p) for p in sorted(teacher.glob('response-*.json'))],'weave':read(teacher/'publication/weave.json'),'lens':read(teacher/'publication/lens/lens-readback.json')})
    write(out/'bundle.json',{'version':'ear-lab-v1','sourceManifestSha256':sha(audio/'manifest.json'),'sourceCampaignSha256':sha(teacher/'campaign.json'),'sha256':{str(p.relative_to(out)):sha(p) for p in sorted(out.rglob('*')) if p.is_file()},'privacy':'Public-dataset derived annotations and authored evaluation contexts; no media or learner data.'})
    print(json.dumps({'recordings':len(rows),'predictions':len(predictions),'audioTableRows':len(table),'teacherTableRows':len(teacherrows)}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--audio',type=Path,required=True);p.add_argument('--teacher',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();bundle(a.audio,a.teacher,a.out)
