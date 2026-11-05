# Observed voicing ranking results

The learned ranker recovered recorded shapes better than the four frozen baselines in this GuitarSet cohort. It passed the predeclared research-only shadow gate. A separately fit model supports an explicitly optional, one-step candidate-ordering experiment. Deterministic ordering remains the default; the model supplies no answer keys or learning claims.

There are 4,317 held-out transitions from 168 accompaniment recordings, evaluated in 18 performer/progression folds. All recorded targets were present among the independently enumerated candidates, which ranged from 5 to 619 per question. All 18 fits converged. Metrics average within each recording, then across recordings.

| Ordering                    | Mean reciprocal rank | Top-1 recovery | Top-3 recovery |
| --------------------------- | -------------------: | -------------: | -------------: |
| Stable hashed order         |               0.0401 |          0.24% |          2.16% |
| Compact/low position        |               0.2105 |         10.09% |         20.83% |
| Minimum movement            |               0.3976 |         30.50% |         40.65% |
| Training shape frequency    |               0.3863 |         27.77% |         42.79% |
| Conditional logistic ranker |               0.6898 |         54.38% |         80.10% |

The learned-minus-movement MRR difference is 0.2922, with a paired recording-bootstrap 95% interval of [0.2654, 0.3177]. It wins on 162 recordings and loses on six. Against frequency, the difference is 0.3035 [0.2692, 0.3380], with 152 wins and 16 losses. Gains remain positive in each performer and progression-family macro slice. These intervals condition on the fitted models and sampled corpus; they do not establish performance across arbitrary guitarists or songs.

The supplied previous shape is the actual recorded one. The requested next pitch-class multiset is also supplied. The study therefore evaluates one-step observed-shape recovery, not autonomous progression rollout, harmonic inference, fingering comfort, learner preference or teaching benefit. It does not establish that the model can choose appropriate omitted tones or extensions from an ambiguous chord symbol.

## Independent chord coverage

The Guitar-TECHS check processed 56 official MIDI files. It retained 2,073 distinct shapes matching documented string groups; 2,043 matched the indicated chord formula and 2,072 fit the bounded candidate enumerator. All documented inversions appeared for every tested triad and seventh family.

| Family                  | Shapes | Formula matches | Candidate coverage |
| ----------------------- | -----: | --------------: | -----------------: |
| Major                   |    291 |             291 |                291 |
| Minor                   |    292 |             291 |                292 |
| Augmented               |    100 |             100 |                100 |
| Diminished              |    280 |             276 |                280 |
| Major seventh           |    272 |             252 |                272 |
| Dominant seventh        |    276 |             275 |                276 |
| Minor seventh           |    277 |             273 |                276 |
| Half-diminished seventh |    285 |             285 |                285 |

The check also records 4,281 distinct states with missing/extra strings, 11 ambiguous note intervals, 23 snapshots overlapping those intervals, and one out-of-range state. Partial strums and annotation issues can contribute to these counts. They are not measured transcription errors or evidence that the performers played incorrectly. The one uncovered retained shape exceeds the four-fret span constraint; the checker does not widen the bound after seeing the answer.

A separate read-only check called the actual application harmony engine on all 2,043 formula-matching states. Every result included the documented quality, an independently possible root, and the correct sounding bass. The engine retained multiple interpretations in 658 cases. Thirty formula-mismatch states were excluded from this exact-conformance denominator rather than repaired. [Application readback](../../../tabtopitch-real-data/voicing-ranking-v1/conformance-003/app-readback.json) records every case and the tested engine hashes.

## Optional runtime experiment

After freezing the held-out results, a separate fit used all 4,317 transitions and converged in 24 optimizer iterations. Its ten coefficients, normalization constants, feature names and supported domain are stored in [the runtime model](../../public/research/voicing-ranker-v1.json). This fit has no new held-out score. Its model SHA-256 is `64e24a350e4cb9c6b5c759523f7f8b8766821d09df778f78d7736bf7947cf46b`.

The TypeScript adapter only reorders supplied engine-valid candidates with the same exact pitch-class multiset as the requested passage. It requires the actual previous source shape, standard tuning, no capo, three to six voices, three or four distinct pitch classes, frets 0–24, and a fretted span of at most four. Unsupported inputs return the original order and a reason. It does not score complete progression paths, invent omitted tones or decide which extensions belong in a chord. Ordering values are not calibrated confidence scores.

Twelve outcome-blind, evenly spaced transition cases contain 1,791 candidate shapes. Python replay reproduces every score exactly; TypeScript reproduces every feature and score within `1e-9`. The fit and parity evidence are separate from the original cross-validation bundle in [runtime-fit-001](../../../tabtopitch-real-data/voicing-ranking-v1/runtime-fit-001/manifest.json).

The all-data runtime model has its own finished Models run, verified artifact `tabtopitch-voicing-ranker-runtime-v1:v0`, and private Registry collection `Recorded-choice runtime ranker` with a verified `research-candidate` alias. Its lineage includes the dataset, features and cross-validation model. A fresh artifact download reproduced all 1,791 parity scores exactly. [Runtime publication receipt](../../../tabtopitch-real-data/voicing-ranking-v1/runtime-publication-001/publication.json) records hashes, run-summary readback and alias identity. The app uses a bounded bank of up to 64 candidates before matching the source's pitch-class multiset; the reported held-out study used exhaustive candidate sets. Its recovery metrics are not a measured accuracy claim for that different UI candidate bank.

## Evidence and limitations

[Protocol](protocol.json), [dataset card](dataset-card.md), [local full report](../../../tabtopitch-real-data/voicing-ranking-v1/run-001/report.json), [fold membership](../../../tabtopitch-real-data/voicing-ranking-v1/run-001/split-manifest.json), [predictions](../../../tabtopitch-real-data/voicing-ranking-v1/run-001/predictions.json), and [Guitar-TECHS report](../../../tabtopitch-real-data/voicing-ranking-v1/conformance-003/report.json) retain the counts and transformations. A fresh process reproduced all 4,317 rankings and log losses exactly. An [independent audit](../../../tabtopitch-real-data/voicing-ranking-v1/run-001/independent-audit.json) reconstructed the aggregate metrics from ranks within 1.11e-16 and verified that every recording was tested once, with its performer and progression excluded from fitting. No raw user score, private history or audio entered the experiment.

The first inline replay check failed on tuple-versus-JSON-array representation; the canonical standalone verifier fixes only that serialization comparison. The first Guitar-TECHS check stopped before scoring on an overlapping MIDI note-on. Both preparation failures are retained. Fitted models, original scoring and held-out cases were not revised after results.

The dataset, features and cross-validation model artifacts were committed and downloaded with matching hashes. A fresh process reproduced all 4,317 downloaded-model predictions exactly. The private Registry collection `Observed voicing ranker` has a verified `research-candidate` alias pointing to that exact model artifact. [Publication receipt](../../../tabtopitch-real-data/voicing-ranking-v1/publication-006/publication.json) retains staged results; [final readback](../../../tabtopitch-real-data/voicing-ranking-v1/finalization-004/finalization.json) confirms the finished replay run and Registry alias. Earlier connection failures and delayed-summary mismatches remain recorded. No production model is promoted.
