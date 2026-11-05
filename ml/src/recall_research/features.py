from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import heapq
import math

from .data import Attempt, Dataset, SKILLS

FEATURE_VERSION = "pre-answer-v1"
FEATURE_NAMES = (
    *(f"skill:{skill}" for skill in SKILLS),
    "mode:transfer", "mode:delayed", "has_skill_history",
    "log_prior_skill_answers", "smoothed_prior_skill_accuracy",
    "log_days_since_skill_answer", "log_prior_item_exposures", "log_days_since_item_exposure",
)
DAY_MS = 86_400_000


@dataclass(frozen=True)
class FeatureRow:
    learner: str
    id: str
    skill: str
    started: float
    answered: float
    features: tuple[float, ...]
    label: int


def build_features(dataset: Dataset) -> list[FeatureRow]:
    rows: list[FeatureRow] = []
    by_learner: dict[str, list[Attempt]] = defaultdict(list)
    for attempt in dataset.attempts:
        by_learner[attempt.learner].append(attempt)
    for learner, attempts in sorted(by_learner.items()):
        pending: list[tuple[float, str, Attempt]] = []
        skill_counts: dict[str, int] = defaultdict(int)
        skill_correct: dict[str, int] = defaultdict(int)
        skill_last: dict[str, float] = {}
        item_counts: dict[str, int] = defaultdict(int)
        item_last: dict[str, float] = {}
        for current in sorted(attempts, key=lambda attempt: (attempt.started, attempt.id)):
            # An earlier-starting attempt may still be unfinished. Its label is unavailable.
            while pending and pending[0][0] < current.started:
                _, _, previous = heapq.heappop(pending)
                if previous.eligible:
                    skill_counts[previous.skill] += 1
                    skill_correct[previous.skill] += int(previous.outcome == "correct")
                    skill_last[previous.skill] = previous.answered
                if previous.outcome in ("correct", "incorrect", "revealed") and previous.evidence == "answer":
                    item_counts[previous.exercise] += 1
                    item_last[previous.exercise] = previous.answered
            count = skill_counts[current.skill]
            last_skill = skill_last.get(current.skill)
            last_item = item_last.get(current.exercise)
            values = (
                *(float(current.skill == skill) for skill in SKILLS),
                float(current.mode == "transfer"), float(current.mode == "delayed"), float(count > 0),
                math.log1p(count), (skill_correct[current.skill] + 1) / (count + 2),
                math.log1p((current.started - last_skill) / DAY_MS) if last_skill is not None else 0.0,
                math.log1p(item_counts[current.exercise]),
                math.log1p((current.started - last_item) / DAY_MS) if last_item is not None else 0.0,
            )
            if current.eligible:
                rows.append(FeatureRow(learner, current.id, current.skill, current.started, current.answered, values, int(current.outcome == "correct")))
            heapq.heappush(pending, (current.answered, current.id, current))
    return sorted(rows, key=lambda row: (row.started, row.learner, row.id))
