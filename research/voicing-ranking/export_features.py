import argparse
import json
from pathlib import Path
import numpy as np
from benchmark import candidates, feature, write, sha

parser = argparse.ArgumentParser()
parser.add_argument("--bundle", type=Path, required=True)
args = parser.parse_args()
rows = json.loads((args.bundle / "examples.json").read_text())
matrices = [np.array([feature(c, r["previous"]) for c in candidates(tuple(r["pitchClassMultiset"]))], dtype=np.float64) for r in rows]
path = args.bundle / "features.npz"
if path.exists():
    raise ValueError("Feature artifact already exists")
np.savez_compressed(path, values=np.vstack(matrices), offsets=np.r_[0, np.cumsum([len(x) for x in matrices])])
write(args.bundle / "features.json", {"rows": len(rows), "candidateRows": sum(len(x) for x in matrices), "featureNames": json.loads((args.bundle / "model.json").read_text())["features"], "order": "examples.json order; candidates are lexicographic six-element physical-string tuples, muted=-1", "sourceExamplesSha256": sha(args.bundle / "examples.json"), "featuresSha256": sha(path), "normalization": "Unstandardized; each fold model owns training-only mean and standard deviation"})
print(json.dumps({"candidateRows": sum(len(x) for x in matrices), "bytes": path.stat().st_size}))
