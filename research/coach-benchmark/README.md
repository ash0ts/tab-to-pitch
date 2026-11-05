# Coaching on recorded guitar passages

The benchmark compares the existing local policy with the production bounded agent on public GuitarSet passages. It measures application-contract conformance and hosted execution reliability. There is no learner history, independent recommendation-quality label, or teaching outcome.

The frozen test set contains 20 recordings from one held-out performer and progression family. These become 16 distinct numeric contexts after the agent's privacy projection. Every valid candidate is acceptable; matching the local tie-breaker is only policy conformance.

## Run

Build the [music corpus](../music-data/README.md) first, then run from the application directory:

```sh
npx tsx research/coach-benchmark/run.ts --prepare
npx tsx research/coach-benchmark/run.ts --catalog
FORGE_TRANSPORT=curl node research/forge/qualify.mjs ../tabtopitch-real-data/forge
npx tsx research/coach-benchmark/run.ts --run
```

`--prepare` writes the manifest and measures the local baseline. It refuses to overwrite an existing preparation. The manifest hashes the test cohort, selected qualification cases, production agent, tracing code, protocol, dependency lockfile and runner. A source change requires a new reviewed campaign version. Preparation does not contact Forge.

`--catalog` makes one authenticated request to the documented inference model catalog and retains each attempt. `--run` requires a successful catalog less than 15 minutes old and a verified private project. Qualification uses up to two training recordings per model; one successful bounded tool exchange admits that model to the test campaign. Every test attempt retains its result, including fallback. The hard allowance is 88 completion requests and 200,000 accounted tokens. Missing or invalid usage consumes the request's conservative reservation.

`--run --resume` continues an interrupted campaign only when source and dataset hashes agree and no active attempt has an unknown outcome. Completed rows are never rerun. Inspect receipts before any manual recovery. Provider failures are not replaced by new attempts or reported as successful inference just because the local fallback is valid.

## Connection recovery experiment

The first campaign stopped before any successful hosted response. The separately frozen [transport amendment](recovery-contract.md) uses a persistent native HTTPS connection and retains every original failure. Its commands add `--recovery` to preparation, catalog discovery and execution. Outputs go to `tabtopitch-real-data/coach-recovery/`. The original campaign's calls and unknown-usage reservations reduce the recovery allowance. Five bounded read-only discovery attempts may establish the reusable connection; completion requests never retry.

The completed recovery admitted GPT-OSS 20B and evaluated every test passage. GPT-OSS 120B failed both qualification cases, so there is no test-set comparison between the two models. See the [results](../results.md) for the accepted responses, fallbacks and limitations. Original executed sources remain in `coach/source-snapshot/`; source hashes distinguish that stopped run from the amended runner.

## Traces and publication

The production Forge SDK creates conversations, turns, model calls and tools. `lens-capture.ts` checkpoints those actual spans as OTLP protobuf batches, including hashes and span identities. A local batch is instrumentation evidence only. It still needs upload and independent Agent Lens readback. Captured spans contain fixed instructions, model identifiers, tool names, usage and sanitized failures; they contain no source filenames, raw learner history or grading key.

The campaign request receipt is the accounting source. An invalid response may contain valid provider usage that the production model-span wrapper did not record. Report known usage and unknown reservations separately; do not equate either with a billing statement.

The [Forge publisher](../forge/README.md) replays recorded outputs with one shared source-only dataset and scorer. It makes no inference requests. Weave replay timings describe replay, not the original hosted call. Missing hosted arms stay unavailable. Dataset identity, per-row outputs, score counts and complete call trees require server readback before a dashboard is reported as verified.

`node research/forge/publish-lens.mjs --recovery` uploads captured recovery spans and reconciles their identities. Add `--verify` for readback only. Stable upload receipts prevent automatic replays of uncertain writes. The publisher uses the same native connection for its private-project check, protobuf writes and readback.

All outputs live in the sibling `tabtopitch-real-data/coach/` directory. The [research contract](../research-contract.md) and [results report](../results.md) define interpretation and current completion status.
