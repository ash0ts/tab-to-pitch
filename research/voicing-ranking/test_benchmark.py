import unittest
import numpy as np
from benchmark import candidates, feature, valid, fit, evaluate, pitches, relative_key


class RankingContractTests(unittest.TestCase):
    def test_independent_candidates_cover_reference_shapes(self):
        for shape in [(3, 3, 0, 0, 2, -1), (3, 3, 4, 5, -1, -1), (3, 3, 4, 3, -1, -1), (0, 0, 0, 2, 2, 0)]:
            pcs = tuple(sorted(p % 12 for p in pitches(shape)))
            choices = candidates(pcs)
            self.assertIn(shape, choices)
            self.assertEqual(len(choices), len(set(choices)))
            self.assertTrue(all(valid(c, pcs) for c in choices))

    def test_opens_do_not_expand_fretted_span(self):
        shape = (0, 12, 12, 12, -1, -1)
        pcs = tuple(sorted(p % 12 for p in pitches(shape)))
        self.assertIn(shape, candidates(pcs))

    def test_shape_frequency_preserves_opens_and_string_order(self):
        self.assertEqual(relative_key((-1, 5, 7, 7, 0, -1)), (-1, 1, 3, 3, 0, -1))

    def test_features_do_not_receive_target(self):
        current = (3, 3, 4, 5, -1, -1)
        self.assertEqual(len(feature(current, current)), 10)
        self.assertEqual(feature(current, current)[5:9], [0, 0, 0, 0])

    def test_model_fit_and_uncovered_row(self):
        shape = (3, 3, 4, 5, -1, -1)
        pcs = tuple(sorted(p % 12 for p in pitches(shape)))
        row = dict(id="original:1", recording="original", performer="00", family="1", previous=shape, observed=shape, pitchClassMultiset=pcs, pitchClassCount=4, targetIndex=candidates(pcs).index(shape))
        model = fit([row])
        self.assertTrue(model["converged"])
        self.assertTrue(np.isfinite(model["weights"]).all())
        result = evaluate({**row, "targetIndex": -1}, model)
        self.assertFalse(result["covered"])
        self.assertTrue(all(v["rr"] == 0 for v in result["arms"].values()))


if __name__ == "__main__":
    unittest.main()
