# Public recall benchmark

This experiment predicts the next **Anki self-rated recall outcome** in a bounded public flashcard dataset. It exercises the data, fitting, evaluation, and artifact lineage needed for recall research. It does not train on TabToPitch attempts, change the app scheduler, or measure guitar learning.

[Measured results](results.md) report the frozen run and its limitations.

## Source and permissions

The source is Open Spaced Repetition's [fsrs-dataset](https://huggingface.co/datasets/open-spaced-repetition/fsrs-dataset), frozen at revision `ae96575728d364265a75f2447fe7b7fa389ba96c`. Its [dataset card](https://huggingface.co/datasets/open-spaced-repetition/fsrs-dataset/blob/ae96575728d364265a75f2447fe7b7fa389ba96c/README.md) declares `license: mit`. This is the older dataset, not FSRS-Anki-20k or anki-revlogs-10k, which have different terms.

Attribution: Open Spaced Repetition, FSRS dataset, accessed October 29, 2026. We preserve the source card, repository revision, source URLs, and SHA-256 checksums locally. The dataset card has no narrative documentation or participant-level consent records. We rely on the publisher's public license declaration for this external research benchmark. We do not manufacture TabToPitch consent records or assert that these people consented to a TabToPitch study.

The `float-delta-t` variant contains numeric review timestamps, card identifiers, ratings, and prior-history fields. Ratings above 1 map to the source's binary `y=1`. These are user ratings, not independently graded answers. No card text is downloaded by the adapter. Each source file is treated as a collection group. A collection is a learner proxy; the source card does not establish whether different files always represent different people.

We also considered [Duolingo HLR](https://github.com/duolingo/halflife-regression). Its code's MIT license does not establish the dataset's terms. The primary Dataverse record was inaccessible during this run, and secondary metadata indicated noncommercial data terms, so it was not used. The newer [Anki dataset's license](https://huggingface.co/datasets/open-spaced-repetition/anki-revlogs-10k/blob/main/LICENSE) limits use to specified research contexts and disallows public redistribution. We did not use it for the product showcase.

## Research contract

The question is whether a small model using prior card history predicts future self-ratings better than fixed and history baselines under time and collection separation. The decision is whether our experimental method and lineage are usable on real public data. Even a positive result does not justify a guitar model or a teaching policy.

[`protocol.json`](protocol.json) freezes the cohort, sampling, features, controls, metrics, and cleanup gates before fitting. The downloader selects 24 of 71 source files by filename hash and independently holds out 6. A hash selects one quarter of cards within each file, retaining their complete source histories. Selection never uses ratings. Source files are bounded at 150 MB each; the run stops if a selected file is missing or fails validation. Downloads can retry failed reads three times. Analysis outputs are immutable and an existing output directory is rejected.

The global cutoff is the 70th percentile timestamp among eligible rows from the 18 collections reserved for fitting, calculated without outcomes. Fitting uses earlier rows only. The temporal test contains later reviews only from collections that supplied fitting rows. Non-reserved collections with no eligible pre-cutoff rows are reported separately as an exploratory post-only diagnostic. The collection test contains later reviews from the six never-fitted collections. Earlier held-out and evaluation-period responses can contribute to later history, as they could online, but parameters never refit. This is not a cold-start evaluation.

Features are reconstructed from earlier rows for the same card. Supplied `i`, `t_history`, and `r_history` do not enter the model. Features are log elapsed days since the preceding observed review, log prior review and lapse counts, smoothed prior recall rate, previous rating, and log previous elapsed days. Current ratings, outcomes, and response durations are excluded. Card IDs and collection names are grouping keys, never features.

Exact duplicates are dropped. All conflicting same-card/same-time rows are removed because their order is unknown. First observed card reviews and reviews less than one day after the previous observed review do not become training or evaluation labels. Short-term events still provide history for later reviews. These exclusions and raw denominators are reported. The source has already been preprocessed upstream; this experiment cannot restore missing reviews or verify the original collection procedure.

The controls are a training-only global mean and card-history frequency shrunk by ten observations toward that mean. The candidate is L2 logistic regression with `C=1`, training-only standardization, no class reweighting, and no hyperparameter search. All model comparisons use the same eligible reviews. This is not a reproduction of the upstream FSRS benchmark, whose sampling, algorithms, and splits differ.

Brier score and binary log loss are sums over reviews divided by the number of reviews. Every valid selected review has equal weight. Collection-macro Brier averages within each collection, then gives collections equal weight. Ten fixed probability bins report count, mean prediction, and observed self-rated recall; empty bins are unavailable. Paired 95% intervals resample collection groups 1,000 times with the fitted model held fixed. They describe uncertainty within this selected cohort, exclude fitting uncertainty, and are limited by six held-out groups. Missing splits or target classes stop the run rather than becoming zero-valued metrics.

## Reproduce locally

Use Python 3.12. The scripts write only to the explicit output paths and do not import a cloud SDK.

```sh
uv --no-config venv --python 3.12 /tmp/tabtopitch-recall-env
uv --no-config pip install --python /tmp/tabtopitch-recall-env/bin/python -r requirements.txt
/tmp/tabtopitch-recall-env/bin/python download.py --output /absolute/path/recall-data
/tmp/tabtopitch-recall-env/bin/python benchmark.py \
  --data /absolute/path/recall-data \
  --output /absolute/path/recall-data/run-001
```

`selection.json` freezes the outcome-blind cohort. `dataset-manifest-local.json` records source files and checksums. `split-manifest-local.json` records exact hashed row membership. `predictions-local.jsonl` permits independent metric reconciliation. These files remain local.

The publication allowlist is `report.json`, `model.json`, `dataset-manifest.json`, `run-manifest.json`, and `metrics.json`. It contains aggregate metrics and calibration, plain JSON coefficients, source/license metadata, and hashes. It contains no review rows, card IDs, collection names, per-review timestamps, histories, or answer text. The full local split manifest is represented in cloud lineage by its hash only. The allowlisted run manifest records the core software versions used; requirements.txt pins all dependencies. The publisher is a separate explicit step owned by the [Forge research tooling](../forge/README.md).

The model records `promotionEligible:false` and `servingEnabled:false`. No Registry linking or app inference is part of this benchmark. Any guitar model needs consented guitar-specific observations and a separate prospective evaluation.
