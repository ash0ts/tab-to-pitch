# Ear lab: useful investigation tools, no model promotion

The local workspace now connects an original recording, a learner's proposal, a transcription draft, corrections, and the existing progression player. The experiments do not justify making either the transcription pipeline or the teacher authoritative.

![Original audio, wrong-quality feedback, real draft inspection, correction, and a new neck position](../../docs/media/ear-lab/ear-workflow.gif)

[Watch the original application capture](../../docs/media/ear-lab/ear-workflow.webm). The waveform is an original CC0 G7→Cmaj7 study. Its simple timbre is useful for a reproducible demonstration; it is not representative of recorded guitar. Draft results come from actual local model runs, including their omissions. The correction shown is a learner edit, not a new reference annotation.

## Audio analysis

Sixteen recording groups were processed: six GuitarSet, six GAPS, two Guitar-TECHS, and two Slakh. Four groups train the reliability model, four report calibration behavior, four are fresh test groups, and four are previously inspected regressions. All conditions use the same frozen six-second excerpts. [Dataset context](dataset-cards.md), [exact membership and checksums](evidence/manifest.json), [64 condition rows](evidence/audio.table.json).

| Condition | Test recording-macro note F1 | Available test groups |
| --- | ---: | ---: |
| Full-mix MuScriptor | 0.6985 | 4/4 |
| Transcription after separation | 0.4043 | 4/4 |
| Reconciled hypotheses | 0.6886 | 4/4 |
| Reference-note ceiling | 1.0000 | 4/4 |

Reconciliation minus full mix was −0.0099 on this cohort; its recording-bootstrap 95% interval was [−0.0226, 0.0000]. Four recordings are too few for a broad model ranking. Separation helped some recordings and removed useful detail in others. The interface therefore keeps the original available and labels isolated parts as estimates.

Matching requires exact rounded MIDI pitch and onset within 50 ms, using one-to-one assignment. Offsets, duration-weighted pitch-class overlap, lowest-pitch agreement, and single-note fretboard existence are separate columns. The scorer includes reference onsets inside the excerpt; notes already sustaining at its start are excluded. Duration-based metrics consequently describe this onset cohort, not complete harmony at every boundary. Technique recognition, stem-isolation quality, and simultaneous fingering feasibility were not evaluated. [Full report](evidence/report.json).

The initial run stopped at the interactive import-size limit after six recordings. The second decoded excerpts before importing and retained 15 recordings, then exposed a duplicated Slakh ID. The third preserved the same 16-recording membership, corrected IDs, and reused results only with byte-identical input receipts. Model conditions and scorers did not change. Earlier attempts remain available in the local campaign directories.

## Reliability estimation

The regularized logistic model predicts whether a detected note matches an independent reference. It does not predict whether a learner knows the note. Training used 133 detected notes from four groups, train-only normalization, five frozen features, and L2 regularization with C=1. The fresh test partition contains 185 detected notes across four other groups.

| Recording-macro test metric | Fixed evidence rule | Logistic model |
| --- | ---: | ---: |
| Brier score, lower is better | 0.1646 | 0.2071 |
| Log loss, lower is better | 0.5105 | 0.6929 |
| Coverage at probability ≥0.8 | 0% | 46.2% |

The fixed rule never assigns more than 0.75, so its zero coverage at 0.8 is structural. That comparison cannot establish a useful-coverage win. The learned model's worse held-out Brier score and log loss are sufficient to reject promotion. Calibration-partition Brier score also worsened, from 0.2109 to 0.2349.

The candidate remains private research material. [Models training run](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/ear-lab-v1-003-reliability) records the actual training configuration, metrics, and artifact lineage. A fresh artifact download reproduced all 758 saved predictions within 1e-12. The private Registry collection is **TabToPitch Research / Transcription reliability**, alias `research-candidate`; this alias does not enable serving. [Readback receipt](evidence/models-readback.json).

## Teacher qualification

Two development turns were attempted for each Forge actor. Neither configuration qualified. Four actor calls and one critic call cost $0.00094916 at the frozen prices. The campaign includes 24 authored local development rows separately. No learner participated.

| Actor | Accepted turns | Retained failure |
| --- | ---: | --- |
| gpt-oss-20b | 0/2 | Incorrect Gmaj7 explanation followed by a critic with no completed review; another response used unsupported references and treated learner confirmation as evidence of correct hearing |
| gpt-oss-120b | 0/2 | HTTP 200 replies with no content or tool calls |

The application returned the local guide for all four failed turns. That is fallback success, not actor success. The first 20B actor claimed B was Gmaj7's seventh; it is the third. Its critic consumed the 2,048-token completion allowance without producing a review. No conversational-quality score is claimed because an independent evaluator did not qualify. [Original provider response](evidence/response-1.json), [critic response](evidence/response-2.json), [qualification summary](evidence/qualification-summary.json).

[Inspect the retained failure and its correction](../../docs/media/ear-lab/forge-failure.html). [Agent Lens conversation](https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/dc1a8458-5cc6-48af-aa60-adeff3b6898d) and [Weave replay](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/weave/calls/01a1a8f9-4e34-7a4b-ae72-f6a48f9af8a0) retain the failed execution. Lens readback reconciled four conversations and 17 spans. Weave replay reconciled 28 rows across five evaluations, with 89 evaluation-tree calls and no repeated actor inference. [Lens receipt](evidence/lens-readback.json), [Weave receipt](evidence/weave-readback.json).

The new full suite is frozen separately: 48 checkpoints, 12 six-turn episodes, and 12 boundary cases, each paired across reference, actual-analysis, and corruption conditions. Its authored policy executed 420 turns, including 24 development rows. The planned 1,584 cloud turns remain **unexecuted**, because neither actor passed the qualification check. Do not interpret absent rows as passes. [Membership](evidence/teacher-membership.json), [execution gate](evidence/teacher-execution-gate.json).

The [comparison run](https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research/runs/ear-lab-v1-003-comparisons) contains a 64-row audio Table and a 28-row teacher Table. Teacher rows link to the corresponding Lens conversation and separate displayed fallback from provider failure. All three published artifacts were downloaded and hash-checked. Run summaries required delayed readback; the first partial receipts remain preserved. These links have API readback verification, not an authenticated browser walkthrough.

## Delivery boundaries

The worker, local activity, teacher job tool, immutable reviews, source-aware storage, proposed fingering, and derived accompaniment are implemented. The worker keeps recordings and credentials local; Forge receives bounded symbolic context and opaque receipts. A model result or a learner correction cannot create a listening answer key.

The Toraneko export reader preserves version 2.7.0 projects and unresolved references. It does not yet recreate every legacy track, technique, or timing edit. Toraneko remains available until those replacement checks pass. Noise2Fret runtime/checkpoint/license qualification, executable TART comparison, real-device audio checks, and a qualified teacher/evaluator remain open. No new teaching model, microphone assessment, or learning-effectiveness result is claimed.

Next work should diagnose empty provider replies and incomplete critic output on development cases, then rerun qualification before the frozen cloud suite. Increase independently labeled recording groups before reconsidering reliability serving. Complete legacy-project reconstruction and real-device playback before retiring Toraneko. A later learner study must measure delayed listening recall, new-position transfer, and actual playing separately.
