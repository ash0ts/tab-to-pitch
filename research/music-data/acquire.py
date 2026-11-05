"""Download the pinned public GuitarSet annotation archive, without audio."""
import hashlib
import json
import pathlib
import sys
import urllib.request
import zipfile

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '../tabtopitch-real-data/guitarset').resolve()
ROOT.mkdir(parents=True, exist_ok=True)
ARCHIVE = ROOT / 'annotation.zip'
EXPECTED_SHA256 = '8daa02e6417ccca1685feb44b135e95928ad7037e5032ecb326b5791856fda99'
URL = 'https://zenodo.org/records/3371780/files/annotation.zip?download=1'
if not ARCHIVE.exists():
    partial = ARCHIVE.with_suffix('.zip.partial')
    request = urllib.request.Request(URL, headers={'User-Agent': 'TabToPitch-research/1.0'})
    with urllib.request.urlopen(request, timeout=60) as response, partial.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    if hashlib.sha256(partial.read_bytes()).hexdigest() != EXPECTED_SHA256:
        raise RuntimeError('Downloaded archive does not match the frozen GuitarSet release')
    partial.rename(ARCHIVE)
if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != EXPECTED_SHA256:
    raise RuntimeError('Existing archive does not match the frozen GuitarSet release')
raw = ROOT / 'raw'
raw.mkdir(exist_ok=True)
with zipfile.ZipFile(ARCHIVE) as archive:
    names = archive.namelist()
    if len(names) != 360 or any(pathlib.PurePosixPath(n).name != n or not n.endswith('.jams') for n in names):
        raise RuntimeError('Unexpected archive layout')
    archive.extractall(raw)
print(json.dumps({'archiveSha256': EXPECTED_SHA256, 'recordings': len(names), 'audioDownloaded': False}))
