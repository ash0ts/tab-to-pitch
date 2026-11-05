# Guitar teacher grounding study

This experiment asks whether the hosted teacher can deliver a requested fretboard demonstration or accompaniment variation. It compares the current prompt, an evidence-first prompt variant, and the existing local policy. A separate experiment tests the factual reviewer on deliberately correct and incorrect musical claims.

[Protocol](protocol.md) owns the design. [Dataset manifest](data/manifest.json) identifies source, license, exclusions and checksums. The [inspectable report](../../public/research/guitar-teacher/index.html) and its adjacent `results.json` contain measured outcomes after remote readback. This is a tool-use experiment using real recording annotations and authored requests, not an audio-perception or learner study.

## Data and evaluation

`build.py` extracts passages directly from GuitarSet JAMS with independent chord formulas. It does not import application theory code. `cases.ts` constructs bounded workspace contexts and requests. `scorer.ts` independently checks returned musical artifacts; mutation fixtures exercise wrong coordinates, notes, degrees, timing and constraints. `analyze.py` computes recording-macro scores, paired differences and a recording-cluster bootstrap.

Six development recordings use performers 00/01 and progression family 1. Thirty-six evaluation recordings use performers 02/03/04 and families 2/3. The corpus was used in earlier voicing research; this is disjoint prompt development, not a claim that the recordings are globally unseen. Annotation coordinates inferred from pitches are not observations of hand technique.

The primary hosted outcome requires an accepted response containing the requested valid artifact. Valid tool output retained by fallback is a different outcome. Explanations are not assigned a quality score by keyword checks or an unqualified judge. The reviewer diagnostic does not replace the existing broader qualification suite.

## Execution and reproduction

Use the pinned Node/npm dependencies. Python extraction and aggregation use the standard library. Supply the local GuitarSet extraction root containing `raw/*.jams` and the previous cohort manifest:

```sh
python3 research/guitar-teacher-study/build.py "$GUITARSET_ROOT" /tmp/guitar-teacher-data
```

Compare the resulting checksums with `data/manifest.json`. No dataset audio, weights, or private scores are included in the repository.

`run.ts` requires `WANDB_API_KEY`, `TTP_SHARED_INFERENCE_LEDGER`, `TTP_HISTORICAL_ROOTS` (the canonical four-root JSON array), and `TTP_LEGACY_DEMO`. The ledger must already represent the original authorization and reconciled historical calls. Do not substitute an empty ledger or reset spending. Discovery GETs are not billed as inference. Every completion reserves its worst-case cost atomically; unknown usage retains the reservation. These commands make paid calls and require remaining authorization:

```sh
node --import tsx research/guitar-teacher-study/run.ts development /absolute/new-development-directory
node --import tsx research/guitar-teacher-study/run.ts evaluation /absolute/new-evaluation-directory
```

The runner writes a source snapshot, protocol, membership, prompts and hashes before execution. Four concurrent turns share the same limits. It does not silently retry failed turns. Run against a new directory; preserve every prior run. A source-drift check ends execution as invalid if evaluated files change.

Aggregation and diagnostics use retained data and make no inference calls:

```sh
python3 research/guitar-teacher-study/analyze.py "$CAMPAIGN_DIR"
node --import tsx research/guitar-teacher-study/diagnose.ts "$CAMPAIGN_DIR"
```

`diagnose.ts` is an exploratory per-call attribution, separate from frozen scoring. It helps distinguish malformed output, coordinate-prose rejection, other deterministic rejection, and a candidate reaching review. It does not establish that rejected prose is otherwise correct.

## Forge publication

`publish.mjs` uploads actual captured Forge SDK spans, replays recorded responses into four Weave evaluations, and reads back exact dataset rows, original outputs, scores and parent/child identities. `publish-table.mjs` uploads a W&B Table and downloads it to compare its hash. No inference occurs during replay. `export-report.py` runs only after verified readback and exports licensed normalized music, authored requests and bounded outputs; provider reasoning and local credential paths are excluded.

```sh
node --import tsx research/guitar-teacher-study/publish.mjs "$CAMPAIGN_DIR"
node research/guitar-teacher-study/publish-table.mjs "$CAMPAIGN_DIR"
python3 research/guitar-teacher-study/export-report.py "$CAMPAIGN_DIR"
```

The publisher refuses to overwrite existing runs. If a write has an unknown outcome, read back before recovery; do not rerun the inference campaign. `--verify` performs remote readback without actor inference. The private project is `wandb/tab-to-pitch-public-data-research`. No training run or Registry candidate is created for a prompt change.

Development run 001 exposed a harness bug: model-discovery GETs entered completion JSON parsing, so no actor call was sent. Run 002 corrected transport; run 003 added explicit prose/diagram separation to the prompt variant. All development calls and source snapshots remain retained. Evaluation uses the frozen run-003 prompt without changes based on held-out outcomes.

`local-choice.ts` is a separate deterministic diagnostic motivated by development failures. It compares the original refusal of a quiz with equivalent wording against the unchanged local policy. Its source, requests, variants and outputs are retained before/after execution. It reuses evaluation passages and is not another held-out model comparison.

`verify-lens.mjs` also queries the remote span records, checks exact parent IDs and names, groups requests by conversation, and reconciles model-call counts and input/output tokens with provider receipts. This extends the membership-only Lens check. Unknown usage remains unknown and financially reserved.

Lens model spans retain provider outputs and usage; musical tool spans retain returned facts/actions. Full model request bodies are represented by request hashes rather than copied into every trace. The frozen manifest and Weave rows retain the prompts and bounded case context. This distinction matters when inspecting a failed call.

The campaign publication encountered successful HTTP responses without the expected JSON acknowledgment. The study-specific Lens publisher retains that failure and verifies every captured span by exact ID/name before continuing. It never resubmits an unresolved upload. During ingestion, the query count briefly reported zero while returning both expected rows; batch recovery therefore checks actual identities, with a separate complete-membership reconciliation after upload.

Table publication initially acknowledged completion before its summary was visible. A later independent readback reconciled all values, including the service's flattened metric keys, and the exact downloaded Table bytes. The original failed receipt remains retained. No Table upload or inference was repeated. The local Weave replay required closing its existing root after a start/end visibility race; its publication repair timestamp is not an execution-latency measurement.

`node --import tsx research/guitar-teacher-study/verify-report.mjs` recomputes all 360 response scores and 48 critic classifications from the portable evidence, checks the frozen scorer hash and dataset checksums, and reconciles displayed totals. It makes no network requests. CI runs this replay and the report's desktop/mobile interaction checks.
