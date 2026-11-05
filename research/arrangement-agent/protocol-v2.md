# Arrangement agent transport experiment v2

This study follows the frozen v1 result. During v1, the provider sometimes returned
a JSON action in message content instead of its requested native function-call
field. The strict v1 adapter rejected it. Those failures and scores remain
unchanged. The v2 adapter accepts either native tool arguments or an entire JSON
object that satisfies the identical action schema. It rejects prose, code fences,
arrays, duplicate action keys, unknown fields, invented candidate IDs, and
unsupported facts. The coordinator executes the same deterministic tools.

Use policy `arrangement-v1` and prompt/transport revision
`arrangement-tools-v2-json`. Label native-tool and strict-json-action decoding
separately in tool spans. Allow at most two calls, 4,096 completion tokens per call,
and the same 30-second request deadline. This is a transport and token-budget
change, so comparisons do not isolate one factor.

Qualify both catalog models on the separate two-case development set before
scoring. Re-run the original 96 requests twice for the 20B arm only as a regression
comparison. These requests have informed the transport change and are not fresh
holdout evidence. Do not relabel or rescore v1 records.

The fresh confirmation set has 32 requests across eight new authored musical
contexts, each containing three chords rather than two. It includes DADGAD and
half-step-down tuning, capo, new neck limits, rootless voicings, seventh/ninth/
thirteenth harmony, and missing melody and adversarial boundaries. Freeze its
exact inputs and labels with all implementation hashes before any v2 inference.
Run two trials per qualified model. Fresh-context results, regression results,
and qualification failures have separate denominators and separate evaluation
identities.

The release gate uses only the complete fresh arm: at least 90% request-level
correctness across 64 attempts, no accepted invalid arrangement, and no unsupported
explanation fact. A successful gate permits an explicitly opt-in experimental
preview, not a learning-efficacy claim. The eight contexts limit generalization;
repeated trials do not add independent musical contexts.

Carry the entire v1 accounted spending ledger into v2. Reserve each new request
before sending, retain unknown usage, and stop before the same authorized $25
total across both studies. Record requested and returned models, completion caps,
latency, missing usage, and actual versus reserved cost. Never retry a completion
request. Read-only project and model discovery allow bounded retries, all retained.

Publish actual captured Agent Lens spans, Weave recorded-output evaluations, and
Models summaries. Read back case membership, call trees, individual criteria,
aggregates, and training-independent campaign metrics. Dataset cards must identify
all agent examples as synthetic. No learner files or history enter either study.

The research transport uses TLS 1.2 with certificate verification and up to four
concurrent attempts. This avoids observed local TLS-handshake stalls; v1 network
failures remain in its original denominator. It reuses the established discovery
connection and never retries a completion. The transport change is another
confounder in the v1/v2 comparison.
