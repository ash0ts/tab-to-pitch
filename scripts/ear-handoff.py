"""Create a baseline-checked source overlay without editing another worktree."""
import argparse,hashlib,json,tarfile
from pathlib import Path

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 root=Path(__file__).resolve().parents[1];base=json.loads(a.baseline.read_text())
 excluded={'.git','.local','node_modules','dist','test-results','playwright-report','.venv','__pycache__','.pytest_cache','.ruff_cache','.server-build'}
 files={}
 for path in root.rglob('*'):
  rel=path.relative_to(root)
  if not path.is_file() or any(s in excluded for s in rel.parts) or path.is_symlink():continue
  if path.name.startswith('.env') and path.name!='.env.example':continue
  if path.suffix in {'.pyc','.gp','.gp3','.gp4','.gp5','.gpx'}:continue
  # alphaTab assets are reproducibly installed by npm ci, not source edits.
  if str(rel).startswith(('public/vendor/','public/font/','public/soundfont/')):continue
  name=str(rel)
  if name not in base['files'] and not (name.startswith(('audio_worker/','research/ear-lab/','src/ear/','docs/media/ear-lab/')) or name in {
    '.env.example','.github/CODEOWNERS','.github/workflows/ci.yml','README.md','THIRD_PARTY_NOTICES.md','package.json','patches/README.md','vite.config.ts',
    'src/shared/audio.ts','src/player/ear-score.ts','src/player/ear-score.test.ts','server/audio.ts','server/audio.test.ts',
    'tests/ear.browser.spec.ts','tests/ear.playwright.config.ts','scripts/capture-ear.mjs','scripts/ear-handoff.py','scripts/patch-alphatab.mjs','docs/ear-lab-demo.md'
  }):continue
  files[name]=sha(path)
 changes=[{'path':path,'before':base['files'].get(path),'baselineKnown':path in base['files'],'after':digest} for path,digest in sorted(files.items()) if digest!=base['files'].get(path)]
 a.out.mkdir(parents=True,exist_ok=False)
 manifest={'version':1,'source':str(root),'baselineSource':base['source'],'baselineCapturedAt':base['capturedAt'],'changes':changes,'policy':'Apply only after checking current destination hashes. Never overwrite concurrent changes.'}
 (a.out/'changes.json').write_text(json.dumps(manifest,indent=2)+'\n')
 with tarfile.open(a.out/'source-overlay.tar.gz','w:gz') as t:
  for c in changes:t.add(root/c['path'],arcname=c['path'],recursive=False)
 (a.out/'check-destination.py').write_text('''import hashlib,json,sys\nfrom pathlib import Path\nbase=Path(sys.argv[1]);manifest=json.loads(Path(__file__).with_name("changes.json").read_text());conflicts=[]\nfor c in manifest["changes"]:\n p=base/c["path"];current=hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None\n if current not in (c["before"],c["after"]):conflicts.append(c["path"])\nprint(json.dumps({"conflicts":conflicts,"safeToApply":not conflicts},indent=2));sys.exit(1 if conflicts else 0)\n''')
 print(json.dumps({'files':len(changes),'archiveBytes':(a.out/'source-overlay.tar.gz').stat().st_size,'output':str(a.out)}))
if __name__=='__main__':main()
