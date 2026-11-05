from __future__ import annotations
import io
import json
import math
import struct
import tempfile
import wave
from pathlib import Path
from .processes import run_cancellable
from .store import VERSION

MAX_BYTES = 32 * 1024 * 1024

def inspect(path: Path):
    result = run_cancellable(['ffprobe','-v','error','-protocol_whitelist','file,pipe',
        '-show_entries','format=duration:stream=codec_type,sample_rate,channels',
        '-of','json',str(path)],timeout=20)
    if result.returncode: raise ValueError('unreadable-audio')
    data=json.loads(result.stdout)
    streams=data.get('streams',[])
    duration=float(data.get('format',{}).get('duration',0))
    if not math.isfinite(duration) or not 0<duration<=600 or any(s['codec_type']!='audio' for s in streams):
        raise ValueError('audio-must-be-at-most-ten-minutes-without-video')
    if len(streams)!=1 or not 1<=int(streams[0].get('channels',0))<=2:
        raise ValueError('mono-or-stereo-audio-required')
    return duration

def import_audio(store, data: bytes, permission: str):
    if permission not in ('owned','permission','public-domain'): raise ValueError('source-permission-required')
    if not 0<len(data)<=MAX_BYTES: raise ValueError('audio-size-limit')
    with tempfile.TemporaryDirectory(dir=store.root/'tmp') as tmp:
        source=Path(tmp)/'source'
        source.write_bytes(data)
        duration=inspect(source)
    key=store.put(data)
    return store.save_asset({'schemaVersion':VERSION,'id':key,'duration':duration,
        'permission':permission,'recordingId':key,'origin':'upload'})

def excerpt(store, asset, start, end, output, cancelled):
    result=run_cancellable(['ffmpeg','-v','error','-nostdin','-protocol_whitelist','file,pipe',
        '-ss',str(start),'-i',str(store.path(asset['id'])),'-t',str(end-start),'-vn',
        '-ac','2','-ar','44100','-c:a','pcm_s16le','-y',str(output)],
        timeout=60,cancelled=cancelled)
    if result.returncode: raise ValueError('audio-decode-failed')

def demo(store):
    """Original synthesized G7 → Cmaj7, with a separate authored score reference."""
    sr=22050
    notes=[(43,0,4),(55,0,4),(59,0,4),(62,0,4),(65,0,4),
           (48,4,8),(55,4,8),(59,4,8),(64,4,8),(67,4,8)]
    frames=bytearray()
    for i in range(8*sr):
        t=i/sr
        values=[]
        for pitch,start,end in notes:
            if start<=t<end:
                phase=t-start
                envelope=min(1,phase/.02)*min(1,(end-t)/.12)*math.exp(-.3*phase)
                f=440*2**((pitch-69)/12)
                values.append(envelope*(math.sin(2*math.pi*f*phase)+.2*math.sin(4*math.pi*f*phase)))
        frames.extend(struct.pack('<h',int(4200*sum(values))))
    stream=io.BytesIO()
    with wave.open(stream,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(sr);wav.writeframes(frames)
    key=store.put(stream.getvalue())
    record=store.save_asset({'schemaVersion':VERSION,'id':key,'recordingId':key,
        'duration':8.0,'permission':'public-domain','origin':'authored'})
    reference={'schemaVersion':VERSION,'authority':'independent-reference','provenance':'authored-g7-cmaj7-v1',
        'assetId':key,'chords':[{'symbol':'G7','start':0,'end':4},{'symbol':'Cmaj7','start':4,'end':8}],
        'notes':[{'id':f'ref-{i}','midi':p,'start':s,'end':e,'instrument':'authored-guitar',
                  'authority':'independent-reference','confidence':None,'family':'authored'} for i,(p,s,e) in enumerate(notes)]}
    return {'asset':record,'reference':reference}
