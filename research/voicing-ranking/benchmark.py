"""Predict observed shapes; valid alternatives are not incorrect musical answers."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import platform
import shutil
import time

import numpy as np
from scipy.optimize import minimize
from scipy.special import logsumexp
import scipy

HERE = Path(__file__).resolve().parent
TUNING = (64, 59, 55, 50, 45, 40)
ARMS = ("uniform", "compact", "movement", "frequency", "learned")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def shape_key(shape):
    return ",".join(map(str, shape))


def pitches(shape):
    return sorted(TUNING[s] + f for s, f in enumerate(shape) if f >= 0)


def fretted(shape):
    return [f for f in shape if f > 0]


def center(shape):
    fs = fretted(shape)
    return float(np.mean(fs)) if fs else 0.0


def span(shape):
    fs = fretted(shape)
    return max(fs) - min(fs) if fs else 0


def relative_key(shape):
    fs = fretted(shape)
    low = min(fs) if fs else 0
    return tuple(f if f <= 0 else f - low + 1 for f in shape)


@lru_cache(maxsize=None)
def candidates(multiset):
    """Independent exhaustive enumeration; receives no observed target shape."""
    remaining = Counter(multiset)
    n = len(multiset)
    out = []
    choices = [tuple(f for f in range(25) if (o + f) % 12 in remaining) for o in TUNING]

    def visit(s, used, shape, lo, hi):
        if used > n or used + 6 - s < n:
            return
        if s == 6:
            if used == n:
                out.append(tuple(shape))
            return
        visit(s + 1, used, shape + [-1], lo, hi)
        for fret in choices[s]:
            pc = (TUNING[s] + fret) % 12
            if not remaining[pc]:
                continue
            nl, nh = (min(lo, fret), max(hi, fret)) if fret > 0 else (lo, hi)
            if nh - nl > 4:
                continue
            remaining[pc] -= 1
            visit(s + 1, used + 1, shape + [fret], nl, nh)
            remaining[pc] += 1

    visit(0, 0, [], 25, -1)
    return tuple(sorted(out))


def valid(shape, multiset):
    return len(shape) == 6 and all(-1 <= f <= 24 for f in shape) and span(shape) <= 4 and tuple(sorted(m % 12 for m in pitches(shape))) == multiset


def feature(shape, previous):
    ps, qs = pitches(shape), pitches(previous)
    ss = [s for s, f in enumerate(shape) if f >= 0]
    # Linear interpolation makes movement comparable if voice counts differ.
    count = max(len(ps), len(qs))
    x = np.linspace(0, 1, count)
    distance = np.mean(np.abs(np.interp(x, np.linspace(0, 1, len(ps)), ps) - np.interp(x, np.linspace(0, 1, len(qs)), qs)))
    return [span(shape), center(shape), sum(f == 0 for f in shape), max(ss) - min(ss), max(ss) - min(ss) + 1 - len(ss), abs(ps[0] - qs[0]), abs(ps[-1] - qs[-1]), float(distance), abs(center(shape) - center(previous)), sum(f >= 0 and f == previous[s] for s, f in enumerate(shape))]


def extract(source):
    rows, exclusions = [], Counter()
    for line in Path(source).read_text().splitlines():
        recording = json.loads(line)
        if recording["rendition"] != "comp" or recording["split"] == "upstream-erratum":
            exclusions["non_comp_or_upstream_erratum"] += 1
            continue
        notes = [n for n in recording["sourceNotes"] if not n["exclusionReasons"]]
        states = []
        for t in sorted(set(n["timeSeconds"] + 0.04 for n in notes)):
            active = [n for n in notes if n["timeSeconds"] <= t and n["timeSeconds"] + n["durationSeconds"] >= t + 0.04]
            if not 3 <= len(active) <= 6 or len({n["sourceStringIndex"] for n in active}) != len(active):
                exclusions["voice_count_or_string_overlap"] += 1
                continue
            shape = [-1] * 6
            for n in active:
                shape[5 - n["sourceStringIndex"]] = n["inferredFret"]
            shape = tuple(shape)
            pcs = tuple(sorted(n["nearestMidi"] % 12 for n in active))
            if not 3 <= len(set(pcs)) <= 4 or span(shape) > 4:
                exclusions["pitchclass_count_or_span"] += 1
                continue
            if states and shape == states[-1][1]:
                continue
            states.append((t, shape, pcs, [n["id"] for n in active]))
        for previous, current in zip(states, states[1:]):
            t, shape, pcs, ids = current
            if t - previous[0] > 2:
                exclusions["transition_gap"] += 1
                continue
            choices = candidates(pcs)
            if any(not valid(c, pcs) for c in choices):
                raise ValueError("Illegal enumerated candidate")
            target = choices.index(shape) if shape in choices else -1
            rows.append({"id": f'{recording["id"]}:{t:.8f}', "recording": recording["id"], "performer": recording["performerId"], "family": recording["progressionFamily"], "sourceSha256": recording["sourceSha256"], "noteIds": ids, "timeSeconds": t, "previous": previous[1], "observed": shape, "pitchClassMultiset": pcs, "pitchClassCount": len(set(pcs)), "candidateCount": len(choices), "targetIndex": target})
    return rows, dict(exclusions)


def pack(rows, normalized=None):
    matrices = [np.asarray([feature(c, r["previous"]) for c in candidates(tuple(r["pitchClassMultiset"]))], dtype=float) for r in rows]
    if any(m.size == 0 or not np.isfinite(m).all() for m in matrices):
        raise ValueError("Empty or nonfinite candidate features")
    all_x = np.vstack(matrices)
    if normalized is None:
        mu, sd = all_x.mean(axis=0), all_x.std(axis=0)
        sd[sd < 1e-12] = 1
    else:
        mu, sd = map(np.asarray, normalized)
    return matrices, (all_x - mu) / sd, mu, sd


def fit(rows):
    fit_rows = [r for r in rows if r["targetIndex"] >= 0]
    if not fit_rows:
        raise ValueError("Empty fitting fold")
    matrices, x, mu, sd = pack(fit_rows)
    sizes = np.array([len(m) for m in matrices])
    starts = np.r_[0, np.cumsum(sizes)[:-1]]
    target = starts + np.array([r["targetIndex"] for r in fit_rows])
    counts = Counter(r["recording"] for r in fit_rows)
    weights = np.array([1 / counts[r["recording"]] / len(counts) for r in fit_rows])
    group = np.repeat(np.arange(len(fit_rows)), sizes)

    def objective(w):
        z = x @ w
        maxima = np.maximum.reduceat(z, starts)
        ez = np.exp(z - maxima[group])
        totals = np.add.reduceat(ez, starts)
        loss = np.dot(weights, np.log(totals) + maxima - z[target]) + 0.005 * np.dot(w, w)
        coeff = ez / totals[group] * weights[group]
        coeff[target] -= weights
        return float(loss), x.T @ coeff + 0.01 * w

    result = minimize(objective, np.zeros(x.shape[1]), jac=True, method="L-BFGS-B", options={"maxiter": 500, "ftol": 1e-10, "gtol": 1e-7})
    if not result.success or not np.isfinite(result.fun):
        raise RuntimeError(f"Optimizer failure: {result.message}")
    frequency = Counter()
    for row in fit_rows:
        frequency[relative_key(row["observed"])] += 1 / counts[row["recording"]]
    return {"weights": result.x.tolist(), "mean": mu.tolist(), "std": sd.tolist(), "objective": float(result.fun), "iterations": int(result.nit), "converged": True, "trainingRows": len(fit_rows), "trainingRecordings": len(counts), "frequency": [{"shape": list(k), "weight": v} for k, v in sorted(frequency.items())]}


def evaluate(row, model):
    choices = candidates(tuple(row["pitchClassMultiset"]))
    target = row["targetIndex"]
    frequency = {tuple(x["shape"]): x["weight"] for x in model["frequency"]}
    start = time.perf_counter()
    features = np.asarray([feature(c, row["previous"]) for c in choices])
    compact = lambda i: (features[i, 0], features[i, 1], features[i, 4], choices[i])
    orders = {
        "uniform": sorted(range(len(choices)), key=lambda i: hashlib.sha256(("voicing-v1:" + shape_key(choices[i])).encode()).hexdigest()),
        "compact": sorted(range(len(choices)), key=compact),
        "movement": sorted(range(len(choices)), key=lambda i: (features[i, 7], features[i, 8], features[i, 0], choices[i])),
        "frequency": sorted(range(len(choices)), key=lambda i: (-frequency.get(relative_key(choices[i]), 0), compact(i))),
    }
    z = ((features - np.asarray(model["mean"])) / np.asarray(model["std"])) @ np.asarray(model["weights"])
    orders["learned"] = sorted(range(len(choices)), key=lambda i: (-z[i], choices[i]))
    elapsed = (time.perf_counter() - start) * 1000
    out = {"id": row["id"], "recording": row["recording"], "performer": row["performer"], "family": row["family"], "pitchClassCount": row["pitchClassCount"], "candidateCount": len(choices), "covered": target >= 0, "rankingAllArmsMs": elapsed, "arms": {}}
    for arm, order in orders.items():
        rank = order.index(target) + 1 if target >= 0 else None
        out["arms"][arm] = {"rank": rank, "rr": 1 / rank if rank else 0, "top1": int(rank == 1), "top3": int(rank is not None and rank <= 3), "topShape": choices[order[0]]}
    out["conditionalLogLoss"] = float(logsumexp(z) - z[target]) if target >= 0 else None
    return out


def recording_scores(predictions, arm, metric):
    groups = defaultdict(list)
    for p in predictions:
        groups[p["recording"]].append(p["arms"][arm][metric])
    return {k: float(np.mean(v)) for k, v in groups.items()}


def aggregate(predictions):
    return {arm: {metric: float(np.mean(list(recording_scores(predictions, arm, metric).values()))) for metric in ("rr", "top1", "top3")} for arm in ARMS}


def summarize(rows, predictions, models, excluded):
    metrics = aggregate(predictions)
    slices = {field: {value: aggregate([p for p in predictions if str(p[field]) == value]) for value in sorted(set(str(p[field]) for p in predictions))} for field in ("performer", "family", "pitchClassCount")}
    paired = {}
    learned = recording_scores(predictions, "learned", "rr")
    for arm in ARMS[:-1]:
        baseline = recording_scores(predictions, arm, "rr")
        delta = np.array([learned[k] - baseline[k] for k in sorted(learned)])
        rng = np.random.default_rng(29)
        bootstrap = np.mean(rng.choice(delta, size=(1000, len(delta)), replace=True), axis=1)
        paired[arm] = {"mrrDifference": float(delta.mean()), "recordingBootstrap95": np.quantile(bootstrap, [.025, .975]).tolist(), "recordingWins": int((delta > 1e-12).sum()), "recordingLosses": int((delta < -1e-12).sum()), "recordingTies": int((abs(delta) <= 1e-12).sum()), "performerMacroSensitivity": {key: value["learned"]["rr"] - value[arm]["rr"] for key, value in slices["performer"].items()}}
    gate = all(p["mrrDifference"] >= .03 for p in paired.values()) and all(v["learned"]["rr"] >= v[a]["rr"] for v in slices["family"].values() for a in ARMS[:-1])
    return {"experiment": "observed-voicing-ranking-v1", "target": "observed shape recovery, not educational benefit", "rows": len(rows), "recordings": len(learned), "folds": len(models), "performers": 6, "progressionFamilies": 3, "excluded": excluded, "candidateCoverage": float(np.mean([p["covered"] for p in predictions])), "candidateCountRange": [min(p["candidateCount"] for p in predictions), max(p["candidateCount"] for p in predictions)], "engineValidity": 1.0, "metrics": metrics, "paired": paired, "slices": slices, "conditionalLogLossCovered": float(np.mean([p["conditionalLogLoss"] for p in predictions if p["conditionalLogLoss"] is not None])), "rankingAllArmsMsMedian": float(np.median([p["rankingAllArmsMs"] for p in predictions])), "shadowGatePassed": gate, "servingEnabled": False, "productionPromotion": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        rows = json.loads((args.output / "examples.json").read_text())
        models = json.loads((args.output / "model.json").read_text())["folds"]
        saved = json.loads((args.output / "predictions.json").read_text())
        actual = [evaluate(r, models[f'{r["performer"]}-{r["family"]}']) for r in rows]
        for a, b in zip(actual, saved, strict=True):
            if a["arms"] != b["arms"] or abs(a["conditionalLogLoss"] - b["conditionalLogLoss"]) > 1e-9:
                raise ValueError("Prediction replay differs")
        write(args.output / "prediction-replay.json", {"matched": len(actual), "maxLogLossTolerance": 1e-9, "modelSha256": sha(args.output / "model.json"), "freshProcess": True})
        print(json.dumps({"replayed": len(actual)}))
        return
    args.output.mkdir(parents=True, exist_ok=False)
    source_files = sorted(HERE.glob("*.py")) + [HERE / "protocol.json", HERE / "requirements.txt"]
    snapshot = args.output / "source"
    snapshot.mkdir()
    for f in source_files:
        shutil.copyfile(f, snapshot / f.name)
    manifest = {"status": "frozen-before-fit", "experiment": "observed-voicing-ranking-v1", "sourceSha256": sha(args.source), "implementationSha256": {f.name: sha(f) for f in source_files}, "versions": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__}, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    write(args.output / "manifest.json", manifest)
    rows, excluded = extract(args.source)
    if not rows:
        raise ValueError("No eligible rows")
    write(args.output / "examples.json", rows)
    models, predictions, splits = {}, [], {}
    for person in [f'{x:02d}' for x in range(6)]:
        for family in ("1", "2", "3"):
            key = f"{person}-{family}"
            train = [r for r in rows if r["performer"] != person and r["family"] != family]
            test = [r for r in rows if r["performer"] == person and r["family"] == family]
            if not train or not test:
                raise ValueError("Empty fold")
            models[key] = fit(train)
            predictions.extend(evaluate(r, models[key]) for r in test)
            splits[key] = {"trainRecordings": sorted(set(r["recording"] for r in train)), "testRecordings": sorted(set(r["recording"] for r in test)), "trainRows": len(train), "testRows": len(test)}
            print(json.dumps({"fold": key, "train": len(train), "test": len(test), "iterations": models[key]["iterations"]}), flush=True)
            write(args.output / "fold-checkpoint.json", {"models": models, "splits": splits})
    predictions.sort(key=lambda p: p["id"])
    rows.sort(key=lambda p: p["id"])
    write(args.output / "examples.json", rows)
    write(args.output / "model.json", {"modelType": "conditional-logistic", "features": json.loads((HERE / "protocol.json").read_text())["features"], "folds": models, "deployment": "research-only; fold models, no production model"})
    write(args.output / "predictions.json", predictions)
    write(args.output / "split-manifest.json", splits)
    report = summarize(rows, predictions, models, excluded)
    write(args.output / "report.json", report)
    files = ["examples.json", "model.json", "predictions.json", "split-manifest.json", "report.json", "manifest.json"]
    write(args.output / "bundle.json", {"sha256": {name: sha(args.output / name) for name in files}, "license": "CC-BY-4.0", "attribution": "Qingyang Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye, Juan P. Bello. GuitarSet: A Dataset for Guitar Transcription, ISMIR 2018. DOI 10.5281/zenodo.3371780", "modifications": "Filtered annotated notes; inferred frets; derived stable overlapping shapes and candidates; fitted conditional choice models", "privateProjectOnly": True})
    print(json.dumps({"rows": len(rows), "metrics": report["metrics"], "shadowGatePassed": report["shadowGatePassed"]}), flush=True)


if __name__ == "__main__":
    main()
