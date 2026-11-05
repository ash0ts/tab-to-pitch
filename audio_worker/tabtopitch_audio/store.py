"""Local SQLite/CAS. Public records contain no local paths or filenames."""
from __future__ import annotations
from contextlib import contextmanager
import hashlib
import json
import math
import sqlite3
import time
import uuid
from pathlib import Path

VERSION = 'ear-lab-v1'
STAGES = ('transcribe', 'separate', 'timing', 'corroborate')
BASELINE = {'muscriptor': '302343e8992bdfc619f77f1988168374ed5d675d', 'size': 'medium',
            'beam': 1, 'sampling': False, 'cfg': 1.0, 'batch': 1, 'prelude': True,
            'demucs': '4.0.1', 'separators': ['htdemucs_ft', 'htdemucs_6s'],
            'beat_this': '1.1.0', 'device': 'cpu', 'evidence': 'uncalibrated-v1'}

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def encoded(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)

class Store:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        (self.root/'cas').mkdir(exist_ok=True)
        (self.root/'tmp').mkdir(exist_ok=True)
        with self.db() as db:
            db.executescript('''PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE NOT NULL,
              status TEXT NOT NULL, data TEXT NOT NULL, result TEXT, error TEXT, updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, job TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS stages(fingerprint TEXT PRIMARY KEY, data TEXT NOT NULL);
            ''')
    @contextmanager
    def db(self):
        db = sqlite3.connect(self.root/'audio.sqlite', timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()
    def put(self, data: bytes) -> str:
        key = digest(data)
        target = self.root/'cas'/key
        if not target.exists():
            tmp = self.root/'tmp'/uuid.uuid4().hex
            tmp.write_bytes(data)
            tmp.replace(target)
        return key
    def path(self, key: str) -> Path:
        if len(key) != 64 or any(c not in '0123456789abcdef' for c in key):
            raise ValueError('invalid-artifact-id')
        path = self.root/'cas'/key
        if not path.is_file() or digest(path.read_bytes()) != key:
            raise ValueError('missing-or-corrupt-artifact')
        return path
    def asset(self, key: str):
        with self.db() as db:
            row = db.execute('SELECT data FROM assets WHERE id=?', (key,)).fetchone()
        if not row: raise ValueError('asset-not-found')
        return json.loads(row['data'])
    def save_asset(self, record):
        with self.db() as db:
            db.execute('INSERT OR IGNORE INTO assets VALUES (?,?)', (record['id'], encoded(record)))
        return self.asset(record['id'])
    @staticmethod
    def implementation_fingerprint():
        root=Path(__file__).parent
        files=[*sorted(root.glob('*.py')),root.parent/'uv.lock']
        return digest(encoded({p.name:digest(p.read_bytes()) for p in files if p.exists()}).encode())

    def submit(self, request):
        asset = self.asset(request['assetId'])
        start, end = request['start'], request['end']
        if not all(isinstance(n,(float,int)) and not isinstance(n,bool) and math.isfinite(n) for n in (start,end)):
            raise ValueError('invalid-excerpt')
        if not 0 <= start < end <= asset['duration'] + .001 or end-start > 60:
            raise ValueError('excerpt-must-be-within-source-and-at-most-60-seconds')
        stages = request['stages']
        if not stages or len(stages)>4 or len(stages)!=len(set(stages)) or any(s not in STAGES for s in stages):
            raise ValueError('invalid-stages')
        context = request['contextRevision']
        if not isinstance(context,str) or not 1 <= len(context) <= 160: raise ValueError('invalid-context')
        data = {'schemaVersion':VERSION, 'assetId':asset['id'], 'start':start, 'end':end,
                'stages':sorted(stages), 'contextRevision':context, 'config':{**BASELINE,'implementation':self.implementation_fingerprint()}}
        fingerprint = digest(encoded(data).encode())
        key = str(uuid.uuid4())
        with self.db() as db:
            db.execute('INSERT OR IGNORE INTO jobs VALUES (?,?,?,?,NULL,NULL,?)',
                       (key,fingerprint,'queued',encoded(data),time.time()))
            key = db.execute('SELECT id FROM jobs WHERE fingerprint=?',(fingerprint,)).fetchone()['id']
        return self.job(key)
    def job(self, key):
        with self.db() as db: row = db.execute('SELECT * FROM jobs WHERE id=?',(key,)).fetchone()
        if not row: raise ValueError('job-not-found')
        return {**json.loads(row['data']), 'id':row['id'], 'fingerprint':row['fingerprint'],
                'status':row['status'], 'error':row['error'], 'updated':row['updated'],
                'result':json.loads(row['result']) if row['result'] else None}
    def claim(self):
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute("SELECT id FROM jobs WHERE status='queued' ORDER BY updated LIMIT 1").fetchone()
            if not row: return None
            db.execute("UPDATE jobs SET status='running',updated=? WHERE id=?",(time.time(),row['id']))
        return self.job(row['id'])
    def finish(self, key, result=None, error=None):
        with self.db() as db:
            db.execute("UPDATE jobs SET status=?,result=?,error=?,updated=? WHERE id=? AND status='running'",
                       ('failed' if error else 'completed',encoded(result) if result else None,error,time.time(),key))
    def cancel(self, key):
        self.job(key)
        with self.db() as db:
            db.execute("UPDATE jobs SET status='cancelled',updated=? WHERE id=? AND status IN ('queued','running')",(time.time(),key))
        return self.job(key)
    def recover(self):
        with self.db() as db: db.execute("UPDATE jobs SET status='queued' WHERE status='running'")
    def stage(self, fingerprint, result=None):
        with self.db() as db:
            if result is not None:
                db.execute('INSERT OR REPLACE INTO stages VALUES (?,?)',(fingerprint,encoded(result)))
                return result
            row = db.execute('SELECT data FROM stages WHERE fingerprint=?',(fingerprint,)).fetchone()
        return json.loads(row['data']) if row else None
    def reviews(self, key):
        self.job(key)
        with self.db() as db:
            rows = db.execute("SELECT data FROM reviews WHERE job=? ORDER BY rowid", (key,)).fetchall()
        return [json.loads(row["data"]) for row in rows]

    def review(self, request):
        job=self.job(request['jobId'])
        if job['status']!='completed' or job['contextRevision']!=request['contextRevision']:
            raise ValueError('stale-or-incomplete-job')
        decisions=request['decisions']
        hypotheses={n['id'] for n in job['result']['notes']}
        if len(decisions)>256: raise ValueError('too-many-decisions')
        seen=set()
        for decision in decisions:
            if set(decision)-{'noteId','decision','midi'}: raise ValueError('invalid-decision')
            if decision['noteId'] not in hypotheses or decision['noteId'] in seen: raise ValueError('unknown-or-duplicate-note')
            seen.add(decision['noteId'])
            if decision['decision'] not in ('accept','reject','replace'): raise ValueError('invalid-decision')
            if decision['decision']=='replace' and (type(decision.get('midi'))!=int or not 0<=decision['midi']<=127):
                raise ValueError('invalid-pitch')
        record={'schemaVersion':VERSION,'id':str(uuid.uuid4()),'jobId':job['id'],
                'contextRevision':request['contextRevision'],'authority':'learner-confirmed',
                'decisions':decisions,'createdAt':time.time()}
        with self.db() as db: db.execute('INSERT INTO reviews VALUES (?,?,?)',(record['id'],job['id'],encoded(record)))
        return record
