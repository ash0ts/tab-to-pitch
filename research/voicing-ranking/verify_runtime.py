"""Replay the separate all-data artifact's frozen feature/score parity cases."""
import argparse
import json
from pathlib import Path
import numpy as np
from benchmark import feature, sha, write


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args()
    model = json.loads((args.bundle / "voicing-ranker-v1.json").read_text())
    parity = json.loads((args.bundle / "parity.json").read_text())
    if sha(args.bundle / "voicing-ranker-v1.json") != parity["modelSha256"]:
        raise ValueError("Runtime model bytes differ from parity contract")
    if len(parity["cases"]) != 12 or model["newHeldoutScore"] is not False:
        raise ValueError("Unexpected runtime artifact")
    maximum = 0.0
    choices = 0
    for row in parity["cases"]:
        for candidate in row["candidates"]:
            values = feature(candidate["shape"], row["previous"])
            if values != candidate["features"]:
                raise ValueError("Runtime feature replay differs")
            score = float(((np.asarray(values) - model["mean"]) / model["std"]) @ model["weights"])
            maximum = max(maximum, abs(score - candidate["score"]))
            choices += 1
    if maximum > 1e-9:
        raise ValueError("Runtime score replay differs")
    receipt = {"cases": 12, "candidateScores": choices, "maximumScoreDifference": maximum,
               "modelSha256": parity["modelSha256"], "freshProcess": True,
               "newHeldoutScore": False, "verifierSha256": sha(__file__)}
    write(args.bundle / "runtime-replay.json", receipt)
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
