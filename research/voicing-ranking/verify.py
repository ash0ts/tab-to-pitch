"""Fresh-process artifact replay with JSON-normalized immutable shape records."""
import argparse
import hashlib
import json
from pathlib import Path
from benchmark import evaluate, write


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args()
    root = args.bundle
    bundle = json.loads((root / "bundle.json").read_text())
    for name, expected in bundle["sha256"].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Artifact hash changed: {name}")
    rows = json.loads((root / "examples.json").read_text())
    models = json.loads((root / "model.json").read_text())["folds"]
    saved = json.loads((root / "predictions.json").read_text())
    maximum = 0.0
    for row, prior in zip(rows, saved, strict=True):
        result = evaluate(row, models[f'{row["performer"]}-{row["family"]}'])
        normalized = json.loads(json.dumps(result["arms"]))
        if result["id"] != prior["id"] or normalized != prior["arms"]:
            raise ValueError("Fresh replay changed ranking")
        if result["conditionalLogLoss"] is None:
            if prior["conditionalLogLoss"] is not None:
                raise ValueError("Coverage changed")
        else:
            maximum = max(maximum, abs(result["conditionalLogLoss"] - prior["conditionalLogLoss"]))
    if maximum > 1e-9:
        raise ValueError("Fresh replay changed probability")
    receipt = {"matched": len(rows), "maximumLogLossDifference": maximum, "freshProcess": True, "sha256": bundle["sha256"], "verifierSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "preparationNote": "Original inline verifier compared in-memory tuples against JSON lists and failed before semantic comparison. This verifier normalizes serialization; fitting/scoring source and outputs are unchanged."}
    write(root / "prediction-replay.json", receipt)
    print(json.dumps({"matched": len(rows), "maximumLogLossDifference": maximum}))


if __name__ == "__main__":
    main()
