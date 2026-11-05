from __future__ import annotations

import argparse
import copy
from dataclasses import replace
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from recall_research.cli import run_experiment, validate_publication
from recall_research.data import DataError, canonical_hash, digest, parse_dataset
from recall_research.evaluate import baseline_predictions, evaluate_by_skill, evaluate_probabilities, split_rows
from recall_research.features import FEATURE_NAMES, FEATURE_VERSION, build_features
from recall_research.model import predict, validate_model

BASE = 1_700_000_000_000


def attempt(index: int, outcome: str = "correct", **overrides):
    """Explicitly synthetic test events; not observations from learners."""
    result = {
        "id": f"synthetic-attempt-{index}", "exerciseId": f"synthetic-exercise-{index % 2}",
        "scoreId": "synthetic-score", "trackId": "synthetic-track", "skillId": "note-name", "kind": "note-name",
        "noteIds": ["synthetic-note"], "response": "SYNTHETIC TEST RESPONSE", "outcome": outcome,
        "assisted": False, "hintsUsed": [], "startedAt": BASE + index * 2000,
        "answeredAt": BASE + index * 2000 + 1000, "responseMs": 1000,
        "mode": "recall", "partition": "practice", "evidence": "answer",
    }
    result.update(overrides)
    return result


def fixture(records=None):
    """Synthetic-only fixtures exercise code paths; they cannot support promotion."""
    records = records if records is not None else [attempt(index, "correct" if index % 2 else "incorrect") for index in range(10)]
    return {
        "schemaVersion": 1, "synthetic": True, "attemptSemantics": "first-terminal-answer-v1",
        "learners": [
            {
                "learnerId": learner,
                "consent": {"granted": True, "purpose": "recall-model-research", "recordedAt": "2026-01-01T00:00:00Z", "allowArtifactUpload": False},
                "export": {"schemaVersion": 1, "exportedAt": "2026-01-02T00:00:00Z", "attempts": copy.deepcopy(records)},
            }
            for learner in ("synthetic-train-a", "synthetic-train-b", "synthetic-holdout")
        ],
    }


class OfflineTest(unittest.TestCase):
    def setUp(self):
        self.network = patch("socket.socket.connect", side_effect=AssertionError("Tests must not access the network"))
        self.network.start()
        self.addCleanup(self.network.stop)


class ConsentTests(OfflineTest):
    def test_missing_revoked_or_wrong_purpose_consent_fails(self):
        for replacement in (None, {"granted": False}, {"granted": True, "purpose": "analytics"}, {"granted": True, "purpose": "recall-model-research", "revokedAt": "2026-01-02T00:00:00Z"}):
            raw = fixture()
            raw["learners"][0]["consent"] = replacement
            with self.assertRaises(DataError):
                parse_dataset(raw)

    def test_plain_application_backup_is_not_research_consent(self):
        with self.assertRaises(DataError):
            parse_dataset(fixture()["learners"][0]["export"])

    def test_duplicate_attempts_and_invalid_timing_fail(self):
        with self.assertRaises(DataError):
            parse_dataset(fixture([attempt(1), attempt(1)]))
        with self.assertRaises(DataError):
            parse_dataset(fixture([attempt(1, answeredAt=BASE)]))

    def test_raw_responses_and_source_note_ids_are_not_loaded_into_training_records(self):
        loaded = parse_dataset(fixture())
        self.assertFalse(hasattr(loaded.attempts[0], "response"))
        self.assertNotIn("synthetic-attempt", loaded.attempts[0].id)
        self.assertFalse(loaded.artifact_upload_allowed)

    def test_delimiter_characters_do_not_collapse_attempt_identity(self):
        raw = fixture([attempt(0)])
        raw["learners"] = raw["learners"][:2]
        raw["learners"][0]["learnerId"] = "study:a"
        raw["learners"][0]["export"]["attempts"][0]["id"] = "b"
        raw["learners"][1]["learnerId"] = "study"
        raw["learners"][1]["export"]["attempts"][0]["id"] = "a:b"
        loaded = parse_dataset(raw)
        self.assertEqual(len({attempt.id for attempt in loaded.attempts}), 2)

    def test_boolean_or_fractional_schema_versions_are_rejected(self):
        for version in (True, 1.0):
            raw = fixture()
            raw["schemaVersion"] = version
            with self.assertRaises(DataError):
                parse_dataset(raw)
            raw = fixture()
            raw["learners"][0]["export"]["schemaVersion"] = version
            with self.assertRaises(DataError):
                parse_dataset(raw)


class LeakageTests(OfflineTest):
    def test_changing_current_label_and_response_does_not_change_current_features(self):
        original = fixture()
        changed = copy.deepcopy(original)
        target = changed["learners"][0]["export"]["attempts"][3]
        target.update(outcome="incorrect", response="DIFFERENT SYNTHETIC ANSWER", responseMs=10_000)
        row_id = canonical_hash(["synthetic-train-a", "synthetic-attempt-3"])
        before = next(row for row in build_features(parse_dataset(original)) if row.id == row_id)
        after = next(row for row in build_features(parse_dataset(changed)) if row.id == row_id)
        self.assertEqual(before.features, after.features)
        self.assertNotEqual(before.label, after.label)

    def test_future_answers_cannot_change_earlier_features(self):
        raw = fixture()
        earlier = build_features(parse_dataset(raw))
        for learner in raw["learners"]:
            learner["export"]["attempts"].append(attempt(100, "incorrect"))
        extended = {row.id: row for row in build_features(parse_dataset(raw))}
        for row in earlier:
            self.assertEqual(row.features, extended[row.id].features)

    def test_overlapping_and_simultaneous_answer_events_are_not_visible(self):
        raw = fixture([
            attempt(0, startedAt=BASE, answeredAt=BASE + 5000),
            attempt(1, "incorrect", startedAt=BASE + 1000, answeredAt=BASE + 2000),
            attempt(2, startedAt=BASE + 2000, answeredAt=BASE + 2500),
            attempt(3, startedAt=BASE + 6000, answeredAt=BASE + 6500),
        ])
        rows = [row for row in build_features(parse_dataset(raw)) if row.learner == digest("synthetic-train-a")]
        count_index = FEATURE_NAMES.index("log_prior_skill_answers")
        self.assertEqual(rows[1].features[count_index], 0)
        self.assertEqual(rows[2].features[count_index], 0)
        self.assertGreater(rows[3].features[count_index], 0)

    def test_hints_reveals_interruptions_and_self_reports_are_not_labels(self):
        records = [
            attempt(0, "correct"), attempt(1, "incorrect"),
            attempt(2, "correct", assisted=True), attempt(3, "correct", hintsUsed=["answer"]),
            attempt(4, "revealed"), attempt(5, "interrupted"), attempt(6, "self-reported", evidence="self-report"),
            attempt(7, "correct", evidence="self-report"),
        ]
        rows = build_features(parse_dataset(fixture(records)))
        self.assertEqual(len(rows), 2 * 3)
        self.assertEqual({row.label for row in rows}, {0, 1})


class SplitAndMetricTests(OfflineTest):
    def test_chronology_and_heldout_learners_are_disjoint(self):
        dataset = parse_dataset(fixture())
        splits = split_rows(dataset, build_features(dataset), BASE + 10_000, ["synthetic-holdout"])
        self.assertTrue(all(row.answered < BASE + 10_000 for row in splits.train))
        self.assertTrue(all(row.started >= BASE + 10_000 for row in splits.temporal + splits.learner_holdout))
        self.assertFalse({row.learner for row in splits.train} & {row.learner for row in splits.learner_holdout})
        self.assertFalse({row.id for row in splits.train} & {row.id for row in splits.temporal})

    def test_inadequate_learners_classes_or_empty_splits_stop_cleanly(self):
        one = fixture()
        one["learners"] = one["learners"][:1]
        dataset = parse_dataset(one)
        with self.assertRaisesRegex(DataError, "different held-out learner"):
            split_rows(dataset, build_features(dataset), BASE + 10_000, ["synthetic-train-a"])
        for records, cutoff in (([attempt(index) for index in range(10)], BASE + 10_000), (None, BASE + 100_000)):
            dataset = parse_dataset(fixture(records))
            with self.assertRaisesRegex(DataError, "correct and incorrect"):
                split_rows(dataset, build_features(dataset), cutoff, ["synthetic-holdout"])

    def test_baseline_is_fit_only_from_training_labels(self):
        dataset = parse_dataset(fixture())
        splits = split_rows(dataset, build_features(dataset), BASE + 10_000, ["synthetic-holdout"])
        predictions = baseline_predictions(splits.train, splits.temporal)
        expected = (sum(row.label for row in splits.train) + 1) / (len(splits.train) + 2)
        self.assertTrue(all(value == expected for value in predictions))

    def test_metrics_preserve_empty_bins_and_report_actual_denominators(self):
        rows = tuple(build_features(parse_dataset(fixture())))
        report = evaluate_probabilities(rows, [0.5] * len(rows))
        self.assertAlmostEqual(report["brier"], 0.25)
        self.assertEqual(report["answers"], len(rows))
        self.assertEqual(report["learners"], 3)
        self.assertEqual(sum(bin_["count"] for bin_ in report["calibration"]), len(rows))
        self.assertIsNone(report["calibration"][0]["observedRecall"])

    def test_family_metrics_expose_different_errors_and_missing_families(self):
        row = build_features(parse_dataset(fixture()))[0]
        rows = (replace(row, id="a", skill="note-name", label=1), replace(row, id="b", skill="triad-role", label=0))
        report = evaluate_by_skill(rows, [0.9, 0.9])
        self.assertAlmostEqual(report["brier"], 0.41)
        self.assertAlmostEqual(report["bySkill"]["note-name"]["brier"], 0.01)
        self.assertAlmostEqual(report["bySkill"]["triad-role"]["brier"], 0.81)
        self.assertEqual(report["bySkill"]["note-name"]["answers"], 1)
        self.assertIsNone(report["bySkill"]["interval"])


class ModelAndPublicationTests(OfflineTest):
    def test_json_inference_validates_feature_order_and_coefficients(self):
        model = {"schemaVersion": 1, "modelType": "regularized-logistic-recall", "featureVersion": FEATURE_VERSION, "featureNames": list(FEATURE_NAMES), "weights": [0.0] * len(FEATURE_NAMES), "intercept": 0.0}
        rows = tuple(build_features(parse_dataset(fixture())))
        self.assertEqual(predict(model, rows), [0.5] * len(rows))
        model["featureNames"] = list(reversed(FEATURE_NAMES))
        with self.assertRaises(DataError):
            validate_model(model)

    def test_external_upload_and_registry_require_explicit_flags_and_consent(self):
        dataset = parse_dataset(fixture())
        validate_publication(dataset, log_wandb=False, upload_artifacts=False, registry_path=None, project=None)
        with self.assertRaises(DataError):
            validate_publication(dataset, log_wandb=False, upload_artifacts=True, registry_path=None, project=None)
        with self.assertRaisesRegex(DataError, "allowArtifactUpload"):
            validate_publication(dataset, log_wandb=True, upload_artifacts=False, registry_path=None, project="test")
        raw = fixture()
        for learner in raw["learners"]:
            learner["consent"]["allowArtifactUpload"] = True
        with self.assertRaisesRegex(DataError, "Synthetic fixtures"):
            validate_publication(parse_dataset(raw), log_wandb=True, upload_artifacts=True, registry_path="wandb-registry-test/shadow", project="test")

    @unittest.skipUnless(importlib.util.find_spec("sklearn"), "Optional training extra is not installed")
    def test_synthetic_end_to_end_stays_local_and_unpromotable(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            dataset = base / "synthetic.json"
            dataset.write_text(json.dumps(fixture()))
            args = argparse.Namespace(dataset=dataset, output=base / "run", cutoff="2023-11-14T22:13:30Z", holdout_learner_id=["synthetic-holdout"], inverse_regularization=1.0, allow_synthetic=True, log_wandb=False, upload_artifacts=False, registry_path=None, wandb_project=None)
            with patch("recall_research.cli.publish", side_effect=AssertionError("No publication during tests")):
                report = run_experiment(args)
            self.assertTrue(report["synthetic"])
            self.assertFalse(report["promotionEligible"])
            self.assertIn("bySkill", report["evaluations"]["temporal"]["logistic_shadow"])
            model = json.loads((args.output / "model.json").read_text())
            validate_model(model)
            self.assertFalse(model["promotionEligible"])
            self.assertEqual(model["deploymentStatus"], "shadow-only")
            self.assertEqual({path.suffix for path in args.output.iterdir()}, {".json"})


if __name__ == "__main__":
    unittest.main()
