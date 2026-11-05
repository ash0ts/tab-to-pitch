from __future__ import annotations
import base64
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import threading
from .legacy import inspect_project
from .media import demo, excerpt, import_audio
from .processes import run_cancellable, ProcessCancelledError
from .store import Store, VERSION, digest, encoded

def reconcile(notes, duration):
    """Agreement is evidence, not truth. Same model on two inputs is one family."""
    for i,n in enumerate(notes):
        n['id']=f'n-{i}'
        n['authority']='model-hypothesis'
        n['start']=max(0,min(duration,float(n['start'])))
        n['end']=max(n['start'],min(duration,float(n['end'])))
        n['confidence']=None
        n['families']=sorted({other['family'] for other in notes
            if other['midi']==n['midi'] and abs(other['start']-n['start'])<=.05
            and min(other['end'],n['end'])>max(other['start'],n['start'])})
    return [n for n in notes if n['end']>n['start'] and 0<=n['midi']<=127]

class Worker:
    def __init__(self, store, stop=None):
        self.store=store
        self.stop=stop or threading.Event()
    def run_job(self, job):
        cancelled=lambda:self.stop.is_set() or self.store.job(job['id'])['status']=='cancelled'
        result={'schemaVersion':VERSION,'authority':'model-hypothesis','notes':[],'stems':[],
                'timing':None,'stages':[],'coverage':[{'start':0,'end':job['end']-job['start'],
                    'status':'possible-missing','reason':'Absence of a detection does not establish silence.'}],
                'calibration':None}
        with tempfile.TemporaryDirectory(dir=self.store.root/'tmp') as tmp:
            source=Path(tmp)/'excerpt.wav'
            excerpt(self.store,self.store.asset(job['assetId']),job['start'],job['end'],source,cancelled)
            sources=[('full',source)]
            ordered=[s for s in ('separate','transcribe','timing','corroborate') if s in job['stages']]
            for stage in ordered:
                if cancelled(): raise ProcessCancelledError()
                key=digest(encoded({'asset':job['assetId'],'start':job['start'],'end':job['end'],'stage':stage,'sources':[(n,digest(p.read_bytes())) for n,p in sources],'config':job['config']}).encode())
                cached=self.store.stage(key)
                if cached:
                    try:
                        for stem in cached.get('stems',[]): self.store.path(stem['artifact'])
                    except ValueError: cached=None
                if not cached:
                    if stage=='separate':
                        cached={'stems':[]}
                        for model,stems in [('htdemucs_ft',['vocals','bass','drums','other']),('htdemucs_6s',['guitar','piano','vocals','bass','drums','other'])]:
                            run=run_cancellable([sys.executable,'-m','demucs.separate','-n',model,
                                '-d','cpu','--float32','-o',tmp,str(source)],timeout=1800,cancelled=cancelled)
                            if run.returncode: raise RuntimeError('separation-unavailable')
                            for stem in stems:
                                data=(Path(tmp)/model/'excerpt'/f'{stem}.wav').read_bytes()
                                cached['stems'].append({'model':model,'part':stem,'artifact':self.store.put(data),'estimated':True})
                    else:
                        outputs=[]
                        for name,audio in sources if stage=='transcribe' else [('full',source)]:
                            target=Path(tmp)/f'{stage}-{name}.json'
                            run=run_cancellable([sys.executable,'-m','tabtopitch_audio.adapters',stage,str(audio),str(target)],
                                                timeout=1800,cancelled=cancelled)
                            if run.returncode:
                                (self.store.root/'tmp'/f"{job['id']}-{stage}.log").write_text(run.stderr[-16000:])
                                raise RuntimeError(f'{stage}-unavailable')
                            out=json.loads(target.read_text())
                            for note in out.get('notes',[]): note['pass']=name
                            outputs.append(out)
                        cached={'outputs':outputs}
                    self.store.stage(key,cached)
                result['stages'].append({'stage':stage,'fingerprint':key,'status':'completed'})
                if stage=='separate':
                    result['stems']=cached['stems']
                    for stem in cached['stems']:
                        if (stem['model'],stem['part']) in [('htdemucs_ft','bass'),('htdemucs_6s','guitar')]:
                            sources.append((stem['model']+'-'+stem['part'],self.store.path(stem['artifact'])))
                else:
                    for output in cached['outputs']:
                        result['notes'].extend(output.get('notes',[]))
                        if stage=='timing': result['timing']=output
                    result['stages'][-1]['identities']=[o['identity'] for o in cached['outputs']]
            result['notes']=reconcile(result['notes'],job['end']-job['start'])
        return result
    def loop(self):
        while not self.stop.is_set():
            job=self.store.claim()
            if not job:
                self.stop.wait(.2);continue
            try:
                self.store.finish(job['id'],self.run_job(job))
            except ProcessCancelledError:
                if not self.stop.is_set(): self.store.cancel(job['id'])
            except Exception as error:
                category=str(error)
                if category not in ('transcribe-unavailable','separation-unavailable','timing-unavailable','corroborate-unavailable'):
                    category='analysis-failed'
                self.store.finish(job['id'],error=category)

def main():
    store=Store(Path(os.environ.get('EAR_LAB_DATA_DIR','.local/audio')))
    # One owner per database; a second process must not reset live jobs.
    lock=(store.root/'worker.lock').open('a')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    store.recover()
    worker=Worker(store)
    signal.signal(signal.SIGTERM,lambda *_:worker.stop.set())
    thread=threading.Thread(target=worker.loop,daemon=True);thread.start()
    try:
        for line in sys.stdin:
            request={}
            try:
                request=json.loads(line)
                method,p=request['method'],request.get('params',{})
                if method=='health':
                    result={'enabled':True,'version':VERSION,'models':{name:importlib.util.find_spec(module) is not None
                        for name,module in [('transcribe','muscriptor'),('separate','demucs'),('timing','beat_this'),('corroborate','onnxruntime')]},
                        'researchMode':os.environ.get('EAR_LAB_RESEARCH_MODE')=='true'}
                elif method=='import': result=import_audio(store,base64.b64decode(p['data'],validate=True),p['permission'])
                elif method=='demo': result=demo(store)
                elif method=='import-project':
                    raw=base64.b64decode(p['data'],validate=True)
                    result=inspect_project(raw)
                    result['artifact']=store.put(raw)
                elif method=='submit': result=store.submit(p)
                elif method=='job': result=store.job(p['id'])
                elif method=='cancel': result=store.cancel(p['id'])
                elif method=='review': result=store.review(p)
                elif method=='reviews': result=store.reviews(p['id'])
                elif method=='artifact':
                    result={'data':base64.b64encode(store.path(p['id']).read_bytes()).decode()}
                else: raise ValueError('unknown-method')
                reply={'id':request['id'],'result':result}
            except Exception as error:
                safe=str(error) if isinstance(error,ValueError) and len(str(error))<100 else 'worker-request-failed'
                reply={'id':request.get('id'),'error':safe}
            print(encoded(reply),flush=True)
    finally:
        worker.stop.set();thread.join(timeout=10)

if __name__=='__main__': main()
