# Public recall results

The logistic model improved prediction of later self-ratings from previously fitted collections. It did not beat the history baseline on the six reserved collections. The held-out estimate is uncertain, and no product model was promoted.

These are real flashcard self-ratings from the [MIT-declared FSRS dataset](https://huggingface.co/datasets/open-spaced-repetition/fsrs-dataset/blob/ae96575728d364265a75f2447fe7b7fa389ba96c/README.md). They are not externally checked answers, guitar observations, or a test of a teaching policy. The [research contract](README.md#research-contract) defines sampling, eligibility, chronology, and publication restrictions.

## Cohort

The frozen cohort downloaded 24 collection files containing 1,791,362 review records. Hash-based card sampling retained 448,671 records, then excluded 49,125 first observations and 40,728 reviews with less than one elapsed day. There were no exact duplicates or ambiguous timestamps in these files. This left 358,818 eligible rows.

Training used 109,399 rows from 12 collections. The primary temporal test used 36,946 later reviews from 10 of those collections. The reserved collection test used 34,434 later reviews from six never-fitted collections. Another 168,099 earlier rows from reserved collections provided eligible history but were never fitting or test labels. Six non-reserved collections had no pre-cutoff rows and supplied a separate exploratory diagnostic with 9,940 reviews. These denominators sum to the eligible cohort.

## Primary metrics

Lower values are better. Every review has equal weight in Brier score and log loss.

| Evaluation | Model | Reviews | Collections | Brier | Log loss |
| --- | --- | ---: | ---: | ---: | ---: |
| Temporal, fitted collections | Fixed training mean | 36,946 | 10 | 0.14209 | 0.45919 |
| Temporal, fitted collections | Prior card history | 36,946 | 10 | 0.13399 | 0.43507 |
| Temporal, fitted collections | L2 logistic | 36,946 | 10 | 0.12871 | 0.41964 |
| Reserved collections | Fixed training mean | 34,434 | 6 | 0.17029 | 0.52967 |
| Reserved collections | Prior card history | 34,434 | 6 | 0.15271 | 0.47348 |
| Reserved collections | L2 logistic | 34,434 | 6 | 0.15481 | 0.48186 |

The paired temporal Brier difference, logistic minus history, was −0.00529 with a collection-bootstrap 95% interval of [−0.01273, −0.00358]. The corresponding reserved-collection difference was +0.00211 [−0.00122, +0.00250]. The held-out interval crosses zero. Six collection groups provide limited precision and the bootstrap conditions on the fitted model.

Giving each collection equal weight preserves the direction of the primary comparison. Temporal collection-macro Brier was 0.11807 for logistic and 0.12635 for history. Reserved-collection macro Brier was 0.13354 for logistic and 0.13227 for history. The report also contains ten fixed calibration bins, log-loss intervals, and the exploratory post-only diagnostic.

## Evidence and corrections

The final local artifact directory is `tabtopitch-real-data/recall/run-003`, relative to the parent workspace's `.context` directory. Its aggregate report SHA-256 is `1fd45ed156ac3a61bdfdc038cc360e087708bd5bde3314aab868f0506cb1cf48`; the model hash is `7451bfc24f517d0426382cad3127170357848a8ecae2469f4d64dd737b2f7dd3`. The run manifest records the source, frozen protocol, split, code, and dependency hashes.

`run-001` incorrectly pooled non-reserved post-only collections into the temporal result. `run-002` restricted temporal membership to collections with training rows and retained post-only results as an explicitly exploratory diagnostic. Independent review then found that the public aggregate report exposed the exact source-derived cutoff timestamp. `run-003` removes that field from the public report. The exact cutoff remains in the local split manifest, whose hash is published. The fitted model and held-out predictions did not change across these corrections; the earlier outputs and executed source snapshots remain local.

Nine focused unit checks cover feature leakage, supplied-history exclusion, timestamp ties, short-term history, target validation, deterministic selection, train-only scaling, serialized predictions, cohort membership, and paired metric aggregation. Static checks pass. An independent reviewer rebuilt all 81,320 evaluation and diagnostic predictions from the raw source rows without importing this benchmark or scikit-learn. The maximum prediction difference was 3.33e-16, and Brier, log loss, collection-macro scores, and calibration reconciled within 2.22e-16. The local receipt is `run-003/independent-audit-local.json`. Publication status and remote readback belong to the Forge publication receipts; local files alone do not establish that an upload succeeded.
