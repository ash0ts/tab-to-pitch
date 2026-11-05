from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import math
from typing import Any

from .data import DataError, Dataset, SKILLS
from .features import FeatureRow


@dataclass(frozen=True)
class Splits:
    train: tuple[FeatureRow, ...]
    temporal: tuple[FeatureRow, ...]
    learner_holdout: tuple[FeatureRow, ...]
    manifest: dict[str, Any]


def split_rows(dataset: Dataset, rows: list[FeatureRow], cutoff_ms: float, holdout_learner_ids: list[str]) -> Splits:
    if len(dataset.learner_hashes) < 2:
        raise DataError("Learner holdout needs at least one training learner and a different held-out learner.")
    if not holdout_learner_ids or any(value not in dataset.learner_hashes for value in holdout_learner_ids):
        raise DataError("Choose existing explicit --holdout-learner-id values before evaluating.")
    heldout = {dataset.learner_hashes[value] for value in holdout_learner_ids}
    if len(heldout) == len(dataset.learner_hashes):
        raise DataError("The learner holdout leaves no training learners.")
    train = tuple(row for row in rows if row.learner not in heldout and row.answered < cutoff_ms)
    temporal = tuple(row for row in rows if row.learner not in heldout and row.started >= cutoff_ms)
    learner_holdout = tuple(row for row in rows if row.learner in heldout and row.started >= cutoff_ms)
    groups = {"train": train, "temporal": temporal, "learner_holdout": learner_holdout}
    for name, group in groups.items():
        if {row.label for row in group} != {0, 1}:
            raise DataError(f"The {name} split needs observed correct and incorrect eligible answers. No result is produced from an empty or single-class split.")
    assigned = {row.id for group in groups.values() for row in group}
    manifest = {
        "schemaVersion": 1,
        "datasetHash": dataset.input_hash,
        "cutoffMs": cutoff_ms,
        "heldoutLearners": sorted(heldout),
        "policy": "train answers finish before cutoff; test presentations start at/after cutoff; held-out learners never fit parameters",
        "historyPolicy": "Only events completed before each presentation are available, including earlier evaluation-period history. No model refitting on evaluation labels.",
        "splits": {
            name: [{"attemptHash": row.id, "learnerHash": row.learner} for row in group]
            for name, group in groups.items()
        },
        "excludedFromFitAndEvaluation": [row.id for row in rows if row.id not in assigned],
    }
    return Splits(train, temporal, learner_holdout, manifest)


def evaluate_probabilities(rows: tuple[FeatureRow, ...], probabilities: list[float], bin_count: int = 5) -> dict[str, Any]:
    if not rows or len(rows) != len(probabilities):
        raise DataError("Metrics need aligned nonempty rows and predictions.")
    if any(not math.isfinite(value) or not 0 <= value <= 1 for value in probabilities):
        raise DataError("Predictions must be finite probabilities.")
    labels = [row.label for row in rows]
    clipped = [max(1e-12, min(1 - 1e-12, value)) for value in probabilities]
    brier_values = [(probability - label) ** 2 for probability, label in zip(probabilities, labels)]
    log_values = [-label * math.log(probability) - (1 - label) * math.log1p(-probability) for probability, label in zip(clipped, labels)]
    learner_scores: dict[str, list[float]] = defaultdict(list)
    bins: list[list[int]] = [[] for _ in range(bin_count)]
    for index, (row, probability) in enumerate(zip(rows, probabilities)):
        learner_scores[row.learner].append(brier_values[index])
        bins[min(bin_count - 1, int(probability * bin_count))].append(index)
    return {
        "answers": len(rows),
        "learners": len(learner_scores),
        "correct": sum(labels),
        "incorrect": len(labels) - sum(labels),
        "brier": sum(brier_values) / len(rows),
        "logLoss": sum(log_values) / len(rows),
        "macroLearnerBrier": sum(sum(values) / len(values) for values in learner_scores.values()) / len(learner_scores),
        "calibration": [
            {
                "lower": index / bin_count, "upper": (index + 1) / bin_count,
                "count": len(members),
                "meanPrediction": sum(probabilities[member] for member in members) / len(members) if members else None,
                "observedRecall": sum(labels[member] for member in members) / len(members) if members else None,
            }
            for index, members in enumerate(bins)
        ],
    }


def baseline_predictions(train: tuple[FeatureRow, ...], rows: tuple[FeatureRow, ...]) -> list[float]:
    global_rate = (sum(row.label for row in train) + 1) / (len(train) + 2)
    skill_labels: dict[str, list[int]] = defaultdict(list)
    for row in train:
        skill_labels[row.skill].append(row.label)
    rates = {skill: (sum(labels) + 1) / (len(labels) + 2) for skill, labels in skill_labels.items()}
    return [rates.get(row.skill, global_rate) for row in rows]


def evaluate_by_skill(rows: tuple[FeatureRow, ...], probabilities: list[float]) -> dict[str, Any]:
    """Keep missing families explicit so pooled results cannot hide their absence."""
    report = evaluate_probabilities(rows, probabilities)
    report["bySkill"] = {}
    for skill in SKILLS:
        members = [(row, probability) for row, probability in zip(rows, probabilities) if row.skill == skill]
        report["bySkill"][skill] = evaluate_probabilities(
            tuple(row for row, _ in members), [probability for _, probability in members],
        ) if members else None
    return report
