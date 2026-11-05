# Arrangement agent study

This experiment runs the application's real arrangement agent and deterministic
planner against authored musical requests. Its question is whether the language
model improves request-to-control interpretation while the engine keeps notes,
constraints, and explanations valid.

Read [the original protocol](protocol.md) and the separately versioned
[v2 protocol](protocol-v2.md) before executing. The [dataset card](dataset-card.md)
explains the provenance and limits of the original 96 cases; the
[v2 dataset card](dataset-card-v2.md) describes the separate 32-request
confirmation set. Source and case hashes are
frozen before inference, and provider failures remain scored failures.

The evidence directory is `.context/tabtopitch-real-data/arrangement-agent-v1`
relative to the parent workspace. It contains the frozen manifest, cases,
request-level usage ledger, exact outputs, actual Forge SDK span captures, and
independent publication readback receipts. Prior read-only preflight failures are
retained in separate directories and contain no inference requests.

The original campaign is immutable. Its `frozen-sources/` directory preserves the
implementation used for v1; the current runtime contains the v2 transport. Do not
re-run v1 with the changed runtime and label it a reproduction.

The v2 runner is `npx tsx research/arrangement-agent/run-v2.ts`. It supports
`--prepare`, `--run`, and `--summarize`, and refuses to overwrite an existing
campaign. Its combined evidence lives in the adjacent `arrangement-agent-v2`
directory; `regression/` and `confirmation/` contain distinct derived suites.
After execution, `node research/arrangement-agent/reconcile-v2.mjs` derives the
correct combined context counts and suite-specific request ledgers. It preserves
the runner’s original metadata and records every changed hash; scores do not
change. Do not run the runner’s `--summarize` after publication. The inference campaign requires
`WANDB_API_KEY`, the existing private research project, and explicit spending
authorization. The implemented ceiling is $25, including qualification.

Publish recorded evidence with
`node --import tsx research/arrangement-agent/publish.mjs --lens`, `--weave`, or
`--models`. Add `--verify` to perform readback without creating another record.
Set `ARRANGEMENT_EVIDENCE_DIR`, `ARRANGEMENT_RUN_NAME`, and
`ARRANGEMENT_SCORER_NAME` to publish each v2 suite under its own identity. Publish
the parent v2 directory to Agent Lens so development qualification is included.
The Weave replay makes no inference calls and verifies every criterion against
its original recorded output. Do not retry an uncertain write before independent
readback.

See [results](results.md) for measured outcomes and release qualification. These
are request-processing results, not evidence that a learner became a better
guitarist.

`results.json` is a compact, committed readback index for reports and dashboards.
It retains distinct suite denominators and publication identities. Full provider
responses and captured spans remain in the evidence directory.
