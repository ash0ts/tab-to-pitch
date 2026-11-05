# Coach regression replay

These fixtures are authored examples of the coaching contract. They contain no
real learner data. Passing them establishes that the candidate selection,
settings, and explanation obey the contract for those examples. It does not
establish learning improvement, calibrated difficulty, or guitar performance.

Run `npx tsx evals/replay.ts` for the local deterministic replay. It writes
`evals/artifacts/latest.json`, including individual outputs and scorer results.
Use `--output path.json` to keep a named artifact for comparison. The artifact
records its synthetic status and a real-learner count of zero.

`--live` runs the same fixtures through the bounded Forge tool agent. It requires
the cloud environment described in [the server guide](../server/README.md) and
consumes inference credits. This administrator script runs a fixed fixture set
directly; invitation and daily web-API token budgets do not apply to it. Each
fixture still uses the agent's deadline, step cap, and completion-token cap.

`--publish` uploads the fixtures and already-recorded outputs to Weave using
`WANDB_API_KEY` and `FORGE_PROJECT`. Publishing does not make another inference
call. It uses the installed Weave SDK's Dataset, Evaluation, and function-based
scorers. Agent Lens production spans and Weave evaluation calls are separate
surfaces.

The scorers check eligible candidate references, unchanged drill kind and note/loop/tempo
settings, exact explanations derived from evidence, expected selection priority,
and expected reason codes. API and agent tests also cover malformed payloads,
unexpected fields, injected tool arguments, invalid candidate references,
unavailable models, cancellation, missing usage, replayed requests, and quotas.

Extend the synthetic fixture set when fixing a reproducible contract failure.
Real evaluation datasets need a separate consent and data-retention workflow;
this application does not collect training data or train a learner model.
