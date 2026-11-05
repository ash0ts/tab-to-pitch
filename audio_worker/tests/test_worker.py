import json
import tempfile
import threading
import unittest
from pathlib import Path
from tabtopitch_audio.store import Store
from tabtopitch_audio.media import demo, import_audio
from tabtopitch_audio.worker import Worker, reconcile
from tabtopitch_audio.processes import run_cancellable, ProcessCancelledError

class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(Path(self.tmp.name))
        self.example=demo(self.store)
    def tearDown(self): self.tmp.cleanup()
    def request(self,**kw):
        return dict(assetId=self.example['asset']['id'],start=0,end=8,stages=['timing'],contextRevision='revision-1',**kw)
    def test_demo_has_real_audio_and_separate_reference(self):
        asset=self.example['asset']
        self.assertEqual(asset['origin'],'authored')
        self.assertEqual(self.store.path(asset['id']).read_bytes()[:4],b'RIFF')
        self.assertNotIn('notes',asset)
        self.assertEqual(self.example['reference']['chords'][0]['symbol'],'G7')
    def test_import_rejects_non_audio_and_ungranted_permission(self):
        with self.assertRaises(ValueError): import_audio(self.store,b'not audio','owned')
        with self.assertRaises(ValueError): import_audio(self.store,b'not audio','unknown')
    def test_idempotent_jobs_and_atomic_claim(self):
        request=self.request(); a=self.store.submit(request);b=self.store.submit(request)
        self.assertEqual(a['id'],b['id'])
        claimed=[]
        threads=[threading.Thread(target=lambda:claimed.append(self.store.claim())) for _ in range(4)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(sum(c is not None for c in claimed),1)
    def test_cancel_cannot_be_overwritten_by_completion(self):
        job=self.store.submit(self.request());self.store.claim()
        self.store.cancel(job['id']);self.store.finish(job['id'],{'notes':[]})
        self.assertEqual(self.store.job(job['id'])['status'],'cancelled')
    def test_recovery_requeues_interrupted_job(self):
        job=self.store.submit(self.request());self.store.claim();self.store.recover()
        self.assertEqual(self.store.job(job['id'])['status'],'queued')
    def test_invalid_ranges_and_traversal(self):
        for patch in [{'start':-1},{'end':9},{'end':float('nan')},{'stages':['timing','timing']}]:
            request=self.request();request.update(patch)
            with self.assertRaises(ValueError):self.store.submit(request)
        with self.assertRaises(ValueError):self.store.path('../../private')
    def test_correlated_agreement_does_not_become_authority(self):
        a={'midi':65,'start':0,'end':1,'family':'muscriptor','confidence':.99}
        notes=reconcile([a.copy(),a.copy(),{**a,'family':'basic-pitch'}],8)
        self.assertEqual(notes[0]['families'],['basic-pitch','muscriptor'])
        self.assertIsNone(notes[0]['confidence'])
        self.assertEqual(notes[0]['authority'],'model-hypothesis')
    def test_immutable_review_requires_actual_hypothesis_and_revision(self):
        job=self.store.submit(self.request());self.store.claim()
        self.store.finish(job['id'],{'notes':[{'id':'n1','midi':65}]})
        request={'jobId':job['id'],'contextRevision':'revision-1','decisions':[{'noteId':'n1','decision':'replace','midi':64}]}
        before=self.store.job(job['id'])
        one=self.store.review(request);two=self.store.review(request)
        self.assertNotEqual(one['id'],two['id'])
        self.assertEqual(one['authority'],'learner-confirmed')
        self.assertEqual(self.store.job(job['id']),before)
        self.assertEqual([r['id'] for r in self.store.reviews(job['id'])],[one['id'],two['id']])
        with self.assertRaises(ValueError):self.store.review({**request,'contextRevision':'stale'})
        with self.assertRaises(ValueError):self.store.review({**request,'decisions':[{'noteId':'invented','decision':'accept'}]})
    def test_legacy_import_preserves_unresolved_references(self):
        from tabtopitch_audio.legacy import inspect_project
        raw=json.dumps({'schema_version':'2.7.0','source_asset_hash':'missing','source_notes':[{'pitch':65}],'file':'/private/no-access'}).encode()
        result=inspect_project(raw)
        self.assertEqual(result['unresolvedReferences']['source_asset_hash'],'missing')
        self.assertEqual(result['referenceAuthority'],'unestablished')
        self.assertNotIn('file',result)
        with self.assertRaises(ValueError):inspect_project(b'{"schema_version":"99"}')

    def test_subprocess_cancellation(self):
        import sys
        with self.assertRaises(ProcessCancelledError):
            run_cancellable([sys.executable,'-c','import time;time.sleep(10)'],timeout=20,cancelled=lambda:True)
if __name__=='__main__':unittest.main()
