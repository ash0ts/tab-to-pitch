# TabToPitch public-data results

Recorded guitar annotations test musical references and generated answers. Public flashcard reviews test recall prediction. Hosted inference tests a bounded selection protocol. None establishes improved guitar learning; learned scheduling and Registry promotion remain disabled.

## Recorded guitar passages

[GuitarSet v1.1.0](https://zenodo.org/records/3371780), by Qingyang Xi and colleagues, is CC BY 4.0. The annotation archive matches the publisher's MD5 and our pinned SHA-256. No audio was downloaded.

The adapter processed 360 recordings, six performers, and 62,476 notes. A versioned filter retained 46,215 notes, generating 46,215 pitch-name and 44,110 alternative-location questions. Independently computed pitch answers and 139,444 enumerated alternative positions passed the grader. This checks normalized-annotation consistency, not transcription accuracy.

| Split                 | Recordings | Source notes | Eligible notes |
| --------------------- | ---------: | -----------: | -------------: |
| Train                 |         80 |       12,202 |          9,353 |
| Validation            |         20 |        3,141 |          2,159 |
| Test                  |         20 |        3,014 |          2,140 |
| Cross-group, withheld |        237 |       43,607 |         32,563 |
| Errata, excluded      |          3 |          512 |              0 |

Train uses performers 00–03/progression family 1; validation 04/2; test 05/3. Performers, progression families, and lead sheets are disjoint. Test generalization is limited to one performer/family. Three recordings with [timing](https://github.com/marl/GuitarSet/issues/5) or [duplicate-note](https://github.com/marl/GuitarSet/issues/4) errata remain intact but excluded. Frets are inferred from rounded pitch and standard tuning. Contour filtering does not diagnose technique. Missing spelling/articulation evidence excludes interval and triad-role questions.

Evidence: [provenance (archived reference)](../integration/historical-evidence.md#artifact-2a233350e07f), [integrity (archived reference)](../integration/historical-evidence.md#artifact-4f46a1612c5f), [frozen cases (archived reference)](../integration/historical-evidence.md#artifact-fb0d915cbb38), [adapter](music-data/README.md).

## Hosted coaching: protocol conformance

Twenty frozen test passages contain actual generated exercise references and empty learner history. The production privacy projection yields 16 distinct numerical contexts; the model sees candidate aliases and counts, not pitches. Agreement with the deterministic tie-breaker measures policy conformance, not musical reasoning or teaching.

The original campaign had four failed qualification attempts, including two completion requests with transport failures. A [declared amendment](coach-benchmark/recovery-contract.md) reused a native HTTPS connection while retaining cases, prompt, tools, deadlines, qualification, and scoring. Recovery reliability is conditional on establishing that connection; original failures remain preserved.

| Arm                    | Recovery qualification | Test provider success | Final application checks |
| ---------------------- | ---------------------: | --------------------: | -----------------------: |
| Deterministic baseline |         Not applicable |        Not applicable |               20/20 pass |
| `openai/gpt-oss-20b`   |               1/1 pass |                 16/20 |               20/20 pass |
| `openai/gpt-oss-120b`  |               0/2 pass |          Not admitted |             Not measured |

Four invalid 20b responses triggered local fallback. Every final proposal matched the baseline. Both 120b qualification responses returned HTTP 200 but failed this tool protocol; this does not establish general tool incompatibility. Provider success and application success remain separate denominators.

Recovery used 41 completion requests and 18,613 provider-reported tokens. Including the original two requests gives 43 requests and 22,075 accounted tokens: 18,613 known plus 3,462 conservative unknown-usage reservations. Accounting is not billing. No completion was automatically retried, and no test passage was replaced.

An [independent reconciliation (archived reference)](../integration/historical-evidence.md#artifact-3fa45cfde2f9) checked frozen identities, request attribution, usage, candidate references, projections, and baseline agreement against the [campaign receipt (archived reference)](../integration/historical-evidence.md#artifact-201f353d2cf1).

## Recall prediction

Open Spaced Repetition's [FSRS dataset](https://huggingface.co/datasets/open-spaced-repetition/fsrs-dataset) is pinned to revision `ae96575728d364265a75f2447fe7b7fa389ba96c`. Its [card](https://huggingface.co/datasets/open-spaced-repetition/fsrs-dataset/blob/ae96575728d364265a75f2447fe7b7fa389ba96c/README.md) declares MIT without narrative collection/consent documentation. Files are collection groups, not verified independent people. Labels are Anki self-ratings, not independently graded answers.

Outcome-blind hashes selected 24 collections and one quarter of their cards. Of 1,791,362 downloaded reviews, 448,671 were selected; excluding first observations and sub-day reviews left 358,818 eligible labels. A timestamp-only cutoff yields 109,399 fitting reviews/12 collections. Temporal evaluation uses later reviews from fitted collections; six collections are excluded from fitting. Their 168,099 earlier reviews can supply history, never fitting labels. This is not cold start.

Controls are the fitting-set mean and card history shrunk toward that mean. L2 logistic regression uses prior history and fitting-only standardization, without hyperparameter search. Current ratings, upstream history columns, identifiers, and future responses are excluded. Test outcomes enter strictly later history without refitting.

Lower Brier/log loss is better; reviews have equal weight.

| Evaluation           | Reviews / collections | Model        |    Brier | Log loss |
| -------------------- | --------------------: | ------------ | -------: | -------: |
| Temporal             |           36,946 / 10 | Fixed mean   | 0.142088 | 0.459195 |
| Temporal             |           36,946 / 10 | Card history | 0.133994 | 0.435071 |
| Temporal             |           36,946 / 10 | Logistic     | 0.128708 | 0.419639 |
| Reserved collections |            34,434 / 6 | Fixed mean   | 0.170293 | 0.529669 |
| Reserved collections |            34,434 / 6 | Card history | 0.152707 | 0.473478 |
| Reserved collections |            34,434 / 6 | Logistic     | 0.154814 | 0.481863 |

Logistic-minus-history Brier is −0.005285 temporally, paired 95% interval [−0.012734, −0.003580]; reserved collections: +0.002107 [−0.001215, +0.002497]. The 1,000 collection-bootstrap draws condition on the fitted model. Six reserved groups limit precision; transfer advantage is unestablished. An exploratory post-only diagnostic contains 9,940 reviews/six collections, history/logistic Brier 0.097545/0.100454.

Independent reconstruction reconciled all 81,320 evaluation predictions, aggregate metrics, and calibration within `3.34e-16`. Earlier runs preserve the temporal-membership correction and removal of an exact source timestamp from publication files.

Evidence: [report (archived reference)](../integration/historical-evidence.md#artifact-d383cffacb41), [audit (archived reference)](../integration/historical-evidence.md#artifact-fd5d374f1abb), [lineage (archived reference)](../integration/historical-evidence.md#artifact-0196726e3772), [protocol](recall-benchmark/README.md).

## Verified Forge use

Open the [private dashboard tour](forge/dashboard-tour.md) for the verified views and their evidence.

Inference receipts establish actual requests. [Agent Lens readback (archived reference)](../integration/historical-evidence.md#artifact-9b8f80b75c12) matches all 23 recovery conversations and 99 captured spans, including qualification. [Weave readback (archived reference)](../integration/historical-evidence.md#artifact-329696631a11) verifies both arms against one 20-row dataset/scorer: 61 complete calls, 20 outputs, and 120 criteria per arm. Four fallbacks remain; provider success is 16/20. Replay makes no inference calls; replay latency is not provider latency.

The [finished Models run (archived reference)](../integration/historical-evidence.md#artifact-4cc95c3ee8c5) has 63 metrics matching local aggregates and one history point. [Artifact upload (archived reference)](../integration/historical-evidence.md#artifact-caa1ffc8e527) failed before writing; model coefficients/manifests remain local. Tracking is verified, hosted artifact lineage unfinished. No Registry promotion occurred. User songs, private practice history, and raw review identifiers stay local.

## Reproduce

From the application root:

```sh
python3 research/music-data/acquire.py ../tabtopitch-real-data/guitarset
npx tsx research/music-data/build.ts ../tabtopitch-real-data/guitarset
uv --no-config venv --python 3.12 /tmp/tabtopitch-recall-env
uv --no-config pip install --python /tmp/tabtopitch-recall-env/bin/python \
  -r research/recall-benchmark/requirements.txt
/tmp/tabtopitch-recall-env/bin/python research/recall-benchmark/download.py \
  --output ../tabtopitch-real-data/recall
/tmp/tabtopitch-recall-env/bin/python research/recall-benchmark/benchmark.py \
  --data ../tabtopitch-real-data/recall \
  --output ../tabtopitch-real-data/recall/run-reproduction
```

Use fresh output directories; retain failures. Hosted execution requires the [coach protocol](coach-benchmark/README.md), declared allowance, and recovery amendment.
