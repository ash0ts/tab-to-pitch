"""Train-only normalization; independent recording groups; portable CPU artifact."""
import argparse
import json
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from analysis import write, file_hash
FEATURES=['duration','activation','activationMissing','independentAgreement','simultaneousDensity']
def probabilities(model,x):
    x=np.asarray(x,dtype=float)
    z=((x-np.asarray(model['mean']))/np.asarray(model['scale']))@np.asarray(model['coefficients'])+model['intercept']
    return 1/(1+np.exp(-np.clip(z,-700,700)))
def metrics(y,p):
    y=np.asarray(y);p=np.clip(np.asarray(p),1e-9,1-1e-9);chosen=p>=.8
    return {'n':len(y),'Brier':float(np.mean((p-y)**2)),'logLoss':float(np.mean(-(y*np.log(p)+(1-y)*np.log(1-p)))),
            'precisionAt0.8':float(np.mean(y[chosen])) if chosen.any() else None,'coverageAt0.8':float(np.mean(chosen))}
def fit(directory):
    rows=[json.loads(p.read_text()) for p in sorted((directory/'rows').glob('*.json'))]
    groups={s:{r['group'] for r in rows if r['split']==s} for s in ['train','calibration','test']}
    if any(groups[a]&groups[b] for a,b in [('train','test'),('train','calibration'),('test','calibration')]):raise ValueError('group-leakage')
    training=[f for r in rows if r['split']=='train' for f in r['features']]
    if not training or len({f['y'] for f in training})!=2:raise ValueError('insufficient-training-classes')
    x=np.asarray([f['x'] for f in training]);y=np.asarray([f['y'] for f in training])
    scaler=StandardScaler().fit(x)
    estimator=LogisticRegression(C=1,solver='lbfgs',max_iter=2000,random_state=8291).fit(scaler.transform(x),y)
    model={'version':'ear-reliability-v1','target':'reference-note-match-at-50ms','features':FEATURES,'mean':scaler.mean_.tolist(),'scale':scaler.scale_.tolist(),
           'coefficients':estimator.coef_[0].tolist(),'intercept':float(estimator.intercept_[0]),'researchOnly':True,'trainingGroups':sorted(groups['train'])}
    if not np.allclose(probabilities(model,x),estimator.predict_proba(scaler.transform(x))[:,1],rtol=1e-12,atol=1e-12):raise ValueError('portable-prediction-mismatch')
    evaluated=[]
    for r in rows:
        if not r['features']:continue
        x=[f['x'] for f in r['features']];y=[f['y'] for f in r['features']]
        p=probabilities(model,x);fixed=[.75 if f[3] else .5 if f[0]>=.15 else .25 for f in x]
        evaluated.append({'id':r['id'],'group':r['group'],'split':r['split'],'model':metrics(y,p),'fixed':metrics(y,fixed),
                          'probes':[{'x':f,'p':float(q)} for f,q in zip(x[:3],p[:3])]})
    summaries={}
    for split in ['train','calibration','test','regression']:
        selected=[r for r in evaluated if r['split']==split]
        summaries[split]={'recordings':len(selected),'notes':sum(r['model']['n'] for r in selected),'macro':{}}
        for arm in ['model','fixed']:
            summaries[split]['macro'][arm]={k:float(np.mean([r[arm][k] for r in selected if r[arm][k] is not None])) if any(r[arm][k] is not None for r in selected) else None for k in ['Brier','logLoss','precisionAt0.8','coverageAt0.8']}
    analyses={}
    for split in ['test','regression']:
        selected=[r for r in rows if r['split']==split]
        analyses[split]={arm:{'available':sum(arm in r['conditions'] for r in selected),'planned':len(selected),'macroF1':float(np.mean([r['conditions'][arm]['metrics']['f1'] for r in selected if arm in r['conditions']])) if any(arm in r['conditions'] for r in selected) else None} for arm in ['full','separated','reconciled','reference-ceiling']}
        paired=[r['conditions']['reconciled']['metrics']['f1']-r['conditions']['full']['metrics']['f1'] for r in selected if all(k in r['conditions'] for k in ['full','reconciled'])]
        rng=np.random.default_rng(8291)
        analyses[split]['pairedReconciledMinusFull']={'n':len(paired),'mean':float(np.mean(paired)) if paired else None,'bootstrap95':np.quantile([np.mean(rng.choice(paired,len(paired))) for _ in range(2000)],[.025,.975]).tolist() if paired else None}
    write(directory/'model.json',model)
    write(directory/'report.json',{'version':'ear-lab-v1','datasetManifestSha256':file_hash(directory/'manifest.json'),'modelSha256':file_hash(directory/'model.json'),
                                  'analysis':analyses,'reliability':summaries,'recordings':evaluated,'promotion':False,
                                  'limitations':['Small grouped local study; no learner outcomes.','No calibrated model in production.','Slakh and Guitar-TECHS are previously inspected regression material.','Instrument and technique classification not scored; physical metric is single-note only.']})
    print(json.dumps({'analysis':analyses,'reliability':summaries,'promotion':False},indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dir',type=Path,required=True);args=p.parse_args();fit(args.dir)
