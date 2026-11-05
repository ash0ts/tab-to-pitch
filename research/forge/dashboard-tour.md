# Private Forge dashboard tour

Current progression studies verified by server readback on **2026-10-30** in the
private `wandb/tab-to-pitch-public-data-research` project. Start with the tour
below. Earlier fretboard, recall, and coaching studies are preserved under
**Historical studies** with their original denominators.

Run URLs and record identities are verified. Conversation, evaluation-comparison,
dataset, artifact, and Registry deep links below use the current application
route definitions; their rendered pages have not been rechecked in this revision.
The Evals list was observed previously, but an earlier comparison navigation
redirected to Models. If a deep link does that, open the product's list and select
the exact IDs below. Older dashboard screenshots show their original studies;
they are not screenshots of these new results.

## 1. Agent Lens: inspect a successful arrangement and two failures

Open [Agent Lens](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research)
and select agent `tab-to-pitch-arrangement`. The completed v2 campaign contains
**260 conversations and 1,588 verified spans**, including qualification. Four
conversations and 17 spans from a failed development run remain separate. The
original v1 campaign retains 196 conversations and 733 spans.

| Recorded case                                                                               | Open conversation                                                                                                                                        | What to inspect                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fresh-1-literal`: D → Gmaj7 → A7 in DADGAD; “Revoice at frets 2 to 9. Avoid open strings.” | [Accepted proposal](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/01a18ddf-1b8f-79f9-953a-3235fda19a25)   | Exact fret bounds and open-string policy, deterministic candidate generation, then selected candidate `harmony-v1:variation:d2a8578e` with evidence `path0`. The local parser also succeeds. |
| `fresh-3-literal`: “Revoice rootless using 3 voices.”                                       | [Incorrect rejection](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/01a18ddf-3fbe-7831-b854-19fe8500aba0) | A schema-valid `reject/unsupported` despite engine support. Protocol success does not establish request correctness.                                                                         |
| `fresh-8-paraphrase`: reduce a dominant thirteenth to a dominant ninth                      | [Schema rejection](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/01a18ddf-aacd-72f9-b6f9-fb66d89a836e)    | The provider supplies `targetQuality: "A9"`; the contract requires quality `"9"`, with the root supplied separately. The invalid action never becomes a variation.                           |

Expand `decode_arrangement_action`, `validate_arrangement_intent`,
`generate_validated_variations`, and `build_fact_derived_proposal` where present.
The decoding step distinguishes a provider-native function call from a strict
JSON action parsed by the coordinator. A failed attempt may end before later
tools run. The successful example's movement cost of 9.32 is a geometric heuristic,
not a comfort score. Use the model span for inference latency and token usage;
use the tool results for the checked musical facts.

These are actual authored research requests. The app's recorded-proposal view
replays the saved successful response and revalidates it locally; it does not
make another inference call or enable the failed live qualification gate.
[Exact demo record (archived reference)](../../integration/historical-evidence.md#artifact-2750b2305535),
[Lens readback (archived reference)](../../integration/historical-evidence.md#artifact-5fd6f60eb8c4).

## 2. Weave: compare the same requests, including failures

Open [Evals](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/evaluations).
Use these **fresh-confirmation** evaluations:

| Arm                  | Evaluation call ID                                                                                                                                                 | Request-correct | Protocol-valid |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | -------------- |
| Deterministic parser | [01a18de3-1c1a-762e-a8b3-2aded10ba244](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a18de3-1c1a-762e-a8b3-2aded10ba244) | 24/32           | 32/32          |
| 20B, trial 1         | [01a18de3-269c-7b54-81d1-c34a3ab02697](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a18de3-269c-7b54-81d1-c34a3ab02697) | 22/32           | 28/32          |
| 20B, trial 2         | [01a18de3-3063-7f8b-8d0c-4378b5e5494e](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a18de3-3063-7f8b-8d0c-4378b5e5494e) | 24/32           | 28/32          |

[Open parser versus trial 1 comparison](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/compare-evaluations?evaluationCallIds=%5B%2201a18de3-1c1a-762e-a8b3-2aded10ba244%22%2C%2201a18de3-269c-7b54-81d1-c34a3ab02697%22%5D&tab=results)
uses the source-defined comparison route and JSON-encoded IDs; this link is not
UI-qualified. The exact dataset is
[arrangement-synthetic32-6325ff219bac](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/objects/arrangement-synthetic32-6325ff219bac/versions/XJh0l0LrUdk6Xf7fegSES1YXXPqFaFTdPWU9XoRwD84).
Inspect `fresh-1-literal`, `fresh-3-literal`, and `fresh-8-paraphrase` to connect the
trace examples to their scores. Display `requestCorrect`, `schemaValid`,
`constraintSatisfaction`, `factualReferences`, and `usableProposal` separately.
A valid clarification or rejection is not a usable requested progression.

Readback matches **32 rows, 291 evaluation-tree calls, and 864 criterion values**
across the three evaluations. The 64 model attempts repeat 32 requests in eight
musical contexts. The model's 46/64 request-correct result fails the predeclared
90% gate; live arrangements remain disabled by default. Every accepted output
passed its applicable musical and evidence checks, including accepted responses
that misunderstood the request. Replay latency is not model inference latency.
[Dataset context](../arrangement-agent/dataset-card-v2.md),
[criterion definitions](../arrangement-agent/contract.ts),
[Weave readback (archived reference)](../../integration/historical-evidence.md#artifact-c779332c304c).

The original 96 requests are a separate regression set. Its v2 call IDs are
`01a18de3-1af3-7c79-bc0d-8f2ccd0d06d0` (parser),
`01a18de3-2ace-74a0-a0eb-3b2ac5ba1ffe` (trial 1), and
`01a18de3-371c-7cd4-9de2-0f1c7c63bc68` (trial 2). The model reaches 105/192,
compared with the unchanged original v1 result of 51/192. Adapter, prompt, token
cap, and execution conditions changed together. These are regression results,
not fresh generalization evidence. [Complete agent report](../arrangement-agent/results.md).

## 3. Models: compare ranking quality and inspect the fits

Open the [voicing-ranking run](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/voicing-ranking-v1).
The most informative summary fields are `learned/rr` **0.6898**,
`movement/rr` **0.3976**, `frequency/rr` **0.3863**, `learned/top1` **0.5438**, and
`learned/top3` **0.8010**. Keep `rows=4317`, `recordings=168`, `folds=18`, and
`productionPromotion=false` beside them. The 18 history points are distinct
cross-validation fits with `fold`, `trainingRows`, `trainingObjective`, and
`optimizerIterations`; they are not steps along one learning curve.

| Open run                                                                                                                                     | What it establishes                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Voicing data](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/voicing-data-v1)                               | The GuitarSet cohort, 4,317 transitions, 168 recordings, and dataset/feature lineage. Each question supplies the recorded previous shape and next pitch-class multiset. |
| [Held-out ranking](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/voicing-ranking-v1)                        | Eighteen fits excluding both the test performer and progression family. Recording-macro recovery improves over the frozen baselines.                                    |
| [Downloaded-artifact replay](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/voicing-artifact-replay-v1)      | A fresh process reproduces all 4,317 predictions from downloaded artifacts.                                                                                             |
| [Runtime fit](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/voicing-runtime-fit-v1)                         | A separate all-data fit: 24 optimizer iterations and 1,791 reproduced candidate scores across 12 parity cases. `newHeldoutScore=false`.                                 |
| [Arrangement confirmation](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/arrangement-agent-v2-confirmation) | Static request-processing metrics, not a trained musical model or a learning curve.                                                                                     |
| [Arrangement regression](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/arrangement-agent-v2-regression)     | The old request set rerun with the revised agent; retained separately from fresh confirmation.                                                                          |

The candidate feature artifact contains **641,630 rows**. Open
[features v0](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/artifacts/features/tabtopitch-voicing-features-v1/v0)
for the feature schema and
[cross-validation model v0](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/artifacts/model/tabtopitch-voicing-ranker-v1/v0)
for the 18 coefficient sets, normalization constants, split references, and
predictions. Compare coefficients with their feature definitions and scaling;
a larger coefficient alone is not a universal musical preference. The
[runtime model v0](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/artifacts/model/tabtopitch-voicing-ranker-runtime-v1/v0)
has one separately fit coefficient set. The historical browser experiment used a bounded, optional one-step comparison; its at-most-64-candidate UI differs from the exhaustive study bank. The standalone import excludes model weights, so that comparison is unavailable there. Deterministic ranking remains the default.
[ML results and limits](../voicing-ranking/results.md),
[dataset card](../voicing-ranking/dataset-card.md).

## 4. Registry: follow the exact artifact, not a production claim

Open [TabToPitch Research](https://forge.coreweave.com/registry/TabToPitch%20Research).
The two private collections have independently verified `research-candidate`
aliases:

| Collection                                                                                                                                                                                             | Verified identity and replay                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [Observed voicing ranker](https://forge.coreweave.com/registry/TabToPitch%20Research?selectionPath=wandb32%2Fwandb-registry-TabToPitch+Research%2FObserved+voicing+ranker&view=versions)               | Cross-validation artifact `QXJ0aWZhY3Q6NDI3MjM5ODA1Ng==`, version 0; all 4,317 held-out predictions reproduced. |
| [Recorded-choice runtime ranker](https://forge.coreweave.com/registry/TabToPitch%20Research?selectionPath=wandb32%2Fwandb-registry-TabToPitch+Research%2FRecorded-choice+runtime+ranker&view=versions) | Runtime artifact `QXJ0aWZhY3Q6NDI4OTU1NTk5OQ==`, version 0; all 1,791 parity scores reproduced.                 |

Check the alias, input dataset/features, source snapshots, and artifact digest.
Both aliases belong to entity `wandb32`, project `wandb-registry-TabToPitch Research`.
The research alias does not deploy a model or establish learner benefit. These
Registry links follow `globalRegistry` in the application source; alias identity
is API-verified while rendered navigation remains unreviewed.
[Cross-validation final readback (archived reference)](../../integration/historical-evidence.md#artifact-6ee57bd5fdb4),
[runtime publication readback (archived reference)](../../integration/historical-evidence.md#artifact-46510a9838a4).

## Inference accounting for the current studies

The arrangement campaigns used **528 completion requests**, including original
and failed qualification runs. Accounted usage is 783,709 tokens; 640,541 tokens
are reported usage, and 24 requests retain maximum reservations because usage is
unknown. The pricing-based total is **$0.05436667**, below the authorized $25
ceiling; it is not a billing invoice. The ranking study made no hosted inference
calls. [Machine-readable agent results and verified references](../arrangement-agent/results.json).

## Historical studies — preserved 2026-10-29 results

The following sections describe earlier fretboard and flashcard/recall work.
Their original URLs, captures, scores, and unfinished artifact stages remain
historical evidence. In particular, the older recall artifact failure below is
separate from the successfully published voicing artifacts above. Use the
[earlier results report](../results.md) for those datasets and splits.

### Fretboard intent: translate a note or chord request

The earlier [intent experiment](../practice-intent/results.md) tests authored requests such as “Make B the lowest sounding member of this G major triad.” The model proposes an inversion constraint; the actual app engine supplies every pitch and position. Current UI presets cover a narrower range than the engine API. This is experimental request translation, not an integrated cloud-intent input or evidence of improved learning.

Open [Agent Lens](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research) and filter for agent `tab-to-pitch-fretboard-intent`. Server readback verifies **26 conversations and 77 spans**. Inspect these cases by conversation ID:

| Case                                                                      | Conversation ID                        |
| ------------------------------------------------------------------------- | -------------------------------------- |
| B as the lowest tone of G major, correctly mapped to third in the bass    | `01a18978-e160-73bf-bc57-b904ccf5fe92` |
| Ambiguous “higher up,” incorrectly mapped to all frets                    | `01a18979-0311-761c-aca5-d23df2012c35` |
| Unsupported audio assessment, incorrectly replaced with chord exploration | `01a18979-4a64-72ec-8dfb-53bb380c4fd2` |
| Exact unison request that hit the completion cap                          | `01a18978-6d76-7092-aa2d-6da2eb826aaa` |

Open [the Evals list](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/evaluations) and compare these exact recorded calls:

| Arm                  | Evaluation call ID                     | Exact request match |
| -------------------- | -------------------------------------- | ------------------- |
| Deterministic parser | `01a18988-ef82-7dee-87ec-9a8f767a73ca` | 17/24               |
| GPT-OSS 20B          | `01a18988-fc04-7655-938c-48491e799ac8` | 20/24               |

Both use the same 24-row synthetic dataset and five-criterion scorer. API readback verifies 73 calls, 24 outputs, and 120 criterion values per arm. Model paraphrases improve from 1/8 to 6/8, while boundary handling regresses from 4/4 to 2/4. The [dataset card](../practice-intent/dataset-card.md) explains the authored examples, fixed musical context and labels. Weave replay completion is separate from the hosted agent's 22/24 accepted test proposals. No inference occurs during replay.

The [finished Models aggregate run](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/fretboard-intent-v2) records these counts as one measured point. All aggregate fields, the history point and the finished state are independently verified. No predictor was trained or promoted for this experiment. The inference ledger contains 26 total requests and 25,069 reported tokens, including qualification.

[Weave readback (archived reference)](../../integration/historical-evidence.md#artifact-eab9ef05d7ad), [Lens readback (archived reference)](../../integration/historical-evidence.md#artifact-561d945c74c0), and [Models readback (archived reference)](../../integration/historical-evidence.md#artifact-3e0215bf0aa8) preserve the evidence separately. The successful Weave publication reused the existing dataset after resolving a failed file upload by content-hash readback. Failed preflights and the original upload receipt remain available. These recorded contents are API-verified; their rendered dashboard appearance has not been reviewed in this revision.

### Agent Lens: follow an actual coaching request

Open [the project in Agent Lens](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research). Recovery produced **23 conversations and 99 spans**, including qualification. Follow a model call into `inspect_practice` and `choose_drill`, then inspect a rejected response. The [readback (archived reference)](../../integration/historical-evidence.md#artifact-9b8f80b75c12) matches the captured span identities and campaign hash. Traces describe execution, not guitar-learning outcomes.

### Weave: compare recorded outputs

Open the [canonical Evals list](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/evaluations), locate the two recorded arms, and select these exact evaluations for comparison:

| Arm                    | Evaluation call ID                     |
| ---------------------- | -------------------------------------- |
| Deterministic baseline | `01a1889e-0586-719e-93bb-2e1eb375693b` |
| `openai/gpt-oss-20b`   | `01a1889e-1907-7df1-8105-360c991a7493` |

The list route was observed in the UI, but the page remained blank or retained Models content during browser review. A comparison deep link is not verified; the constructed route redirected to Models. The evaluation contents are independently verified by API readback. Select these calls rather than an older attempt.

Both arms use the same 20-row dataset and six-criterion scorer. Readback verifies 61 complete calls, 20 outputs, and 120 criteria per arm. All application checks pass. **Provider success is 16/20**, with four local fallbacks retained. The larger model failed qualification and has no test-set result. Replay adds no inference requests; its latency measures replay. [Evaluation receipt (archived reference)](../../integration/historical-evidence.md#artifact-329696631a11).

### Models: inspect recall prediction

Open [the finished recall experiment](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/recall-public-v1). Its 63 metrics match the local experiment and one history point; this static evaluation has no training curve. Compare temporal Brier error with reserved-collection Brier error. The candidate improves the temporal score but has a worse reserved-collection point estimate, with an interval crossing zero. [Metrics readback (archived reference)](../../integration/historical-evidence.md#artifact-4cc95c3ee8c5).

### Inference and unfinished artifact lineage

The [request ledger (archived reference)](../../integration/historical-evidence.md#artifact-201f353d2cf1) records 41 recovery completion requests and 18,613 provider-reported tokens. Including the [original failures (archived reference)](../../integration/historical-evidence.md#artifact-fdce6f65bde3) gives 43 requests and 22,075 accounted tokens, including 3,462 unknown-usage reservations. This is accounting, not billing.

[Model-artifact publication (archived reference)](../../integration/historical-evidence.md#artifact-caa1ffc8e527) and a [second bounded attempt (archived reference)](../../integration/historical-evidence.md#artifact-aa10c8a198a9) both timed out during preflight, before writing. The [coefficients (archived reference)](../../integration/historical-evidence.md#artifact-b29dc644c688), [dataset manifest (archived reference)](../../integration/historical-evidence.md#artifact-a5c7a7caf681), and [experiment lineage (archived reference)](../../integration/historical-evidence.md#artifact-0196726e3772) remain local. Models tracking is verified; hosted artifact lineage and Registry promotion are absent. See the [publication status (archived reference)](../../integration/historical-evidence.md#artifact-06f420cc6fc8) for separate receipts and preserved failures.
