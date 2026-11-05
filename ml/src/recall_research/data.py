from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
from typing import Any

SKILLS = ("note-name", "note-location", "interval", "triad-role")
MODES = ("learn", "recall", "transfer", "delayed")
OUTCOMES = ("correct", "incorrect", "revealed", "interrupted", "self-reported")


class DataError(ValueError):
    """The input cannot support the declared experiment."""


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_hash(value: Any) -> str:
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False))


def timestamp(value: str) -> float:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("timezone required")
        return parsed.timestamp() * 1000
    except (ValueError, TypeError, AttributeError) as error:
        raise DataError("A timezone-qualified ISO timestamp is required.") from error


def finite_time(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise DataError(f"Invalid {label} timestamp.")
    return float(value)


@dataclass(frozen=True)
class Attempt:
    learner: str
    id: str
    exercise: str
    skill: str
    mode: str
    started: float
    answered: float
    outcome: str
    assisted: bool
    has_hints: bool
    evidence: str

    @property
    def eligible(self) -> bool:
        return self.outcome in ("correct", "incorrect") and not self.assisted and not self.has_hints and self.evidence == "answer"


@dataclass(frozen=True)
class Dataset:
    attempts: tuple[Attempt, ...]
    input_hash: str
    synthetic: bool
    learner_hashes: dict[str, str]
    artifact_upload_allowed: bool = False


def load_dataset(path: Path) -> Dataset:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise DataError("Cannot read a valid dataset JSON file.") from error
    return parse_dataset(raw)


def parse_dataset(raw: Any) -> Dataset:
    if not isinstance(raw, dict) or type(raw.get("schemaVersion")) is not int or raw["schemaVersion"] != 1:
        raise DataError("Dataset schemaVersion must be 1.")
    if raw.get("attemptSemantics") != "first-terminal-answer-v1":
        raise DataError("The dataset must declare audited first-terminal-answer-v1 semantics.")
    if type(raw.get("synthetic")) is not bool:
        raise DataError("The dataset must explicitly declare synthetic true or false.")
    learners = raw.get("learners")
    if not isinstance(learners, list) or not learners:
        raise DataError("No learner exports were supplied.")
    attempts: list[Attempt] = []
    identities: dict[str, str] = {}
    seen_attempts: set[tuple[str, str]] = set()
    for entry in learners:
        if not isinstance(entry, dict):
            raise DataError("Each learner entry must be an object.")
        learner_id = entry.get("learnerId")
        if not isinstance(learner_id, str) or not learner_id or learner_id in identities:
            raise DataError("Learner IDs must be nonempty unique pseudonyms.")
        consent = entry.get("consent")
        if not isinstance(consent, dict) or consent.get("granted") is not True or consent.get("purpose") != "recall-model-research" or consent.get("revokedAt") is not None:
            raise DataError("Every learner requires active explicit consent for recall-model-research.")
        timestamp(consent.get("recordedAt"))
        backup = entry.get("export")
        if not isinstance(backup, dict) or type(backup.get("schemaVersion")) is not int or backup["schemaVersion"] != 1 or not isinstance(backup.get("attempts"), list):
            raise DataError("Expected a schemaVersion 1 application progress export.")
        timestamp(backup.get("exportedAt"))
        learner_hash = digest(learner_id)
        identities[learner_id] = learner_hash
        for source in backup["attempts"]:
            if not isinstance(source, dict):
                raise DataError("Attempt records must be objects.")
            source_id, exercise_id = source.get("id"), source.get("exerciseId")
            if not isinstance(source_id, str) or not source_id or not isinstance(exercise_id, str) or not exercise_id:
                raise DataError("Attempts require nonempty attempt and exercise IDs.")
            identity = (learner_id, source_id)
            if identity in seen_attempts:
                raise DataError("Duplicate attempt ID within a learner. Deduplicate exports before training.")
            seen_attempts.add(identity)
            skill, mode, outcome = source.get("skillId"), source.get("mode"), source.get("outcome")
            if skill not in SKILLS or source.get("kind") != skill or mode not in MODES or outcome not in OUTCOMES:
                raise DataError("Unknown skill, mode, outcome, or inconsistent kind.")
            if type(source.get("assisted")) is not bool or not isinstance(source.get("hintsUsed"), list):
                raise DataError("Explicit assisted and hintsUsed values are required.")
            if source.get("evidence") not in ("answer", "self-report"):
                raise DataError("Unknown evidence type.")
            started = finite_time(source.get("startedAt"), "startedAt")
            answered = finite_time(source.get("answeredAt"), "answeredAt")
            if answered < started:
                raise DataError("An attempt cannot finish before it starts.")
            attempts.append(Attempt(
                learner=learner_hash, id=canonical_hash([learner_id, source_id]), exercise=digest(exercise_id),
                skill=skill, mode=mode, started=started, answered=answered, outcome=outcome,
                assisted=source["assisted"], has_hints=bool(source["hintsUsed"]), evidence=source["evidence"],
            ))
    try:
        input_hash = canonical_hash(raw)
    except (ValueError, TypeError) as error:
        raise DataError("Dataset must be finite JSON.") from error
    upload_allowed = all(entry["consent"].get("allowArtifactUpload") is True for entry in learners)
    return Dataset(tuple(attempts), input_hash, raw["synthetic"], identities, upload_allowed)
