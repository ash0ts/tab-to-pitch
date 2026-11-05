# Forge evidence audit · 5 November 2026

The UI redesign preserves the experiments and their failed qualifications. This audit made read-only API calls to the existing private `wandb/tab-to-pitch-public-data-research` project. It made **zero inference calls and zero remote writes**.

| Evidence | Fresh check |
| --- | --- |
| Historical archive | All 48 inventoried artifacts match their recorded sizes and SHA-256 hashes. |
| Agent Lens: arrangement v2 | Exact membership: 1,588 spans across 260 conversations. |
| Agent Lens: listening 003 | Exact membership: 2,382 spans across 148 conversations. |
| Weave: arrangement confirmation | 32 unique requests, 96 arm rows, 291 call-tree records, 864 criterion values. Dataset identities, outputs, scores and summaries match. |
| Weave: listening 003 | 424 observed rows, 1,286 call-tree records, 5,512 criterion fields across 14 groups. Dataset identities, outputs, scores and summaries match. Null quality fields remain null. |
| W&B Tables: listening comparison | A fresh download matches the recorded SHA-256: 688 rows, including 264 unexecuted 120B turns. |
| W&B Models | Five finished runs read back: voicing ranking, downloaded-artifact replay, runtime fit, arrangement confirmation, and listening comparison. |
| Registry | Both private `research-candidate` aliases still point to the recorded voicing-model artifact identities. Neither denotes production promotion. |

[Machine-readable receipt](./evidence-audit.json) · [Private dashboard tour](./dashboard-tour.md).

The original listening replay guard rejected the integration lockfile because it differs from the frozen campaign. We kept that guard. A separate read-only verifier compares stored outputs and scores without running them under new dependencies. The arrangement publisher's default v1 scorer name also caused an initial aggregate-check failure; the independent readback follows the frozen v2 scorer reference. Neither historical campaign was edited to make a check pass.

## What the results support

The voicing ranker recovers recorded GuitarSet choices better than the tested baselines (recording-macro reciprocal rank 0.690 versus 0.398 for minimum movement). It does not establish comfortable fingering or better learning. The standalone app does not bundle its weights.

The arrangement agent got 46/64 requests correct across two confirmation trials, below its 90% release gate. The later listening teacher returned 45/96 ordinary checkpoint responses; 51 fell back locally. Its independent reviewer classified 52/60 factual fixtures correctly and detected only 40% of critical unsupported claims. It did not qualify. Fallback success is not actor success, and valid tools do not prove truthful prose.

The Ear Lab reliability model's held-out recording-macro Brier score was worse than fixed rules: 0.207 versus 0.165 (lower is better), on 185 notes in four recordings. It remains a research candidate. This pass inspected its local report and receipts; it did not reread Ear Lab's hosted objects.

## Spending and limits

The integration's historical reconciliation accounts for **1,388 requests and $0.22003323**, including **57 unknown-usage reservations**, across 30 source records. This is a historical pricing-based ledger, not an invoice or a current shared-wallet balance. This audit adds $0 in inference. Other worktrees must still use atomic shared reservations; no budget was reset.

Rendered private dashboard navigation was not visually rechecked. Model predictions were not recomputed; the previous artifact-replay result was read back. Hardware testing, qualified conversational evaluation, and human learning studies remain outstanding.
