# Connected homework demonstration

`connected-homework-demo-v1` is a development integration check with three authored learner messages. It is not a held-out evaluation or a learning study. The earlier campaigns remain unchanged. The [dated report](../../public/research/notebook/connected-homework.md) records the outcomes and dashboard links.

The browser drives the real application and `/api/teacher/next` route: select and audition a note, ask about E in C major, play a CAGED fragment, rehearse two progression regions, report difficulty with F→E, ask for help, encounter unassessed synthetic input, and save/resume. The hosted capture uses actual Forge inference. The separate local capture uses the on-device guide and makes no model calls. Neither records a human guitarist; video is silent and does not qualify physical audio latency.

## Execution and accounting

`scripts/connected-homework-demo-server.ts` requires `TTP_DEMO_DIRECTORY`, `TTP_SHARED_INFERENCE_LEDGER`, `TTP_HISTORICAL_ROOTS`, `TTP_LEGACY_DEMO`, and a server-side `WANDB_API_KEY`. It reconciles historical receipts with the canonical shared SQLite ledger, freezes selected runtime files and prompts, admits only the three specified requests, and caps each run at $0.10 within the original shared authorization. It uses the production route with a loopback-only, in-memory invitation repository. It is not a production server.

Start a separate Vite instance on port 5420 with `TTP_API_ORIGIN=http://127.0.0.1:3001`. Bundle the capture script with esbuild for Node, then run it in isolated Chrome. `TTP_DEMO_SOURCE=local` skips invitation exchange and invokes the on-device guide. Stop the demo server after the hosted capture to flush the actual SDK spans and finalize the accounting receipt.

`publish.mjs <directory>` uploads captured Agent Lens spans and replays recorded outputs through the official Weave SDK. It does not call inference. An empty HTTP 200 ingestion response is an unknown write outcome: use `--lens-readback` rather than uploading again. Verification checks conversation/span membership, dataset row references, recorded model outputs, criterion inputs/outputs, and aggregation. The publisher intentionally refuses changed working runtime files; retain each frozen source snapshot when reproducing an earlier run.

`publish-comparison.mjs <directories...>` creates a private W&B Table containing actual replies, errors, unexecuted turns and trace/replay links. `--verify` independently downloads the table and checks the finished run's summary. Summary propagation can lag a successful upload; preserve pending receipts and read back before retrying a write. This is an evaluation record, not a training run.

## Interpretation limits

The seven executable smoke criteria plus immutable-request check do not validate all prose. In run 003, a critic-approved response contained two wrong coordinates despite passing the smoke checks. The separate inspection records that critical accepted error; the original output and original scores are preserved. The later prose guard routes common English numerical coordinates to engine-rendered diagrams. It is not a complete natural-language verifier.

The source manifests are selected-file snapshots, not complete repository archives. Run 004 additionally captures the context projection, review prompt and coordinate guard; earlier snapshots lack those dependent files. Reports must not claim bit-for-bit reconstruction of the entire app from these manifests alone. The capture script's first two failures are retained separately from model failures. Revised layouts and the local detection-question dispatch received subsequent regression checks; the cloud run identifies the source snapshot it actually executed.
