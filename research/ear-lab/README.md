# Ear-lab research

This campaign asks whether imperfect audio hypotheses can support a useful, explicitly experimental listening workspace. It separates transcription accuracy, reliability estimation, teacher behavior, and publication integrity. None of these measures establishes improved hearing or playing.

[protocol.json](protocol.json) freezes treatments, limits, scoring, and aggregation. [Dataset cards](dataset-cards.md) describe the recorded and derived labels. Prior Toraneko and TabToPitch campaigns remain unchanged.

## Local audio and reliability

`analysis.py freeze` records selected recording groups, source/reference checksums, prior-inspection exclusions, and source hashes before execution. It selects six-second excerpts beginning at two seconds. Fresh GuitarSet and GAPS groups are split by performer into training, calibration, and test. The available Guitar-TECHS and Slakh excerpts are regression material because Toraneko previously inspected those recordings.

`analysis.py run` compares raw MuScriptor transcription, transcription of estimated guitar/bass parts, and a union of MuScriptor hypotheses reconciled across passes. Basic Pitch agreement is retained as an evidence feature; it is not a grading key. The reference-note ceiling checks scorer behavior. Full note, timing, pitch-class-over-time, and lowest-pitch-over-time results stay separate. Single-note fretboard existence is not a claim that an entire polyphonic fingering is feasible.

`fit.py` trains an L2 logistic correctness estimator using only independently matched notes from training groups. It standardizes training features only, emits a portable JSON model, and reports recording-macro Brier score, log loss, and precision/coverage at 0.8. The fixed evidence rule is explicitly uncalibrated. Regression clips cannot qualify promotion. The candidate remains research-only.

```sh
audio_worker/.venv/bin/python research/ear-lab/analysis.py freeze --datasets /path/to/datasets --out .local/research/ear-lab-v1-audio-new
audio_worker/.venv/bin/python research/ear-lab/analysis.py run --datasets /path/to/datasets --out .local/research/ear-lab-v1-audio-new
audio_worker/.venv/bin/python research/ear-lab/fit.py --dir .local/research/ear-lab-v1-audio-new
```

The research importer decodes the frozen excerpt before the interactive worker's bounded import. Campaign 001 retained six completed recordings and an import-size failure. Campaign 002 reuses those six rows only after checking byte-identical normalized audio; its remaining recordings use the corrected importer. This is an infrastructure revision, not a new model condition. Campaign 003 corrects a duplicate Slakh source ID, verifies all 16 unique members, and preserves the same model conditions and scorers. The original receipts remain intact.

## Teacher experiment

`cases.ts` creates 24 development checkpoints, 48 evaluation checkpoints, 12 episodes, and 12 boundaries, each paired across reference, actual-analysis, and controlled-corruption conditions where specified. A case is distinct from its condition, trial, and episode turn. Missing analysis remains missing; fluent explanation cannot fill it in.

`run.ts --qualify --prepare` freezes a separate development qualification campaign. `--qualify --run` makes two bounded turns per available actor model, recording all actor/critic usage and raw failures. Both turns must complete before the larger suite runs. Qualification is not release promotion. The existing teacher judge-calibration requirements still apply; without a qualified evaluator, conversational-quality values are unavailable.

The historical ledger is reconciled before paid calls. The ceiling is the lesser of $15 and the remaining original $25. Unknown usage retains its full reservation. `publish.mjs --weave` replays recorded outputs without inference and checks dataset membership, response values, criterion outputs, and complete call trees. `--lens` publishes the actual Forge SDK span capture and reconciles exact conversation/span identities.

Qualification campaign 001 retained five inference calls across four turns. Its Gmaj7 claim failure, exhausted critic response, and empty 120B replies are failures, even though local fallback worked. The full cloud cohort remains gated. See [results](results.md) for exact counts, failure examples, dashboard links, and the original-song capture.

## Comparison boundaries

Noise2Fret is a potential guitar-only comparator. A paper or checkpoint link alone does not qualify an executable baseline: source revision, checkpoint hash, permissions, and CPU runtime must all be established first. TART informs separate pitch/technique/fingering measures; there is no claimed executable TART result here.

Model-training overlap with these corpora remains unknown. The study does not establish performance on arbitrary commercial mixes. Original audio is the only distributable demonstration media. Private recordings, stems, learner history, and full project exports never enter the publication bundle.

`bundle.py` creates an allowlisted public-data publication bundle. `publish-models.mjs` publishes actual training lineage, comparison Tables, and a research Registry artifact, then downloads and checks every file and saved prediction. Recovery takes a previous publication directory; it reuses inspected identities rather than creating replacement runs.
