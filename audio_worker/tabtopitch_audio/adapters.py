"""Pinned model runners. Invoked in cancellable child processes, never in the HTTP turn."""
from __future__ import annotations
import hashlib
import importlib.metadata
import json
import os
import sys
from pathlib import Path

def fingerprint(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def transcribe(path):
    if os.environ.get('EAR_LAB_RESEARCH_MODE')!='true':
        raise RuntimeError('MuScriptor weights require an explicitly permitted research use')
    from muscriptor import TranscriptionModel
    from huggingface_hub import hf_hub_download
    token=os.environ.get('HF_TOKEN')
    checkpoint=Path(hf_hub_download(repo_id='MuScriptor/muscriptor-medium',filename='model.safetensors',token=token))
    hf_hub_download(repo_id='MuScriptor/muscriptor-medium',filename='config.json',token=token)
    if fingerprint(checkpoint)!='ac80adbdf85d87231735fd948af7013441c0afced316c4e9067fd5d8a7fb97ec' or fingerprint(checkpoint.parent/'config.json')!='43e13a70fc9ae0af36b7447c06f3eac2282daeb69d79c1ff840ede7fdaa26a3b':
        raise ValueError('MuScriptor baseline checkpoint changed')
    model=TranscriptionModel.load_model(checkpoint,device='cpu')
    events=list(model.transcribe(path,beam_size=1,use_sampling=False,cfg_coef=1.0,batch_size=1,prelude_forcing=True))
    notes=[]
    for event in events:
        if event.__class__.__name__=='NoteEndEvent':
            n=event.start_event
            notes.append({'midi':int(n.pitch),'start':float(n.start_time),
                          'end':max(float(event.end_time),float(n.start_time)+.001),
                          'instrument':str(n.instrument),'confidence':None,'family':'muscriptor'})
    return {'notes':notes,'identity':{'model':'muscriptor-medium','version':importlib.metadata.version('muscriptor'),
        'checkpoint':fingerprint(checkpoint),'config':fingerprint(checkpoint.parent/'config.json'),
        'device':'cpu','beam':1,'cfg':1,'prelude':True}}

def timing(path):
    from beat_this.inference import File2Beats
    beats,downbeats=File2Beats(checkpoint_path='final0',device='cpu',dbn=False)(str(path))
    return {'beats':[float(n) for n in beats],'downbeats':[float(n) for n in downbeats],
            'identity':{'model':'beat-this/final0','version':importlib.metadata.version('beat-this'),'device':'cpu'}}

def corroborate(path):
    import librosa
    import numpy as np
    import onnxruntime as ort
    from scipy.signal import argrelmax
    from .basic_pitch import BasicPitchDecoder
    checkpoint=Path(os.environ['EAR_LAB_BASIC_PITCH_CHECKPOINT'])
    if fingerprint(checkpoint)!=BasicPitchDecoder.MODEL_SHA256: raise ValueError('Basic Pitch checkpoint mismatch')
    session=ort.InferenceSession(str(checkpoint),providers=['CPUExecutionProvider'])
    audio,_=librosa.load(path,sr=22050,mono=True)
    frames,onsets=BasicPitchDecoder._infer(session,np.asarray(audio,dtype=np.float32),np)
    times=BasicPitchDecoder._frame_times(frames.shape[0],np)
    notes=[{'midi':int(p),'start':max(0,float(times[s])),
        'end':max(float(times[min(e,len(times)-1)]),float(times[s])+.001),
        'confidence':None,'activation':float(a),'instrument':'unknown','family':'basic-pitch'}
        for s,e,p,a in BasicPitchDecoder._events(frames,onsets,argrelmax,np)]
    return {'notes':notes,'identity':{'model':'basic-pitch','checkpoint':fingerprint(checkpoint),
        'source':BasicPitchDecoder.SOURCE_COMMIT,'providers':session.get_providers()}}

if __name__=='__main__':
    stage,source,output=sys.argv[1:]
    result={'transcribe':transcribe,'timing':timing,'corroborate':corroborate}[stage](Path(source))
    Path(output).write_text(json.dumps(result,allow_nan=False))
