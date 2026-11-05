import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from benchmark import (
    FEATURES,
    bootstrap_difference,
    build_features,
    card_selected,
    fit,
    row_metrics,
    split_at_cutoff,
)

DAY = 86400000


def records():
    return pd.DataFrame(
        {
            "review_time": [DAY, 2 * DAY, 4 * DAY, 8 * DAY],
            "card_id": [1, 1, 1, 1],
            "review_rating": [3, 1, 4, 3],
            "y": [1, 0, 1, 1],
        }
    )


class RecallBenchmarkTests(unittest.TestCase):
    def test_current_and_future_labels_do_not_enter_features(self):
        frame = records()
        original, _ = build_features(frame, "x", False)
        frame.loc[2:, "review_rating"] = [1, 1]
        frame.loc[2:, "y"] = [0, 0]
        altered, _ = build_features(frame, "x", False)
        np.testing.assert_array_equal(
            original.iloc[:2][FEATURES], altered.iloc[:2][FEATURES]
        )
        self.assertFalse(
            np.array_equal(original.iloc[2][FEATURES], altered.iloc[2][FEATURES])
        )

    def test_features_are_rebuilt_without_upstream_history(self):
        frame = records()
        frame["r_history"] = "4,4,4"
        frame["i"] = 50000
        result, _ = build_features(frame, "x", False)
        self.assertEqual(result.prior_n.tolist(), [1, 2, 3])
        self.assertEqual(result.prior_correct.tolist(), [1, 1, 2])
        self.assertEqual(result.previous_rating_1.tolist(), [0, 1, 0])

    def test_ties_cannot_leak_concurrent_answer(self):
        frame = records()
        frame.loc[1, "review_time"] = DAY
        result, count = build_features(frame, "x", False)
        self.assertEqual(count["ambiguous_timestamps"], 2)
        self.assertEqual(result.review_time.tolist(), [8 * DAY])
        self.assertEqual(result.prior_n.tolist(), [1])

    def test_short_term_history_retained_but_not_graded(self):
        frame = records()
        frame.loc[1, "review_time"] = DAY + 1000
        result, count = build_features(frame, "x", False)
        self.assertEqual(count["less_than_one_day"], 1)
        self.assertEqual(result.prior_n.tolist(), [2, 3])
        self.assertEqual(result.prior_correct.tolist(), [1, 2])

    def test_validation_and_duplicate_exclusion(self):
        frame = records()
        frame = pd.concat([frame, frame.iloc[[0]]], ignore_index=True)
        result, count = build_features(frame, "x", False)
        self.assertEqual(count["exact_duplicates"], 1)
        self.assertEqual(len(result), 3)
        frame.loc[1, "y"] = 1
        with self.assertRaisesRegex(ValueError, "disagrees"):
            build_features(frame, "x", False)

    def test_sampling_independent_of_outcomes(self):
        self.assertEqual(card_selected("a", 123), card_selected("a", 123))
        self.assertIsInstance(card_selected("a", 123), bool)

    def test_scaling_and_serialized_coefficients(self):
        frame, _ = build_features(records(), "x", False)
        scaler, model = fit(frame)
        np.testing.assert_allclose(scaler.mean_, frame[FEATURES].mean().to_numpy())
        coefficients = model.coef_[0] / scaler.scale_
        intercept = model.intercept_[0] - np.dot(coefficients, scaler.mean_)
        p = 1 / (1 + np.exp(-(frame[FEATURES].to_numpy() @ coefficients + intercept)))
        np.testing.assert_allclose(
            p, model.predict_proba(scaler.transform(frame[FEATURES].to_numpy()))[:, 1]
        )

    def test_temporal_split_requires_fitting_membership(self):
        frame = pd.DataFrame(
            {
                "review_time": [1, 3, 3, 1, 3],
                "collection": ["fit", "fit", "post-only", "held", "held"],
                "y": [0, 1, 0, 0, 1],
            }
        )
        parts = split_at_cutoff(frame, frame.collection.eq("held"), 2)
        self.assertEqual(parts["train"].collection.tolist(), ["fit"])
        self.assertEqual(parts["temporal"].collection.tolist(), ["fit"])
        self.assertEqual(parts["heldout"].collection.tolist(), ["held"])
        self.assertEqual(
            parts["post_only_diagnostic"].collection.tolist(), ["post-only"]
        )

    def test_cluster_difference_matches_paired_rows(self):
        frame = pd.DataFrame({"y": [0, 1, 1, 0], "collection": ["a", "a", "b", "b"]})
        candidate = np.array([0.1, 0.8, 0.7, 0.2])
        baseline = np.array([0.5, 0.5, 0.5, 0.5])
        result = bootstrap_difference(frame, candidate, baseline)
        b1, _ = row_metrics(frame.y.to_numpy(), candidate)
        b0, _ = row_metrics(frame.y.to_numpy(), baseline)
        self.assertAlmostEqual(
            result["candidate_minus_baseline"]["brier"]["estimate"],
            float((b1 - b0).mean()),
        )
        self.assertEqual(result["groups"], 2)


if __name__ == "__main__":
    with patch("socket.socket", side_effect=AssertionError("Tests must stay offline")):
        unittest.main()
