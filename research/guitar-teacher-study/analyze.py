"""Frozen recording-cluster aggregation. Run on retained outcomes, never make inference calls."""
import hashlib
import json
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

def mean(xs):
    return statistics.mean(xs) if xs else None

def percentile(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs)-1, int((len(xs)-1)*p))] if xs else None

def analyze(root):
    campaign = json.loads((root/'campaign.json').read_text())
    manifest = json.loads((root/'manifest.json').read_text())
    cases = {c['id']: c for c in manifest['cases']}
    arms = {}
    for arm in ['local', 'current', 'evidence-first']:
        rows = [r for r in campaign['rows'] if r['arm'] == arm]
        expected = len(cases) * (1 if arm == 'local' else manifest['trials'])
        grouped = defaultdict(list)
        for r in rows:
            grouped[r['recording']].append(int(r['scores']['requestedActionDelivered'] if arm == 'local' else r['scores']['actorDelivered']))
        arms[arm] = {'executed': len(rows), 'planned': expected, 'unexecuted': expected-len(rows),
                     'recordingMacroPrimary': mean([mean(v) for v in grouped.values()]),
                     'primarySuccesses': sum(sum(v) for v in grouped.values()),
                     'productDeliveryIncludingFallback': sum(r['scores']['requestedActionDelivered'] for r in rows),
                     'hostedReplies': sum(r['scores']['hostedReply'] for r in rows),
                     'fallbacks': sum(r['scores']['fallback'] for r in rows),
                     'selectedToolCalls': sum(r['scores']['selectedToolCount'] for r in rows),
                     'failureReasons': dict(Counter(r['failure'] for r in rows if r['failure'])),
                     'latencyMedianMs': percentile([r['elapsedMs'] for r in rows], .5),
                     'latencyP95Ms': percentile([r['elapsedMs'] for r in rows], .95),
                     'taskSlices': {kind: {'n': len(s), 'delivered': sum(r['scores']['requestedActionDelivered'] if arm == 'local' else r['scores']['actorDelivered'] for r in s)}
                                    for kind in ['role', 'move'] if (s := [r for r in rows if cases[r['taskId']]['kind'] == kind])},
                     'recordingMeans': {k:mean(v) for k,v in grouped.items()}}
    paired = []
    a,b = arms['current']['recordingMeans'],arms['evidence-first']['recordingMeans']
    for key in sorted(a.keys() & b.keys()): paired.append((key,b[key]-a[key]))
    differences = [d for _,d in paired]
    rng=random.Random(20261105)
    draws=[mean(rng.choices(differences,k=len(differences))) for _ in range(10000)] if differences else []
    pair_keys = lambda r:(r['taskId'],r['trial'])
    current={pair_keys(r):r for r in campaign['rows'] if r['arm']=='current'}
    treatment={pair_keys(r):r for r in campaign['rows'] if r['arm']=='evidence-first'}
    outcomes=Counter()
    for key in current.keys() & treatment.keys():
        x,y=current[key]['scores']['actorDelivered'],treatment[key]['scores']['actorDelivered']
        outcomes['both' if x and y else 'treatment-only' if y else 'current-only' if x else 'neither']+=1
    slices=defaultdict(list)
    for recording,difference in paired:
        c=next(c for c in cases.values() if c['passage']['recording']==recording)
        slices[c['passage']['performer']+':'+c['passage']['family']].append(difference)
    reviews=campaign['criticRows']; valid=[r for r in reviews if r['output'] is not None]
    wrong=[r for r in reviews if not r['expectedApproved']];good=[r for r in reviews if r['expectedApproved']]
    report={'protocol':campaign['protocol'],'split':campaign['split'],'executionStatus':campaign['status'],
            'sourceManifestSha256':hashlib.sha256((root/'manifest.json').read_bytes()).hexdigest(),
            'arms':arms,'paired':{'recordings':len(paired),'difference':mean(differences),
            'recordingBootstrap95':[percentile(draws,.025),percentile(draws,.975)],'checkpointTrialOutcomes':dict(outcomes),
            'performerFamilyDifferences':{k:mean(v) for k,v in slices.items()}},
            'engineCeiling':{'successes':sum(r['scores']['requestedActionDelivered'] for r in campaign['engineCeiling']),'n':len(campaign['engineCeiling'])},
            'critic':{'executed':len(reviews),'planned':len(manifest['criticFixtures']),'validReviews':len(valid),'correct':sum(r['correct'] for r in reviews),
                      'unsupportedDetected':sum(r['output'] is not None and not r['output']['approved'] for r in wrong),'unsupportedTotal':len(wrong),
                      'correctAccepted':sum(r['output'] is not None and r['output']['approved'] for r in good),'correctTotal':len(good),
                      'byKind':{kind:{'n':len(s),'correct':sum(r['correct'] for r in s),'unavailable':sum(r['output'] is None for r in s)} for kind in ['correct','wrong-role','wrong-position','invented-playing'] if (s:=[r for r in reviews if r['kind']==kind])}},
            'accounting':{'calls':len(campaign['requests']),'usageUSD':sum(r.get('costDollars',r['reservedDollars']) for r in campaign['requests']),
                          'unknownUsage':sum(not r.get('usage') for r in campaign['requests'])},
            'limits':['Symbolic annotated music and authored learner requests; no auditory perception or learner-effectiveness result.',
                      'Primary checks executable artifacts; unstructured prose has no qualified quality grade.',
                      'Only three evaluation performers and two progression families; recording bootstrap is conditional on this cohort.',
                      'Current and evidence-first use the same unqualified 20B runtime critic. Rejections count as actor failures; the critic diagnostic is separate.']}
    (root/'analysis.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='arms'},indent=2))
    print(json.dumps({a:{k:v for k,v in r.items() if k!='recordingMeans'} for a,r in arms.items()},indent=2))

if __name__=='__main__': analyze(Path(sys.argv[1]))
