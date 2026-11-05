import unittest
from publish_table import COLUMNS, rows_for


class ComparisonTableTest(unittest.TestCase):
    def case(self, split):
        return {"id": split + "-1", "contextId": split, "scenario": "help", "split": split,
                "request": {"request": "Help me hear this", "context": {"facts": []}}}

    def test_keeps_fallback_failure_and_unexecuted_arms_separate(self):
        case = self.case("evaluation")
        campaign = {"project": "wandb/test", "rows": [{
            "id": "revised:0:evaluation-1", "taskId": case["id"], "arm": "revised-prompt", "trial": 0,
            "output": {"message": "Try a local comparison", "source": "local", "fallbackReason": "timeout"},
            "scores": {"executableActionsValid": True}, "failure": "actor timed out",
            "traceId": "trace-1", "judge": None,
        }], "judges": [{"id": "revised:0:evaluation-1", "result": None}]}
        rows = [dict(zip(COLUMNS, r)) for r in rows_for(campaign, {
            "evaluation": [case], "development": [self.case("development")],
        })]
        self.assertEqual(len(rows), 9)
        fallback = next(r for r in rows if r["application_outcome"] == "fallback")
        self.assertEqual(fallback["actor_outcome"], "failed")
        self.assertEqual(fallback["evaluator_outcome"], "failed")
        self.assertEqual(fallback["failure"], "actor timed out")
        self.assertIsNone(fallback["lens_trace"])
        missing = next(r for r in rows if r["arm"] == "current-prompt")
        self.assertEqual(missing["application_outcome"], "unexecuted")
        self.assertIsNone(missing["execution_ms"])
        self.assertIsNone(missing["reserved_dollars"])

    def test_rejects_duplicate_and_unexpected_membership(self):
        case = self.case("evaluation")
        row = {"taskId": "unknown", "arm": "authored", "trial": 0}
        campaign = {"rows": [row]}
        cases = {"evaluation": [case], "development": []}
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            rows_for(campaign, cases)
        campaign["rows"].append(row)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            rows_for(campaign, cases)


if __name__ == "__main__":
    unittest.main()
