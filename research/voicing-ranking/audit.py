"""Independent aggregation and split audit from frozen evidence, without fitting."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
from statistics import mean

parser = argparse.ArgumentParser()
parser.add_argument("--bundle", type=Path, required=True)
args = parser.parse_args()
read = lambda name: json.loads((args.bundle / name).read_text())
rows, predictions, splits, report = map(read, ["examples.json", "predictions.json", "split-manifest.json", "report.json"])
if len({r["id"] for r in rows}) != len(rows) or [r["id"] for r in rows] != [r["id"] for r in predictions]:
    raise ValueError("Prediction identity mismatch")
records = {r["recording"]: (r["performer"], r["family"]) for r in rows}
seen = defaultdict(int)
for key, split in splits.items():
    person, family = key.split("-")
    for record in split["trainRecordings"]:
        if records[record][0] == person or records[record][1] == family:
            raise ValueError("Held-out factor leaked into training")
    for record in split["testRecordings"]:
        if records[record] != (person, family):
            raise ValueError("Test membership mismatch")
        seen[record] += 1
if set(seen) != set(records) or set(seen.values()) != {1}:
    raise ValueError("Recordings not tested exactly once")
maximum = 0
for arm, claimed in report["metrics"].items():
    values = defaultdict(lambda: defaultdict(list))
    for row in predictions:
        rank = row["arms"][arm]["rank"]
        direct = {"rr": 1/rank if rank else 0, "top1": int(rank == 1), "top3": int(rank is not None and rank <= 3)}
        for metric, value in direct.items():
            values[metric][row["recording"]].append(value)
    for metric, groups in values.items():
        difference = abs(mean(mean(v) for v in groups.values()) - claimed[metric])
        maximum = max(maximum, difference)
        if difference > 1e-12:
            raise ValueError("Independent metric reconstruction differs")
result = {"rows": len(rows), "recordings": len(records), "folds": len(splits), "recordingsTestedExactlyOnce": True, "heldoutPerformersAndFamiliesAbsentFromTraining": True, "metricsReconstructedFromRanks": True, "maximumAggregateDifference": maximum, "fittingPerformed": False}
(args.bundle / "independent-audit.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
