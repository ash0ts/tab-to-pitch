"""Frozen local audio study. Never imports user recordings or historical predictions."""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import tempfile

APP = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(APP/'audio_worker'))
from tabtopitch_audio.store import Store, digest, encoded
from tabtopitch_audio.media import import_audio
from tabtopitch_audio.worker import Worker


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n');tmp.replace(path)

def file_hash(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda:stream.read(1024*1024),b''):h.update(data)
    return h.hexdigest()

def source_hashes():
    paths=[*Path(__file__).parent.glob('*.py'),Path(__file__).parent/'protocol.json',APP/'audio_worker/uv.lock',* (APP/'audio_worker/tabtopitch_audio').glob('*.py')]
    return {str(p.relative_to(APP)):file_hash(p) for p in sorted(paths)}

def jams_notes(path):
    result=[]
    for a in json.loads(path.read_text())['annotations']:
        if a['namespace']!='note_midi':continue
        for n in a['data']:
            if n['duration']>0: result.append({'midi':round(n['value']),'start':n['time'],'end':n['time']+n['duration']})
    return result

def midi_notes(path):
    import mido
    tempo=500000;t=0;active={};program={};notes=[];midi=mido.MidiFile(path)
    for msg in mido.merge_tracks(midi.tracks):
        t+=mido.tick2second(msg.time,midi.ticks_per_beat,tempo)
        if msg.type=='set_tempo':tempo=msg.tempo
        if msg.type=='program_change':program[msg.channel]=msg.program
        if msg.type=='note_on' and msg.velocity and msg.channel!=9:
            active.setdefault((msg.channel,msg.note),[]).append(t)
        elif msg.type in ('note_off','note_on') and msg.channel!=9:
            starts=active.get((msg.channel,msg.note),[])
            if starts:
                start=starts.pop(0)
                if t>start:notes.append({'midi':msg.note,'start':start,'end':t})
    return notes

def freeze(root,out):
    if (out/'manifest.json').exists():raise ValueError('manifest-already-frozen')
    prior=[];hist=[]
    for p in sorted((root/'.toraneko-eval').glob('*manifest.json')):
        d=json.loads(p.read_text());prior.extend(d.get('fixtures',[]));hist.append({'file':p.name,'sha256':file_hash(p)})
    seen={f['audio_relpath'] for f in prior if f.get('audio_relpath')}
    fixtures=[];exclusions=[]
    def add(dataset,audio,reference,group,split,notes,reference_kind):
        rel=str(audio.relative_to(root))
        if split!='regression' and rel in seen:return False
        start=2;end=8
        clipped=[{**n,'start':max(0,n['start']-start),'end':min(6,n['end']-start)} for n in notes if n['start']>=start and n['start']<end and n['end']>n['start']]
        if not clipped:return False
        key=dataset+':'+(audio.parent.name if dataset=='slakh2100' else audio.stem)
        fixtures.append({'id':key,'dataset':dataset,'audio':rel,'reference':str(reference.relative_to(root)),
            'audioSha256':file_hash(audio),'referenceSha256':file_hash(reference),'group':group,'split':split,
            'start':start,'end':end,'notes':clipped,'referenceKind':reference_kind,'priorInspected':split=='regression'})
        return True
    errata={'04_BN3-154-E_comp','04_Jazz1-200-B_comp','02_Funk2-119-G_comp'}
    for split,people in [('train',['00','01']),('calibration',['02','03']),('test',['04','05'])]:
        for person in people:
            found=False
            for ref in sorted((root/'guitarset/extracted').glob(person+'_*_comp.jams')):
                if ref.stem in errata:continue
                audio=ref.with_name(ref.stem+'_mic.wav')
                if audio.exists() and add('guitarset',audio,ref,'guitarset-performer:'+person,split,jams_notes(ref),'recorded-hexaphonic-note-annotations'):
                    found=True;break
            if not found:exclusions.append({'dataset':'guitarset','group':person,'reason':'no-uninspected-recording'})
    metadata=list(csv.DictReader((root/'gaps/metadata.csv').open()))
    used=set()
    for split in ['train','calibration','test']:
        count=0
        for row in metadata:
            person=row['performer_id']
            if person in used:continue
            audio=root/'gaps/audio'/f"{row['id']}.wav";ref=root/'gaps/references'/f"{row['id']}.mid"
            if audio.exists() and ref.exists() and str(audio.relative_to(root)) not in seen:
                if add('gaps',audio,ref,'gaps-performer:'+digest(person.encode())[:12],split,midi_notes(ref),'dataset-aligned-midi'):
                    used.add(person);count+=1
                    if count==2:break
        if count<2:exclusions.append({'dataset':'gaps','split':split,'reason':'insufficient-uninspected-performer-groups'})
    for dataset in ['guitar-techs','slakh2100']:
        used_audio=set()
        for f in prior:
            if f['dataset']!=dataset or not f.get('reference_relpath') or f['audio_relpath'] in used_audio:continue
            audio=root/f['audio_relpath'];ref=root/f['reference_relpath']
            if not audio.exists() or not ref.exists():continue
            notes=[{'midi':n['pitch'],'start':n['onset_seconds'],'end':n['offset_seconds']} for n in json.loads(ref.read_text())['notes'] if n.get('instrument')!='drums']
            if add(dataset,audio,ref,dataset+':'+f['song_id'],'regression',notes,'historical-reference-adapter; notes only'):
                used_audio.add(f['audio_relpath'])
                if len(used_audio)==2:break
        exclusions.append({'dataset':dataset,'reason':'available recording groups previously inspected; regression only'})
    if len({f['id'] for f in fixtures})!=len(fixtures):raise ValueError('duplicate-recording-identity')
    sources=source_hashes()
    write(out/'manifest.json',{'version':'ear-lab-v1','createdAt':time.time(),'sources':sources,'history':hist,'fixtures':fixtures,'exclusions':exclusions,'upstreamTrainingOverlap':'unknown'})
    print(json.dumps({'frozen':len(fixtures),'splits':{s:sum(f['split']==s for f in fixtures) for s in ['train','calibration','test','regression']},'exclusions':exclusions}))

def match(pred,ref,offset=False):
    from scipy.optimize import linear_sum_assignment
    import numpy as np
    if not pred or not ref:return []
    # Every valid edge is cheaper than every invalid one; one-to-one assignment maximizes matches.
    costs=np.full((len(pred),len(ref)),1e6)
    for i,p in enumerate(pred):
        for j,r in enumerate(ref):
            if p['midi']==r['midi'] and abs(p['start']-r['start'])<=.05 and (not offset or abs(p['end']-r['end'])<=max(.05,.2*(r['end']-r['start']))):costs[i,j]=abs(p['start']-r['start'])
    a,b=linear_sum_assignment(costs)
    return [(int(i),int(j)) for i,j in zip(a,b) if costs[i,j]<1]

def scores(pred,ref):
    pairs=match(pred,ref);tp=len(pairs);precision=tp/len(pred) if pred else 0;recall=tp/len(ref) if ref else 0
    overlap=[];bass=[]
    for step in range(60):
        t=(step+.5)/10
        p={n['midi'] for n in pred if n['start']<=t<n['end']};r={n['midi'] for n in ref if n['start']<=t<n['end']}
        if not r:continue
        pc={n%12 for n in p};rc={n%12 for n in r};overlap.append(len(pc&rc)/len(pc|rc));bass.append(bool(p) and min(p)==min(r))
    return {'notes':len(pred),'referenceNotes':len(ref),'matched':tp,'precision':precision,'recall':recall,'f1':2*precision*recall/(precision+recall) if tp else 0,
            'offsetMatched':len(match(pred,ref,True)),'pitchClassTimeIoU':sum(overlap)/len(overlap) if overlap else None,
            'lowestPitchTimeAccuracy':sum(bass)/len(bass) if bass else None,'singleNotePlayableFraction':sum(40<=p['midi']<=88 for p in pred)/len(pred) if pred else None}

def reconcile_candidates(notes):
    candidates=[]
    for n in notes:
        if n['family']!='muscriptor':continue
        duplicate=next((p for p in candidates if p['midi']==n['midi'] and abs(p['start']-n['start'])<=.05),None)
        if duplicate is None:candidates.append(n)
    return candidates

def features(notes):
    return [[n['end']-n['start'],n.get('activation',0),int('activation' not in n),int(len(n.get('families',[]))>=2),sum(p['start']<=n['start']<p['end'] for p in notes)] for n in notes]

def run(root,out):
    manifest=json.loads((out/'manifest.json').read_text())
    if manifest['sources']!=source_hashes():raise ValueError('frozen-source-drift')
    if len({f['id'] for f in manifest['fixtures']})!=len(manifest['fixtures']):raise ValueError('duplicate-recording-identity')
    store=Store(out/'worker');worker=Worker(store)
    for fixture in manifest['fixtures']:
        path=out/'rows'/(digest(fixture['id'].encode())[:16]+'.json')
        if path.exists():continue # completed receipt is immutable, including failed stages
        audio=root/fixture['audio'];ref=root/fixture['reference']
        if file_hash(audio)!=fixture['audioSha256'] or file_hash(ref)!=fixture['referenceSha256']:raise ValueError('dataset-drift')
        from tabtopitch_audio.processes import run_cancellable
        with tempfile.TemporaryDirectory() as temporary:
            excerpt=Path(temporary)/'source.wav'
            decoded=run_cancellable(['ffmpeg','-v','error','-nostdin','-protocol_whitelist','file,pipe','-ss',str(fixture['start']),'-i',str(audio),'-t',str(fixture['end']-fixture['start']),'-vn','-ac','2','-ar','44100','-c:a','pcm_s16le','-y',str(excerpt)],timeout=60)
            if decoded.returncode:raise ValueError('dataset-excerpt-decode-failed')
            asset=import_audio(store,excerpt.read_bytes(),'permission')
        row={'id':fixture['id'],'dataset':fixture['dataset'],'group':fixture['group'],'split':fixture['split'],'conditions':{},'failures':[],'features':[]}
        for condition,stages in [('full',['transcribe']),('separated',['separate','transcribe','corroborate'])]:
            job=store.submit({'assetId':asset['id'],'start':0,'end':fixture['end']-fixture['start'],'stages':stages,'contextRevision':fixture['id']+':'+condition})
            if job['status']=='queued':
                claimed=store.claim()
                if not claimed or claimed['id']!=job['id']:raise ValueError('unexpected-job-claim')
            started=time.monotonic()
            if job['status'] in ('queued','running'):
                try:store.finish(job['id'],worker.run_job(job))
                except Exception as error:store.finish(job['id'],error=str(error))
            job=store.job(job['id']);elapsed=time.monotonic()-started
            write(out/'jobs'/(job['id']+'.json'),job)
            if job['status']!='completed':row['failures'].append({'condition':condition,'status':job['status'],'error':job['error'],'elapsedSeconds':elapsed});continue
            notes=job['result']['notes']
            selected=[n for n in notes if n['family']=='muscriptor' and (n['pass']=='full' if condition=='full' else n['pass']!='full')]
            row['conditions'][condition]={'metrics':scores(selected,fixture['notes']),'notes':selected,'elapsedSeconds':elapsed,'jobId':job['id']}
            if condition=='separated':
                reconciled=reconcile_candidates(notes)
                row['conditions']['reconciled']={'metrics':scores(reconciled,fixture['notes']),'notes':reconciled,'elapsedSeconds':elapsed,'jobId':job['id']}
                matched={i for i,_ in match(reconciled,fixture['notes'])}
                row['features']=[{'x':x,'y':int(i in matched),'noteId':reconciled[i]['id']} for i,x in enumerate(features(reconciled))]
        row['conditions']['reference-ceiling']={'metrics':scores(fixture['notes'],fixture['notes']),'notes':fixture['notes'],'elapsedSeconds':0}
        write(path,row);print(json.dumps({'id':row['id'],'conditions':{k:v['metrics']['f1'] for k,v in row['conditions'].items()},'failures':row['failures']}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['freeze','run']);p.add_argument('--datasets',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    {'freeze':freeze,'run':run}[a.command](a.datasets,a.out)
