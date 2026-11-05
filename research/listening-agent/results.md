# Listening teacher: implementation and measured results

Measured 4 November 2026 in the private `wandb/tab-to-pitch-public-data-research` project.

The local listening-to-fretboard workflow works with the original study. The hosted teacher is available for invited experiments, but it did not qualify: **45 of 96 ordinary checkpoints produced a validated, runtime-critic-approved actor reply**. The remaining 51 used the local fallback. The independent evaluator also failed calibration, so these numbers describe execution, not teaching quality.

The three popular-song candidates remain previews, not quizzes. All three visible embeds reported “video unavailable” in the isolated Chromium check, and their excerpt alignment has not been reviewed. There is no measured familiar-song listening result.

## What changed

Local artist/title and CSV imports now match against a source-aware catalog. The ready original study supports Guided, Recall, and related-key Transfer practice. Questions hide revealing notation and conversation; replay, assistance, answers, and interruptions are recorded separately. Feedback distinguishes a wrong root, wrong quality, and reordered sequence. The same progression then opens in the existing arrangement workspace.

The teacher uses `teacher-v2` listening context and new passage/listening tools. Voicing tools return a compact model-facing view while retaining complete engine results in research traces. This repairs an oversized continuation found during the first campaign without increasing the 60-second deadline. Provider failures now retain HTTP status, finish reason, and malformed-response evidence. Experimental access and qualification status are separate.

See the [product contract](../../docs/listening.md), [demo](../../docs/listening-demo.md), and [dataset card](dataset-card.md).

## Data and comparisons

The suite contains 18 original synthetic progression contexts: six development and twelve held out. Four evidence patterns produce 24 development and 48 held-out checkpoints. Twelve six-turn episodes and twelve boundary cases test follow-ups, source failures, ambiguity, masking, and stale state. Recording identities and transposition-normalized progression families are disjoint across development and evaluation. These are authored harmony and scripted histories, not recordings of learners or a transcription dataset.

`listening-agent-002` retained the initial tool policy, capability failures, and independent reviewer calibration. `listening-agent-003` froze the revised compact tool policy, reused the hash-checked calibration, and ran the full 20B experiment. Earlier teacher, arrangement, and ML experiments were not modified. There is no full-suite before/after estimate: the initial campaign only ran capability probes.

The authored baseline ran 156 turns: 24 development, 48 checkpoints, 72 episode turns, and twelve boundaries. It used the same deterministic tools and passed the structural checks. That establishes a functioning fallback, not conversational superiority. Hosted checkpoints receive identical histories; episodes carry each actor's actual replies forward, so their later histories can differ.

## Hosted execution

| 20B cohort                       | Returned actor reply | Local fallback after attempted inference | Assistance gate, no inference | Total |
| -------------------------------- | -------------------: | ---------------------------------------: | ----------------------------: | ----: |
| Ordinary checkpoints, two trials |                   45 |                                       51 |                             0 |    96 |
| Episode turns, two trials        |                   71 |                                       51 |                            22 |   144 |
| Boundary cases, two trials       |                   13 |                                        9 |                             2 |    24 |
| Capability probes                |                    1 |                                        1 |                             0 |     2 |

Ordinary checkpoint failures comprised 45 invalid responses, four critic rejections, and two actor-call-limit failures. Median end-to-end checkpoint time was **9.68 seconds**; the nearest-rank 95th percentile was **23.86 seconds**, including failures. Replay durations in Weave are separate and must not be reported as inference latency.

The assistance gates are a distinct result. The scripted episode harness can ask for help while its prior question is unassisted; those 22 turns correctly stop before inference. They are not provider failures. No episode had six consecutive hosted completions, but that is not equivalent to the proposed valid-episode-completion metric: legitimate assistance gates and fallback are present, and no qualified evaluator assessed the episodes.

Each context contributes four ordinary histories per trial:

| Held-out context | Trial 1 actor replies / 4 | Trial 2 actor replies / 4 |
| ---------------- | ------------------------: | ------------------------: |
| ear-eval-01      |                         0 |                         3 |
| ear-eval-02      |                         2 |                         0 |
| ear-eval-03      |                         1 |                         0 |
| ear-eval-04      |                         2 |                         2 |
| ear-eval-05      |                         2 |                         1 |
| ear-eval-06      |                         2 |                         2 |
| ear-eval-07      |                         3 |                         1 |
| ear-eval-08      |                         3 |                         2 |
| ear-eval-09      |                         2 |                         2 |
| ear-eval-10      |                         1 |                         3 |
| ear-eval-11      |                         3 |                         2 |
| ear-eval-12      |                         3 |                         3 |
| Total            |                   24 / 48 |                   21 / 48 |

These repeated trials are correlated observations from twelve contexts, not 96 independent learners. The case-level table retains request, context, output, actions, failure, execution time, accounting, and Lens link. Two fresh 120B capability probes returned unusable null responses; its 264 full-suite turns remain explicitly unexecuted.

## Factual review did not qualify

The 20B independent reviewer completed 55 of 60 held-out factual fixtures. Counting missing responses as failures, it classified **52/60 correctly (86.7%)** and detected **40% of critical unsupported claims**. Both miss the 95% accuracy and 90% critical-detection gates. The larger reviewer failed its two capability probes. The 24 dialogue challenges were not executed after factual qualification failed.

Consequently relevance, continuity, supported explanation, instructional load, useful demonstration, and unnecessary refusal ratings are **unavailable**, not zero and not passing. The runtime critic is a separate call but uses the same model family; its approval is not an independent assessment. No model is promoted.

Returned actions passed schema, freshness, musical-action, masking, and allowed-operation checks, including fallbacks. These checks do not prove every sentence is true. One [accepted checkpoint](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/93c8126f-a7b8-4e0e-9c87-996260dd936a) refers to a replay the learner had “just heard,” although the runner only prepared an action and had no listener. This is an unsupported exposure claim that survived runtime review. It is retained as a failure example, not hidden behind valid tool output.

## Actual app demonstration

The separate `listening-demo-001` used the real `/api/teacher/next` route, invitation/session checks, actor, critic, and musical tools through the browser. Invitation persistence was an ephemeral test repository on loopback; this does not qualify PostgreSQL deployment. All three hosted turns fell back. The last retained validated voicing previews, but its actor explanation was withheld.

Retained drafts illustrate different failures: an unsupported structured claim type, a listening reply that exposed harmony before posing its question, and a voicing explanation that described omitted fifths despite including them. None of these drafts is presented as a successful teaching response. The local guide and verified actions kept the workspace usable.

- [App demonstration: one Lens conversation across three requests](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/d40fd6de-ed49-440f-b70f-397765c4ac6c).
- [Matching three-row Weave replay](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a1a8fd-ffa6-78e8-a1ad-418812dc160f).
- [App demonstration comparison table](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/listening-demo-001-comparison).

Its replay snapshot was made after execution and is labeled accordingly. It is an integration demonstration, not another pre-registered held-out trial. No inference was repeated to publish or score it.

## Forge readback and accounting

| Publication                        |      Lens spans read back | Weave observed rows / call-tree records | Table rows |
| ---------------------------------- | ------------------------: | --------------------------------------: | ---------: |
| Initial capability and calibration |                 503 / 503 |                               282 / 857 |        810 |
| Full revised campaign              |             2,382 / 2,382 |                             424 / 1,286 |        688 |
| Actual app demonstration           | 21 / 21, one conversation |                                  3 / 10 |          3 |

Weave counts include recorded-output and scoring calls, not additional inference. The initial table contains 160 teacher turns, 122 evaluator observations, and 528 unexecuted teacher turns. The revised table contains 424 teacher turns and 264 unexecuted 120B turns; reused calibration remains in the first campaign. Its zero _new_ evaluator failures does not imply reviewer qualification.

[Initial comparison](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/listening-agent-002-comparison) · [Revised comparison](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/listening-agent-003-comparison) · [20B ordinary checkpoints, trial 1](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a1a8f7-bd86-7f38-ab90-0728c6688a11).

Receipts live below the parent workspace's `.context/tabtopitch-real-data/`: each campaign preserves `manifest.json`, `cases.json`, `campaign.json`, frozen sources, responses, and `publication/`. Lens reconciles span identities and conversation membership. Weave verifies dataset membership, outputs, criteria, and call trees. Table readback downloads the uploaded bytes and checks their SHA-256 and row count. The first immediate table summary reads were stale; their failed receipts remain alongside later read-only verification. No duplicate runs were created to hide that delay.

| Spending                                            |  Accounted USD |
| --------------------------------------------------- | -------------: |
| Historical experiments before this iteration        |     0.07257308 |
| Initial listening capability/calibration: 130 calls |     0.01662164 |
| Revised campaign: 603 calls                         |     0.12813256 |
| Actual app demonstration: 6 calls                   |     0.00175679 |
| Listening iteration total                           | **0.14651099** |
| Cumulative authorized research                      | **0.21908407** |

The revised campaign includes 447 actor and 156 runtime-critic calls. Unknown usage retains its full reservation: four initial calls, nine revised calls, and one demo call. These are accounted costs, not an invoice reconciliation. [Published Forge pricing](https://coreweave.com/forge-pricing/inference-agents), checked 4 November, was $0.03 input / $0.13 output per million tokens for 20B and $0.03 / $0.17 for 120B. Historical spending was not reset. Both the $15 listening limit and the original $25 cumulative limit were respected. Models/Registry keep the prior voicing-ranker lineage; this work created no teaching-model training run.

## Verification and next work

Typecheck, production build, 278 unit tests, renderer checks, and offline reload passed. Two database tests were skipped without an isolated PostgreSQL URL. All 66 active browser scenarios passed across the suite and a stable rerun of four mobile cases affected by development-server reloads; four browser cases were skipped. Actual playback events were exercised, but silent captures and automated playback do not qualify Safari/iOS or Chromium/Android audio.

Next, verify accessible recording excerpts and their harmony before unlocking popular-song quizzes. Repair the retained actor-output and exposure-claim failures on separate development cases; qualify an independent evaluator before promoting a teacher configuration. Exercise persistent invitation storage and real-device audio. A later consented study must separately measure unfamiliar listening, delayed recall, new-position transfer, and actual playing. This campaign establishes neither improved hearing nor improved guitar playing.
