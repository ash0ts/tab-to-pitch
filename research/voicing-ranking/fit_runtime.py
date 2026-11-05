"""Separate all-data research fit after frozen CV; never reports a new test score."""
import argparse
import json
from pathlib import Path
import numpy as np
from benchmark import fit, candidates, feature, write, sha

parser = argparse.ArgumentParser()
parser.add_argument("--bundle", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
report = json.loads((args.bundle / "report.json").read_text())
if not report["shadowGatePassed"]:
    raise ValueError("Research shadow gate did not pass")
rows = json.loads((args.bundle / "examples.json").read_text())
write(args.output / "manifest.json", {"kind": "post-evaluation-all-data-fit", "heldoutReportSha256": sha(args.bundle / "report.json"), "examplesSha256": sha(args.bundle / "examples.json"), "fittingCodeSha256": sha(Path(__file__).with_name("benchmark.py")), "runtimeFitCodeSha256": sha(__file__), "rows": len(rows), "newHeldoutScore": False, "productionPromotion": False})
model = fit(rows)
names = json.loads((args.bundle / "model.json").read_text())["features"]
result = {"schemaVersion": 1, "id": "guitarset-observed-choice-v1", "kind": "experimental-observed-choice-ranker", "features": names, "weights": model["weights"], "mean": model["mean"], "std": model["std"], "constraints": {"tuningMidi": [64,59,55,50,45,40], "capo": 0, "voices": [3,6], "pitchClassCounts": [3,4], "maxFret": 24, "maxFrettedSpan": 4, "exactPitchClassMultiset": True}, "trainingRows": len(rows), "trainingRecordings": len(set(r["recording"] for r in rows)), "target": "Observed next shape given actual previous shape and requested pitch-class multiset", "heldoutReportSha256": sha(args.bundle / "report.json"), "serving": "Explicit optional research ordering only; deterministic ordering is the default", "license": "CC-BY-4.0", "attribution": "Qingyang Xi et al., GuitarSet: A Dataset for Guitar Transcription, ISMIR 2018, DOI 10.5281/zenodo.3371780", "newHeldoutScore": False}
write(args.output / "voicing-ranker-v1.json", result)
parity = []
# Outcome-blind evenly spaced row selection, plus every candidate for each row.
for index in np.linspace(0, len(rows)-1, 12, dtype=int):
    row = rows[index]
    entries = []
    for choice in candidates(tuple(row["pitchClassMultiset"])):
        features = feature(choice, row["previous"])
        score = float(((np.asarray(features) - np.asarray(model["mean"])) / np.asarray(model["std"])) @ np.asarray(model["weights"]))
        entries.append({"shape": choice, "features": features, "score": score})
    parity.append({"previous": row["previous"], "pitchClassMultiset": row["pitchClassMultiset"], "candidates": entries})
write(args.output / "parity.json", {"modelSha256": sha(args.output / "voicing-ranker-v1.json"), "cases": parity, "tolerance": 1e-9})
write(args.output / "fit.json", {"converged": model["converged"], "iterations": model["iterations"], "trainingObjective": model["objective"], "heldoutEvaluation": "Use frozen run-001 only; this all-data fit has no new held-out result"})
print(json.dumps({"rows": len(rows), "iterations": model["iterations"], "parityCases": len(parity), "modelSha256": sha(args.output / "voicing-ranker-v1.json")}))
