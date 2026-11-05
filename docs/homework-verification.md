# Homework verification — 2026-11-04

The implementation was checked in the isolated `4833/lima` worktree, using the parallel learning-workspace implementation as its baseline. All demonstrations use the original CC0 C–F–G–C–G7–Cmaj7 study.

| Check                        | Result                          | Scope                                                                                                    |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| TypeScript                   | Passed                          | Application, service, research runner and tests                                                          |
| Vitest                       | 336 passed, 2 skipped; 39 files | CAGED fixtures, grading, teacher contracts, persistence schemas and shared budget accounting             |
| Browser regression           | 72 passed, 4 skipped            | Desktop and mobile Chromium emulation; player, exploration, progression, teacher, listening and homework |
| Renderer                     | 4 passed                        | Measured labels, real worker/worklet startup, mobile engraving, stale worker generations                 |
| Production offline           | 1 passed                        | Cached assets and audio startup, answers, saved homework and resume after offline reload                 |
| Original-song capture        | 1 passed                        | Incorrect note answer, help, C/A fragments, two progression regions and F→E                              |
| Authored homework evaluation | 30 structural checks passed     | Contract/action validity, source preservation and respecting a request to stop quizzing                  |
| Patch rehearsal              | Passed                          | Dry-run application against the captured baseline                                                        |

The skipped unit tests require an isolated PostgreSQL database. Four existing browser cases run on desktop only because their underlying storage or cloud contract is shared. Mobile homework tests were executed, including keyboard input, masking, assistance order, source-view interruption, reload, shared playback and starting homework from the teacher.

A final 10-case homework rerun checks the visual cleanup that clears a previous answer’s selection and feedback when moving into Explore.

The browser run also found and fixed mobile listening-grid overflow, teacher-sheet handoff and session settings, overlapping score controls, and stale alphaTab worker bounds after rapid score replacement. The listening persistence check waits for an actual IndexedDB transaction before reloading.

## Research status

`homework-caged-003` retains 10 development cases, 30 evaluation cases, 148 hashed source snapshots and the original local outputs. Snapshot hashes were read back and checked. The earlier `homework-caged-001` and `homework-caged-002` preparations are preserved separately. Their superseded source hashes are not used for the current report.

Preparation reconciled $0.21908407 of historical inference and no unresolved historical calls. No new paid requests were made. The worktree lacks configured inference credentials and a verified shared-ledger adoption receipt. Runtime tracing and the bounded development runner use the existing teacher infrastructure; hosted actor/critic evaluation, qualified judging, Weave publication and remote readback remain unexecuted. Local structural acceptance does not qualify a hosted teacher or measure learning.

See the [homework protocol](../research/homework-caged/README.md) for execution requirements and the [activity contract](homework.md) for implementation details. Real Safari/iOS and Chromium/Android listening, human teacher review and learner outcomes remain separate checks. The captured video is silent; browser playback events do not establish perceptual audio quality.
