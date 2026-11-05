# Observed voicing ranking

This study asks whether a small model can order valid fretboard shapes closer to recorded guitarists' choices than fixed compactness, movement, or frequency rules. It uses real GuitarSet annotations and predicts the next observed shape when the previous observed shape and requested pitch-class multiset are supplied. It does not predict difficulty, a learner's preference, or educational benefit.

The [frozen protocol](protocol.json) specifies extraction, 18 performer/progression holdouts, four baselines, fixed conditional logistic regression, aggregation and the research-only gate. [Dataset context](dataset-card.md) explains the observations and derived examples. [Results](results.md) separates ranking evidence from the independent Guitar-TECHS conformance check.

## Reproduction

Use a Python environment containing the exact versions in `requirements.txt`. MIDI acquisition/conformance additionally uses `mido==1.3.3`. The existing normalized GuitarSet file is produced by the [music-data adapter](../music-data/README.md). Every run requires a new output directory.

```sh
python research/voicing-ranking/benchmark.py \
  --source ../tabtopitch-real-data/guitarset/normalized-recordings.jsonl \
  --output ../tabtopitch-real-data/voicing-ranking-v1/run-reproduction
python research/voicing-ranking/verify.py \
  --bundle ../tabtopitch-real-data/voicing-ranking-v1/run-reproduction
python research/voicing-ranking/audit.py \
  --bundle ../tabtopitch-real-data/voicing-ranking-v1/run-reproduction
python research/voicing-ranking/export_features.py \
  --bundle ../tabtopitch-real-data/voicing-ranking-v1/run-reproduction
python research/voicing-ranking/acquire_techs.py \
  --output ../tabtopitch-real-data/voicing-ranking-v1/guitar-techs-reproduction
python research/voicing-ranking/conformance.py \
  --data ../tabtopitch-real-data/voicing-ranking-v1/guitar-techs-reproduction \
  --output ../tabtopitch-real-data/voicing-ranking-v1/conformance-reproduction
```

The benchmark snapshots source, protocol, dependencies, and normalized source hash before fitting. It preserves all fold models, membership, coefficients, predictions, coverage, paired comparisons and slices. `verify.py` is the canonical replay command; `audit.py` independently reconstructs metrics from ranks and verifies held-out membership. The original inline verifier compared Python tuples with JSON arrays; its representation error did not affect fitting or scoring. The standalone verifier normalizes that boundary and checks hashes and outputs in a fresh process.

The candidate enumerator is independent of the application engine. It receives pitch-class multiplicities, not target MIDI register or target frets. It enumerates every bounded one-note-per-string realization. A missing target remains a zero recovery score, never an injected candidate.

The actual harmony engine is checked separately against the formula-matching Guitar-TECHS states. The check records engine hashes and retains ambiguity:

```sh
npx tsx research/voicing-ranking/app-conformance.ts \
  ../tabtopitch-real-data/voicing-ranking-v1/conformance-reproduction/examples.json \
  ../tabtopitch-real-data/voicing-ranking-v1/conformance-reproduction/app-readback.json
```

## Optional recorded-choice ordering

`fit_runtime.py` requires a frozen report that passed the research gate, then fits all accepted rows without reporting another held-out result. `verify_runtime.py` replays its frozen feature/score cases. The served JSON retains source attribution, the held-out report hash and explicit domain constraints.

```sh
python research/voicing-ranking/fit_runtime.py \
  --bundle ../tabtopitch-real-data/voicing-ranking-v1/run-reproduction \
  --output ../tabtopitch-real-data/voicing-ranking-v1/runtime-fit-reproduction
python research/voicing-ranking/verify_runtime.py \
  --bundle ../tabtopitch-real-data/voicing-ranking-v1/runtime-fit-reproduction
```

The browser-independent [adapter](../../src/engine/voicing-ranker.ts) exports `validateVoicingRankerModel` and `rankVoicingsWithModel`. Callers supply existing valid candidates, the actual previous source shape, requested pitch-class multiplicities, tuning, capo and parsed model. Successful output contains reordered candidates and unnormalized ordering scores. Unsupported calls preserve the supplied order and explain the domain mismatch. Candidates must share the complete requested multiset; fifth omission, rootless variants or different doubling choices cannot be mixed in one call. The experiment ranks one-step alternatives, never the application's progression paths. Deterministic ordering remains the default.

The parity fixture contains every independently enumerated candidate for twelve evenly spaced examples, selected without consulting errors or scores. It checks ten Python/TypeScript features and scores, including changes in voice count, and pins the served model bytes.

## Forge publication

`publish.mjs` uses the existing bounded Forge transport and the W&B artifact manifest format. It creates separate data, cross-validation, and downloaded-artifact verification runs; stores dataset, features, and model artifacts; records their use relationships; and checks each downloaded file's SHA-256 before replaying predictions. A private Registry collection receives only the `research-candidate` alias. This does not deploy the model.

The publisher requires `WANDB_API_KEY` in the environment, existing private-project access, a fresh publication directory and a successfully verified local bundle. Fixed publication run names prevent accidental duplicate campaigns. A rerun after an uncertain write requires independent server readback; never remove the receipt to bypass that rule. Signed artifact URLs remain in local request receipts and are excluded from publication artifacts.

```sh
node research/voicing-ranking/publish.mjs \
  ../tabtopitch-real-data/voicing-ranking-v1/run-001 \
  ../tabtopitch-real-data/voicing-ranking-v1/publication-001
```

Fold history points are measured optimizer/fold records, not an invented training curve. No hosted inference calls occur in this study. Agent Lens and Weave belong to the separate bounded-language planning experiment.

`finalize.mjs` recovers the cross-validation replay/Registry phase after independent artifact readback. `publish_runtime.mjs` publishes the subsequent all-data fit in its own run and model collection, links the verified dataset, features and cross-validation artifact as inputs, downloads the runtime artifact, replays its scores, and verifies a separate private `research-candidate` Registry alias. A failure retains its receipt; recovery requires that receipt and verifies existing identities before continuing. Neither publisher changes the default ordering or promotes a production model.

```sh
node research/voicing-ranking/publish_runtime.mjs \
  ../tabtopitch-real-data/voicing-ranking-v1/runtime-fit-001 \
  ../tabtopitch-real-data/voicing-ranking-v1/publication-006 \
  ../tabtopitch-real-data/voicing-ranking-v1/runtime-publication-001
```

The runtime publisher preserves existing source snapshots or packages them when absent, then verifies fitting-source hashes against the saved fit manifest. Its fixed run/collection names describe this measured campaign. Reproduction uses fresh output directories and distinct publication identities rather than overwriting this evidence.
