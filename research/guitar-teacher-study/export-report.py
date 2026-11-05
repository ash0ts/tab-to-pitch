"""Export reconciled evidence for the report. No model calls and no raw provider reasoning."""
from collections import Counter
import hashlib
import json
import shutil
import sys
from pathlib import Path

root=Path(sys.argv[1]); dest=Path('public/research/guitar-teacher')
c=json.loads((root/'campaign.json').read_text()); m=json.loads((root/'manifest.json').read_text())
a=json.loads((root/'analysis.json').read_text())
if c['status']!='execution-complete': raise ValueError('Unfinished execution')
publications={arm:json.loads((root/'publication'/f'weave-{arm}.json').read_text()) for arm in ['local','current','evidence-first','critic']}
table=json.loads((root/'publication/comparison/receipt.json').read_text())
lens=json.loads((root/'publication/lens/lens-readback.json').read_text())
lens_detail=json.loads((root/'publication/lens-detail/receipt.json').read_text())
if not all(p['status']=='verified' for p in [*publications.values(),table,lens_detail]) or not lens['verified']: raise ValueError('Unverified publication')
base='https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/'

def attempted_replies(row):
    values=[]
    for q in c['requests']:
        if q['identity']!=row['id'] or q['kind']!='actor': continue
        raw=root/f'response-{q["sequence"]}.json'
        if not raw.exists(): continue
        try:
            message=json.loads(raw.read_text())['choices'][0]['message']
            candidates=[t['function']['arguments'] for t in message.get('tool_calls') or [] if t['function']['name']=='teacher_step']
            if message.get('content'): candidates.append(message['content'])
            for text in candidates:
                try:
                    value=json.loads(text)
                    if value.get('kind')=='final' and value.get('message'):
                        values.append({'message':value['message'],'actions':value.get('actions'),'claims':value.get('claims'),'requestSequence':q['sequence']})
                except (ValueError,TypeError):
                    values.append({'malformed':True,'requestSequence':q['sequence'],'content':text})
        except (ValueError,KeyError,TypeError): pass
    return values

cases=[]
for t in m['cases']:
    rows=[]
    for r in c['rows']:
        if r['taskId']!=t['id']: continue
        rows.append({**{k:r[k] for k in ['id','arm','trial','failure','elapsedMs','scores','resolved']},
                     'message':r['output']['message'],'actions':r['output']['actions'],
                     'review':r.get('review'),'attemptedReplies':attempted_replies(r),
                     'actorCalls':sum(x['role']=='actor' for x in r['calls']),
                     'criticCalls':sum(x['role']=='critic' for x in r['calls']),
                     'tools':[x['name'] for x in r['tools']],
                     'lensUrl':base+r['traceId'] if r.get('traceId') else None})
    cases.append({'id':t['id'],'kind':t['kind'],'passage':t['passage'],'request':t['request']['request'],'rows':rows})
critic=[{**{k:r[k] for k in ['fixtureId','kind','expectedApproved','prose','output','failure','correct']},'lensUrl':base+r['traceId']} for r in c['criticRows']]
dev=[]
for path in sorted(root.parent.glob('guitar-teacher-development-00[123]/campaign.json')):
    previous=json.loads(path.read_text());dev.append({'run':path.parent.name,'calls':len(previous['requests']),
        'cost':sum(q.get('costDollars',q['reservedDollars']) for q in previous['requests']),
        'manifestSha256':previous['manifestSha256'],'status':previous['status']})
local_choice=json.loads((root.parent/'guitar-teacher-local-choice-002/results.json').read_text())
tool_use={arm:dict(Counter(t['name'] for r in c['rows'] if r['arm']==arm for t in r['tools'])) for arm in ['current','evidence-first']}
result={'toolUse':tool_use,'localChoice':local_choice['summary'],'protocol':c['protocol'],'analysis':a,'cases':cases,'critic':critic,
        'publications':{k:{'url':v['url'],'verification':v['verification'],'datasetRef':v['datasetRef'],'publicationRecovery':v.get('publicationRecovery')} for k,v in publications.items()},
        'table':{k:table[k] for k in ['url','rows','sha256','readback','publicationRecovery']},
        'readback':{'parentsAndNamesMatch':lens_detail['parentsAndNamesMatch'],'usageMatchesProviderReceipts':lens_detail['usageMatchesProviderReceipts'],'conversations':len(lens['conversationIds']),'spans':lens['observedSpans'],'rows':sum(p['verification']['rows'] for p in publications.values()),'weaveCalls':sum(p['verification']['calls'] for p in publications.values())},
        'development':{'runs':dev,'calls':sum(d['calls'] for d in dev),'cost':sum(d['cost'] for d in dev)},
        'frozen':{'manifestSha256':c['manifestSha256'],'sourceRevision':m['revision'],'hashes':m['hashes'],'prompts':m['prompts'],
                  'inference':m['inference'],'createdAt':m['createdAt'],'completedAt':c['completedAt']},
        'scope':'Symbolic tool-use experiment on real recording annotations; authored learner requests; no learning outcomes.'}
dest.mkdir(parents=True,exist_ok=True)
(dest/'results.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
shutil.copy(root/'source/research/guitar-teacher-study/protocol.md',dest/'protocol.md')
shutil.copy('research/guitar-teacher-study/data/manifest.json',dest/'dataset-manifest.json')
for name in ['passages.json','exclusions.json']:
    shutil.copy(Path('research/guitar-teacher-study/data')/name,dest/name)
shutil.copy(root.parent/'guitar-teacher-local-choice-002/results.json',dest/'local-choice.json')
# Full response records support independent score replay. Exclude raw provider reasoning and local paths.
evidence={'manifest':{k:m[k] for k in ['protocol','split','cases','criticFixtures','trials','inference','prompts','hashes','revision']},
          'campaign':{k:c[k] for k in ['protocol','split','status','manifestSha256','rows','criticRows','engineCeiling']}}
(dest/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False)+'\n')
summary={'arms':{k:{n:v[n] for n in ['primarySuccesses','executed','productDeliveryIncludingFallback','taskSlices']} for k,v in a['arms'].items()},'paired':a['paired'],'engine':a['engineCeiling'],'critic':a['critic'],'calls':a['accounting']['calls'],'tableUrl':table['url'],'weaveUrl':publications['evidence-first']['url'],'lensUrl':next(r['lensUrl'] for case in cases for r in case['rows'] if r['failure'] and r['lensUrl'])}
Path('src/studio/guitar-teacher-results.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'cases':len(cases),'rows':sum(len(t['rows']) for t in cases),'critics':len(critic),'resultsSha256':hashlib.sha256((dest/'results.json').read_bytes()).hexdigest(),'development':result['development']}))
