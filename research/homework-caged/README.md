# Homework CAGED evaluation

`homework-caged-v1` is a separate authored-behavior suite. Earlier campaigns remain unchanged. It tests misleading shape-name premises, repeated role errors, changed goals, valid alternative voicings and unsupported claims about playing.

The suite contains 10 development cases in D and A, and 30 evaluation cases in C, F, G, B-flat, E-flat and A-flat. Each context has the same five categories. These are authored prompts and histories, not recorded learner language or educational outcomes. `--prepare` saves immutable case membership, IDs, source hashes, source snapshots and original outputs; a new preparation must use a new directory.

The deterministic scorer reports contract validity, action validity, source preservation and respect for a request to stop quizzing separately. It does not turn schema acceptance into conversational quality. The authored arm is labeled local; it is never counted as Forge actor success. A factual critic is fallible and does not establish educational effectiveness.

## Execution and accounting

`run.ts --prepare --dir … --historical-root … --legacy-demo …` freezes the cases and executes the authored arm without inference. The historical paths must refer to the canonical campaign records, not a copied allowance.

`run.ts --run-development` uses the existing actor, critic and Agent Lens implementation with two development trials of `openai/gpt-oss-20b`. It requires server credentials, an up-to-date pricing receipt whose prices equal the pinned budget, a shared SQLite reservation ledger, and a matching receipt that all concurrent campaigns adopted that ledger. It refuses execution when a historical campaign has an unresolved request. Failed calls and unknown usage retain their reservations. The ceiling remains the lesser of $15 and the remaining original $25; preparation does not grant a new allowance.

The shared ledger implementation comes from the parallel teaching-practice worktree. Source provenance and hashes accompany this worktree’s handoff. Actor and critic usage are reserved separately through the same ledger. Research traces use the existing authored-evaluation payload policy and link each case and trial to its lesson context.

Held-out cloud execution, qualified judging, Weave replay publication, Tables and remote readback are still required before reporting hosted results or promotion. Do not publish local structural checks as an evaluated live teacher. The current implementation includes the development runner and frozen local evidence; it does not manufacture remote rows or training runs.

## Current blocker

The 2026-11-04 preparation reconciled $0.21908407 of historical inference and found no unresolved campaign requests. This is a point-in-time receipt, not a reusable balance: execution reconciles again. This worktree has no shared ledger/adoption receipt or inference key configured. No paid calls were made for this homework campaign. Adopt shared accounting, verify current prices and supply credentials before executing development qualification.

Human teacher review, microphone assessment and learner-effectiveness claims remain deferred. Real-device listening is a separate acceptance check from browser playback events.

The [implementation verification record](../../docs/homework-verification.md) lists the local run and its limits.
