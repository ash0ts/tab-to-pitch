# Transport recovery amendment

Declared on 2026-10-29 after the original campaign stopped, before any successful hosted response in either campaign. The original source snapshot, manifest, four qualification failures and two completion-request receipts remain under `tabtopitch-real-data/coach/`.

The original curl transport opened a new connection for every request. A successful catalog read did not establish a usable connection for the following completion. The Forge Models publisher demonstrated multiple acknowledged operations over one reused native HTTPS connection. This amendment tests that transport change, keeping musical cases, model IDs, prompt, tools, completion limit, per-attempt deadline, scoring and qualification rules fixed.

`--recovery` writes to `tabtopitch-real-data/coach-recovery/`. It uses one native HTTPS agent across discovery and completions. Up to five read-only catalog requests may establish that connection before qualification; failed completion requests are never retried. Qualification again uses the same two non-test cases, at most two attempts per model. No original failure becomes a success or disappears from the combined infrastructure report.

The original two completion requests and 3,462 unknown-usage reserved tokens count against the shared allowance. Recovery therefore permits at most 86 completion requests and 196,538 accounted tokens. The original campaign receipt is hashed in the recovery manifest. Recovery is unavailable if the original campaign has a successful hosted response or an unresolved active attempt.

Report the campaigns separately. A completed recovery comparison describes reliability conditional on establishing this persistent connection. It does not erase the original deployment availability failure. No model-quality hypothesis, cohort or scoring threshold changes after seeing an output.
