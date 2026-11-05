"""Offline public-data proxy benchmark. Never imports a cloud SDK."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import warnings

import numpy as np
import pandas as pd
import sklearn
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

FEATURES = [
    "log_elapsed_days",
    "log_prior_reviews",
    "log_prior_lapses",
    "prior_smoothed_recall",
    "previous_rating_1",
    "previous_rating_2",
    "previous_rating_3",
    "previous_rating_4",
    "log_previous_elapsed_days",
]


def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha_file(path):
    return sha_bytes(path.read_bytes())


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def card_selected(collection, card):
    return (
        int(sha_bytes(f"tabtopitch-card-v1:{collection}:{card}".encode()), 16) % 4 == 0
    )


def build_features(frame, collection, apply_sampling=True):
    """Preserve all sampled-card events; exclude tied card timestamps entirely."""
    counts = {"source_rows": len(frame)}
    required = ["review_time", "card_id", "review_rating", "y"]
    if frame[required].isna().any().any():
        raise ValueError("Missing source value")
    if (
        not frame.review_rating.isin([1, 2, 3, 4]).all()
        or not frame.y.isin([0, 1]).all()
    ):
        raise ValueError("Invalid source rating")
    if not ((frame.review_rating > 1).astype(int) == frame.y).all():
        raise ValueError("Upstream target disagrees with review rating")
    frame = frame.drop_duplicates().copy()
    counts["exact_duplicates"] = counts["source_rows"] - len(frame)
    if apply_sampling:
        selected = {
            int(x) for x in frame.card_id.unique() if card_selected(collection, int(x))
        }
        before = len(frame)
        frame = frame[frame.card_id.isin(selected)].copy()
        counts["outside_card_sample"] = before - len(frame)
    else:
        counts["outside_card_sample"] = 0
    # An ambiguous same-card timestamp cannot establish an order. Remove every tied event.
    tied = frame.duplicated(["card_id", "review_time"], keep=False)
    counts["ambiguous_timestamps"] = int(tied.sum())
    frame = frame[~tied].copy()
    frame = frame.sort_values(["card_id", "review_time"], kind="stable").reset_index(
        drop=True
    )
    g = frame.groupby("card_id", sort=False)
    prior_n = g.cumcount()
    prior_correct = g.y.cumsum() - frame.y
    prior_lapses = prior_n - prior_correct
    elapsed = (frame.review_time - g.review_time.shift()) / 86400000.0
    previous_elapsed = elapsed.groupby(frame.card_id, sort=False).shift().fillna(0)
    previous_grade = g.review_rating.shift().fillna(0)
    frame["log_elapsed_days"] = np.log1p(elapsed.fillna(0))
    frame["log_prior_reviews"] = np.log1p(prior_n)
    frame["log_prior_lapses"] = np.log1p(prior_lapses)
    frame["prior_smoothed_recall"] = (prior_correct + 1) / (prior_n + 2)
    for grade in [1, 2, 3, 4]:
        frame[f"previous_rating_{grade}"] = (previous_grade == grade).astype(float)
    frame["log_previous_elapsed_days"] = np.log1p(previous_elapsed)
    frame["prior_n"] = prior_n
    frame["prior_correct"] = prior_correct
    first = prior_n == 0
    short = (~first) & (elapsed < 1)
    counts["first_observation"] = int(first.sum())
    counts["less_than_one_day"] = int(short.sum())
    eligible = frame[(~first) & (~short)].copy()
    eligible["collection"] = collection
    eligible["row_key"] = [
        sha_bytes(f"{collection}:{int(c)}:{int(t)}".encode())
        for c, t in zip(eligible.card_id, eligible.review_time)
    ]
    counts["eligible"] = len(eligible)
    if not np.isfinite(eligible[FEATURES].to_numpy()).all():
        raise ValueError("Nonfinite features")
    return eligible, counts


def row_metrics(y, p):
    p = np.clip(p, 1e-7, 1 - 1e-7)
    return (p - y) ** 2, -(y * np.log(p) + (1 - y) * np.log1p(-p))


def summarize(frame, p):
    y = frame.y.to_numpy()
    b, ll = row_metrics(y, p)
    macro = (
        pd.DataFrame({"g": frame.collection.to_numpy(), "b": b}).groupby("g").b.mean()
    )
    bins = []
    for i in range(10):
        mask = (p >= i / 10) & ((p < (i + 1) / 10) if i < 9 else (p <= 1))
        bins.append(
            {
                "lower": i / 10,
                "upper": (i + 1) / 10,
                "reviews": int(mask.sum()),
                "mean_prediction": float(np.mean(p[mask])) if mask.any() else None,
                "self_rated_recall_rate": float(np.mean(y[mask]))
                if mask.any()
                else None,
            }
        )
    return {
        "reviews": len(frame),
        "collections": int(frame.collection.nunique()),
        "self_rated_recalled": int(y.sum()),
        "self_rated_recall_rate": float(y.mean()),
        "brier": float(b.mean()),
        "log_loss": float(ll.mean()),
        "collection_macro_brier": float(macro.mean()),
        "calibration": bins,
    }


def bootstrap_difference(frame, candidate, baseline, seed=29, reps=1000):
    b1, ll1 = row_metrics(frame.y.to_numpy(), candidate)
    b0, ll0 = row_metrics(frame.y.to_numpy(), baseline)
    groups = (
        pd.DataFrame(
            {"g": frame.collection.to_numpy(), "b": b1 - b0, "ll": ll1 - ll0, "n": 1}
        )
        .groupby("g")
        .sum()
    )
    values = groups[["b", "ll", "n"]].to_numpy()
    rng = np.random.default_rng(seed)
    indices = rng.integers(0, len(values), size=(reps, len(values)))
    sampled = values[indices].sum(axis=1)
    return {
        "method": "paired collection cluster bootstrap, fixed fitted model, percentile 95% CI",
        "replicates": reps,
        "groups": len(values),
        "candidate_minus_baseline": {
            "brier": {
                "estimate": float(np.mean(b1 - b0)),
                "low": float(np.quantile(sampled[:, 0] / sampled[:, 2], 0.025)),
                "high": float(np.quantile(sampled[:, 0] / sampled[:, 2], 0.975)),
            },
            "log_loss": {
                "estimate": float(np.mean(ll1 - ll0)),
                "low": float(np.quantile(sampled[:, 1] / sampled[:, 2], 0.025)),
                "high": float(np.quantile(sampled[:, 1] / sampled[:, 2], 0.975)),
            },
        },
    }


def fit(frame):
    scaler = StandardScaler().fit(frame[FEATURES].to_numpy())
    model = LogisticRegression(
        C=1.0, solver="lbfgs", max_iter=1000, tol=1e-7, random_state=29
    )
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        model.fit(scaler.transform(frame[FEATURES].to_numpy()), frame.y.to_numpy())
    return scaler, model


def split_at_cutoff(frame, holdout, cutoff):
    train_mask = (~holdout) & (frame.review_time < cutoff)
    fitted_collections = set(frame.loc[train_mask, "collection"])
    post_only = (
        (~holdout)
        & (~frame.collection.isin(fitted_collections))
        & (frame.review_time >= cutoff)
    )
    masks = {
        "train": train_mask,
        "temporal": (~holdout)
        & frame.collection.isin(fitted_collections)
        & (frame.review_time >= cutoff),
        "heldout": holdout & (frame.review_time >= cutoff),
        "post_only_diagnostic": post_only,
    }
    splits = {k: frame.loc[v].copy() for k, v in masks.items()}
    return splits


def run(data, output):
    if output.exists():
        raise ValueError("Refusing to overwrite prior run")
    output.mkdir(parents=True)
    manifest = json.loads((data / "dataset-manifest-local.json").read_text())
    selection = json.loads((data / "selection.json").read_text())
    protocol_path = Path(__file__).with_name("protocol.json")
    protocol = json.loads(protocol_path.read_text())
    if sha_file(protocol_path) != selection["protocolSha256"]:
        raise ValueError("Protocol changed after cohort freeze")
    pieces = []
    exclusions = {}
    counts = {}
    for source in manifest["files"]:
        path = data / "raw" / Path(source["sourceFile"]).name
        if sha_file(path) != source["sha256"]:
            raise ValueError("Source hash mismatch")
        df = pd.read_csv(
            path, sep="\t", usecols=["review_time", "card_id", "review_rating", "y"]
        )
        prepared, count = build_features(df, source["sourceFile"])
        pieces.append(prepared)
        counts[source["sourceFile"]] = count
        for k, v in count.items():
            exclusions[k] = exclusions.get(k, 0) + v
    frame = pd.concat(pieces, ignore_index=True)
    holdout = frame.collection.isin(selection["heldoutFiles"])
    # Timestamp order statistic alone fixes the cutoff; no outcomes guide this split.
    timestamps = np.sort(frame.loc[~holdout, "review_time"].to_numpy())
    cutoff = int(timestamps[int(0.7 * len(timestamps))])
    splits = split_at_cutoff(frame, holdout, cutoff)
    for name, part in splits.items():
        if len(part) == 0 or part.y.nunique() != 2:
            raise ValueError(f"Invalid split {name}")
    train = splits["train"]
    mu = float(train.y.mean())
    split_manifest = {
        "cutoffMs": cutoff,
        "cutoffUtc": datetime.fromtimestamp(cutoff / 1000, timezone.utc).isoformat(),
        "protocolSha256": sha_file(protocol_path),
        "datasetManifestSha256": sha_file(data / "dataset-manifest-local.json"),
        "rows": {k: sorted(v.row_key.tolist()) for k, v in splits.items()},
        "heldoutFiles": selection["heldoutFiles"],
        "denominators": {
            k: {"reviews": len(v), "collections": int(v.collection.nunique())}
            for k, v in splits.items()
        },
        "heldout_pre_cutoff_rows_not_fitted": int(
            (holdout & (frame.review_time < cutoff)).sum()
        ),
        "post_only_diagnostic": "Nonreserved collections with no eligible rows before cutoff; exploratory diagnostic added to expose cohort membership, not a primary test.",
    }
    dump(output / "split-manifest-local.json", split_manifest)
    scaler, model = fit(train)
    params = model.coef_[0] / scaler.scale_
    intercept = float(model.intercept_[0] - np.dot(params, scaler.mean_))
    report = {
        "schemaVersion": 1,
        "analysisRevision": "3-publication-privacy",
        "priorRunNote": "run-001 included post-only nonreserved collections in the temporal test. Its results are preserved locally. This revision restricts temporal to collections with fitting rows and reports post-only groups separately. Model and holdout are unchanged. run-003 removes the source-derived exact cutoff timestamp from the public report; run-002 numerical results are unchanged.",
        "experiment": protocol["experiment"],
        "target": "Anki self-rated recall (review_rating > 1)",
        "synthetic": False,
        "promotionEligible": False,
        "exclusions": exclusions,
        "splits": split_manifest["denominators"],
        "heldout_pre_cutoff_rows_not_fitted": split_manifest[
            "heldout_pre_cutoff_rows_not_fitted"
        ],
        "fit": {
            "reviews": len(train),
            "collections": int(train.collection.nunique()),
            "positiveReviews": int(train.y.sum()),
            "fixedMean": mu,
            "nIterations": model.n_iter_.tolist(),
        },
        "results": {},
        "limitations": [
            "Flashcard self-ratings are not verified answers, guitar knowledge, or observed playing.",
            "Upstream card declares MIT but has no narrative dataset documentation. Source file is a collection proxy; independence of people across files is not established.",
            "This is a bounded selected cohort, not the upstream FSRS benchmark or a population estimate.",
            "Source preprocessing predates this experiment. Content, hint use, intervention assignment, and demographics are unavailable.",
            "Later evaluation outcomes may enter strictly later history features; model parameters remain frozen.",
            "Bootstrap intervals condition on the selected cohort and fitted model; 6 heldout collection groups offer limited group-level precision.",
            "Prediction performance does not establish an effective teaching policy or support deployment.",
        ],
    }
    prediction_records = []
    for name in ["temporal", "heldout", "post_only_diagnostic"]:
        part = splits[name]
        predictions = {
            "fixed_mean": np.full(len(part), mu),
            "card_history": (part.prior_correct.to_numpy() + 10 * mu)
            / (part.prior_n.to_numpy() + 10),
            "logistic": model.predict_proba(
                scaler.transform(part[FEATURES].to_numpy())
            )[:, 1],
        }
        report["results"][name] = {
            "models": {k: summarize(part, p) for k, p in predictions.items()},
            "paired_differences": {
                k: bootstrap_difference(part, predictions["logistic"], predictions[k])
                for k in ["fixed_mean", "card_history"]
            },
        }
        for i, (_, r) in enumerate(part.iterrows()):
            prediction_records.append(
                {
                    "row": r.row_key,
                    "split": name,
                    "y": int(r.y),
                    **{k: float(p[i]) for k, p in predictions.items()},
                }
            )
    model_export = {
        "schemaVersion": 1,
        "modelType": "regularized-logistic-regression",
        "target": report["target"],
        "featureNames": FEATURES,
        "coefficients": params.tolist(),
        "intercept": intercept,
        "trainMean": mu,
        "C": 1.0,
        "historyShrinkage": 10,
        "promotionEligible": False,
        "servingEnabled": False,
        "synthetic": False,
        "scope": "public-flashcard-proxy-research-only",
    }
    # This is an aggregate-only metadata derivative, without collection filenames or row IDs.
    public_dataset = {
        k: v for k, v in manifest.items() if k not in ["files", "fetchedAt"]
    }
    public_dataset["selectedCollectionCount"] = len(manifest["files"])
    public_dataset["sourceBytes"] = sum(x["bytes"] for x in manifest["files"])
    public_dataset["sourceFileSha256"] = sorted(x["sha256"] for x in manifest["files"])
    public_dataset["localDatasetManifestSha256"] = sha_file(
        data / "dataset-manifest-local.json"
    )
    dump(output / "report.json", report)
    dump(output / "model.json", model_export)
    dump(output / "dataset-manifest.json", public_dataset)
    # Local evidence only. The publisher must not include this file in an artifact.
    with (output / "predictions-local.jsonl").open("w") as f:
        for row in prediction_records:
            f.write(json.dumps(row) + "\n")
    run_manifest = {
        "schemaVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "experiment": protocol["experiment"],
        "synthetic": False,
        "target": report["target"],
        "promotionEligible": False,
        "codeSha256": sha_file(Path(__file__)),
        "requirementsSha256": sha_file(Path(__file__).with_name("requirements.txt")),
        "protocolSha256": sha_file(protocol_path),
        "datasetManifestSha256": public_dataset["localDatasetManifestSha256"],
        "splitManifestSha256": sha_file(output / "split-manifest-local.json"),
        "modelSha256": sha_file(output / "model.json"),
        "reportSha256": sha_file(output / "report.json"),
        "runtime": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "sklearn": sklearn.__version__,
        },
        "publicationAllowlist": [
            "report.json",
            "model.json",
            "dataset-manifest.json",
            "run-manifest.json",
            "metrics.json",
        ],
        "reproduction": "python benchmark.py --data <download-directory> --output <new-output-directory>",
    }
    dump(output / "run-manifest.json", run_manifest)
    metrics = {
        f"{split}/{model}/{metric}": value
        for split, r in report["results"].items()
        for model, m in r["models"].items()
        for metric, value in m.items()
        if isinstance(value, (int, float))
    }
    dump(output / "metrics.json", metrics)
    print(
        json.dumps(
            {
                "output": str(output),
                "splits": report["splits"],
                "results": {
                    s: {
                        m: {
                            k: v
                            for k, v in ms.items()
                            if k in ["brier", "log_loss", "reviews", "collections"]
                        }
                        for m, ms in r["models"].items()
                    }
                    for s, r in report["results"].items()
                },
            },
            indent=2,
        )
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run(args.data, args.output)


if __name__ == "__main__":
    main()
