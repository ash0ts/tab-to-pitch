from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import sys
from typing import Any

from .data import DataError, Dataset, canonical_hash, load_dataset, timestamp
from .evaluate import baseline_predictions, evaluate_by_skill, split_rows
from .features import FEATURE_NAMES, FEATURE_VERSION, build_features
from .model import fit_logistic, predict


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


def source_hash() -> str:
    sources = {path.name: path.read_text(encoding="utf-8") for path in sorted(Path(__file__).parent.glob("*.py"))}
    return canonical_hash(sources)


def validate_publication(dataset: Dataset, *, log_wandb: bool, upload_artifacts: bool, registry_path: str | None, project: str | None) -> None:
    if (upload_artifacts or registry_path) and not log_wandb:
        raise DataError("Artifact or Registry upload also requires --log-wandb.")
    if registry_path and not upload_artifacts:
        raise DataError("Registry linking requires --upload-artifacts.")
    if log_wandb and (not project or not dataset.artifact_upload_allowed):
        raise DataError("W&B logging requires --wandb-project and allowArtifactUpload:true in every learner's consent.")
    if registry_path and dataset.synthetic:
        raise DataError("Synthetic fixtures cannot be linked into Registry or promoted.")


def publish(output: Path, report: dict[str, Any], manifest: dict[str, Any], *, project: str, upload_artifacts: bool, registry_path: str | None) -> None:
    """Called only after explicit publication flags and consent checks."""
    try:
        import wandb
    except ImportError as error:
        raise DataError("W&B dependency missing. Run uv sync --extra train --extra wandb.") from error
    # Neither source exports nor learner/attempt split identities leave this machine.
    with wandb.init(project=project, job_type="recall-shadow-evaluation", config=manifest, tags=["shadow-only", "synthetic" if manifest["synthetic"] else "consented"]) as run:
        metrics = {}
        for split_name, models in report["evaluations"].items():
            for model_name, values in models.items():
                for key in ("brier", "logLoss", "macroLearnerBrier", "answers", "learners"):
                    metrics[f"{split_name}/{model_name}/{key}"] = values[key]
        run.log(metrics)
        if upload_artifacts:
            artifact = wandb.Artifact("tab-to-pitch-recall-shadow", type="model", metadata={"promotionEligible": False, "synthetic": manifest["synthetic"]})
            for filename in ("model.json", "report.json", "run-manifest.json"):
                artifact.add_file(str(output / filename), name=filename)
            logged = run.log_artifact(artifact, aliases=["shadow"])
            if registry_path:
                run.link_artifact(artifact=logged, target_path=registry_path, aliases=["shadow"])


def run_experiment(args: argparse.Namespace) -> dict[str, Any]:
    dataset = load_dataset(args.dataset)
    if dataset.synthetic and not args.allow_synthetic:
        raise DataError("Synthetic pipeline fixtures require --allow-synthetic and cannot support product claims.")
    validate_publication(dataset, log_wandb=args.log_wandb, upload_artifacts=args.upload_artifacts, registry_path=args.registry_path, project=args.wandb_project)
    rows = build_features(dataset)
    cutoff = timestamp(args.cutoff)
    splits = split_rows(dataset, rows, cutoff, args.holdout_learner_id)
    model = fit_logistic(splits.train, args.inverse_regularization)
    model.update({"synthetic": dataset.synthetic, "trainingDatasetHash": dataset.input_hash, "splitManifestHash": canonical_hash(splits.manifest)})
    evaluations = {}
    for name, group in (("temporal", splits.temporal), ("learner_holdout", splits.learner_holdout)):
        evaluations[name] = {
            "training_skill_rate_baseline": evaluate_by_skill(group, baseline_predictions(splits.train, group)),
            "logistic_shadow": evaluate_by_skill(group, predict(model, group)),
        }
    excluded = Counter(
        attempt.outcome if attempt.outcome not in ("correct", "incorrect") else "self_report_evidence" if attempt.evidence != "answer" else "assisted_or_hinted"
        for attempt in dataset.attempts if not attempt.eligible
    )
    report = {
        "schemaVersion": 1, "status": "shadow-only", "synthetic": dataset.synthetic,
        "promotionEligible": False,
        "claim": "Synthetic pipeline verification only." if dataset.synthetic else "Retrospective next-answer prediction. This does not establish a learning benefit or justify scheduler promotion.",
        "eligibleAnswers": len(rows), "excludedRecords": dict(excluded),
        "evaluations": evaluations,
        "limitations": [
            "The recorded scheduling policy selected these attempts; comparisons are not randomized.",
            "Repeated answers from a learner are correlated. Answer count is not independent participant count.",
            "Held-out learners may contribute earlier personal history as inference features, but never fitting labels.",
            "Brier and log loss measure more than calibration. Inspect calibration bins and their counts.",
            "No prospective outcome or uncertainty claim is made by this report.",
        ],
    }
    manifest = {
        "schemaVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sourceHash": source_hash(), "datasetHash": dataset.input_hash,
        "splitManifestHash": canonical_hash(splits.manifest),
        "featureVersion": FEATURE_VERSION, "featureNames": list(FEATURE_NAMES),
        "pythonVersion": platform.python_version(), "modelFit": model["fit"],
        "inverseRegularization": args.inverse_regularization,
        "synthetic": dataset.synthetic, "promotionEligible": False,
        "trainAnswers": len(splits.train), "trainLearners": len({row.learner for row in splits.train}),
        "cutoffMs": cutoff,
    }
    try:
        args.output.mkdir(parents=True, exist_ok=False)
    except FileExistsError as error:
        raise DataError("Output directory already exists. Choose a new run directory; prior results are preserved.") from error
    write_json(args.output / "model.json", model)
    write_json(args.output / "report.json", report)
    write_json(args.output / "split-manifest.json", splits.manifest)
    write_json(args.output / "run-manifest.json", manifest)
    if args.log_wandb:
        publish(args.output, report, manifest, project=args.wandb_project, upload_artifacts=args.upload_artifacts, registry_path=args.registry_path)
    return report


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Evaluate consented recall prediction offline. No automatic promotion.")
    result.add_argument("dataset", type=Path)
    result.add_argument("--output", type=Path, required=True)
    result.add_argument("--cutoff", required=True, help="Frozen timezone-qualified chronological cutoff.")
    result.add_argument("--holdout-learner-id", action="append", required=True, help="Pseudonymous ID fixed before evaluating; repeat for each held-out learner.")
    result.add_argument("--inverse-regularization", type=float, default=1.0)
    result.add_argument("--allow-synthetic", action="store_true")
    result.add_argument("--log-wandb", action="store_true")
    result.add_argument("--wandb-project")
    result.add_argument("--upload-artifacts", action="store_true")
    result.add_argument("--registry-path", help="Explicit W&B Registry collection path. Only the shadow alias is used.")
    return result


def main() -> int:
    try:
        report = run_experiment(parser().parse_args())
    except (DataError, OSError) as error:
        print(f"Research run stopped: {error}", file=sys.stderr)
        return 2
    print(json.dumps({"status": report["status"], "synthetic": report["synthetic"], "eligibleAnswers": report["eligibleAnswers"], "promotionEligible": False}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
