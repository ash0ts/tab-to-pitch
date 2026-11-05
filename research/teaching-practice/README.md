# Teaching-practice-v1

This campaign asks whether a teacher uses goals, evidence and feedback to help a learner take a useful next action while respecting their choices. It does not measure whether a learner becomes a better musician.

## Frozen comparison

The initial cohort has 24 development checkpoints and 24 evaluation checkpoints: twelve scenarios, each with two synthetic histories. Development requests use different wording. Development uses Am7 → D7; evaluation uses G7 → Cmaj7, across standard tuning, drop D and capo contexts. The corpus covers identity versus role, recognition versus recall, repeated errors, stopping a quiz, changed goals, declined strategies, valid creative alternatives, stylistic exceptions, unsupported performance claims, exposed material presented as fresh, help during assessment, and reflection.

The unit is a checkpoint; histories are scripted. Both splits can access the same original activity factories, so this is not a test of generalization to unseen task libraries. Aggregate by scenario/context as well as row. These checkpoints do not substitute for an adaptive-episode qualification run. Preserve the existing teacher suite's episode gate when considering release.

Arms are the authored policy, the frozen previous prompt, and the revised prompt. Both model arms use the same current tools, engine and provider adapter. This is a prompt ablation, not a recreation of an earlier deployment. The previous prompt is stored verbatim in `current-prompt.json`. The runner uses two trials per 20B arm and fresh model discovery, then separately checks evaluator calibration. 120B is not enabled by this runner; an additional model requires its own qualified configuration and frozen campaign.

Prepare freezes code, source hashes, questions, histories, scorer inputs, the historical-spending reconciliation and the checked price schedule. Source drift requires a new campaign directory. The original campaigns are never rewritten. The evaluation cases are not iteration material after freeze.

## Scoring and missing evidence

`contract.ts` checks schema, freshness, action validity, immutable input, call/tool limits, unassisted action withholding, reserved membership and respect for a stop request. Deliberately mutated cases exercise freshness and budget boundaries. Unit music fixtures supply independent expected pitches, durations and valid/invalid responses.

Structural validity is not factual prose correctness. `judge.ts` retains exact quoted claims and evidence-linked reasons, and rates relevance, actionable feedback, learner choice, instructional load, continuity and evidence use separately. The existing 120 factual fixtures and 24 dialogue challenges qualify the evaluator. Runtime factual review is also retained as its own result. Null dimensions mean unmeasured, never passed.

Report model success, fallback success, evaluator failure and unexecuted rows separately. Count failures in denominators. Report original execution latency separately from Weave replay latency. The authored policy's schema-valid responses are not evidence of conversational or educational quality. Same-model actor/critic/judge execution has correlated-error risk even with separate prompts.

Release still requires zero observed critical accepted violations, at least 90% acceptable ordinary checkpoints and at least 90% valid episode completion using a qualified evaluator. This new checkpoint corpus alone cannot satisfy the episode gate. UI enablement remains experimental until all gates pass.

## Shared spending authorization

`research/forge/shared-budget.ts` provides an atomic SQLite ledger. All parallel campaigns must use the same absolute path. Each request reserves an input-byte/output-token upper bound inside `BEGIN IMMEDIATE`; actor, critic, calibration, failed calls and unknown usage all count. Unknown usage retains the entire reservation. An over-bound usage report opens a shared circuit requiring reconciliation.

The authorization is the original $25 total, including immutable historical spending. Each new campaign also has a $15 ceiling. Neither creating a directory nor restarting a process resets it. The runner refuses to run while older nonparticipating campaigns are active.

Before execution, provide `TTP_SHARED_INFERENCE_LEDGER` and `TTP_BUDGET_PARTICIPANTS_RECEIPT`. The receipt must contain the same absolute `ledger`, `historicalHash` of the reconciled historical ledger, and `allCampaignsMigrated: true`. That assertion must follow adoption by every active runner; it is not permission to ignore another campaign. Keep the single database outside worktree copies.

Prices frozen for this iteration were checked on November 4, 2026 against [Forge pricing](https://coreweave.com/forge-pricing/inference-agents): 20B input/output $0.03/$0.13 per million tokens. Reverify before a later campaign. No new teaching model is trained.

## Commands and publication

From the standalone app directory:

```sh
npx tsx research/teaching-practice/run.ts --prepare \
  --dir ../teaching-practice-001 \
  --historical-root /absolute/path/to/tabtopitch-real-data \
  --legacy-demo /absolute/path/to/tabtopitch-forge-demo/live-coach.json

npx tsx research/teaching-practice/run.ts --run --development \
  --dir ../teaching-practice-001 \
  --historical-root /absolute/path/to/tabtopitch-real-data \
  --legacy-demo /absolute/path/to/tabtopitch-forge-demo/live-coach.json

npx tsx research/teaching-practice/publish.mjs --check --dir ../teaching-practice-001
```

Prepare makes no network or paid calls. It records the local authored arm and explicit unexecuted cloud arms. Run requires credentials and shared-budget adoption. The frozen campaign is single-use; an uncertain completion is not retried automatically.

Actual model calls use the qualified connection pool and Forge SDK trace capture. Captured Lens batches are actual spans, not reconstructed success records. Publication must reconcile conversation membership, turns, calls and usage before reporting remote traces. `publish.mjs` replays recorded outputs in Weave without repeating inference and checks dataset/evaluation membership. Rich evaluation payloads contain authored music and synthetic histories only. Production traces keep their existing allowlist.

After Lens and Weave readback, `python research/teaching-practice/publish_table.py --dir ../teaching-practice-001 --publish` uses the repository’s pinned W&B 0.31.0 environment to publish an evaluation Table and download its artifact afresh. `--check` exports locally without credentials. The table retains unexecuted arm/trial rows, original failures, fallback status, evaluator failures, latency and usage reservations. Trace links appear only for independently read-back identities. This is an evaluation publication run, never a training run. Remote publication requires qualification of the SDK transport in the target environment.

This release includes preparation, replay and Table publication tooling. A completed live campaign, full Lens/readback reconciliation and W&B failure-table publication remain required execution evidence; an empty or prepared campaign must not be shown as a completed Forge experiment. Existing Models/Registry lineage remains unchanged.

## Dataset card

- **Origin:** original symbolic passages and authored learner requests; synthetic histories, not human learner observations.
- **Reference labels:** engine-verifiable musical facts and explicit constraints. Conversational ratings require a separately calibrated evaluator.
- **Rights:** original text and studies authored for this repository; no popular-song recording, Hotelier score, private filename or learner transcript.
- **Split unit:** musical context; transposed variants stay within their split. Different tunings alone do not make a new progression family.
- **Checksums:** `casesHash`, source hashes and prompt hashes in the preparation manifest.
- **Exclusions:** no microphone performance, artistic-quality labels, teaching-model training or learner-effectiveness outcomes.
- **Coverage limitation:** two major-key harmonic context families and twelve scripted situations. Broader styles, spontaneous conversations and real learner behavior require separate evidence.
