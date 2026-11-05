# Free-form music-teacher evaluation

This experiment asks whether the agent can hold a useful conversation about the selected music while operating the application's deterministic tools. It measures observed application behavior and separately judged explanations. Its synthetic learners cannot establish that anyone learned guitar.

The three lesson areas are note and chord-role foundations, chord connections, and extensions with contextual rootless voicings. The agent can choose demonstrations, questions, clarifications, and tool sequences. The checker does not require the authored teacher's wording or next action.

`cases.ts` contains authored musical contexts, development cases, fixed histories, boundary requests, and conditional episode scripts. `judge.ts` contains independent explanation-review prompts, claim calibration cases, and the review schema. `budget.ts` reconciles earlier inference ledgers, reserves before transmission, and retains unknown usage. The machine-readable [protocol](protocol.json) is frozen with the executed source snapshot, and the [dataset card](dataset-card.md) describes its limitations.

The actor is the production teacher module, supplied through a research adapter. Captured provider output, executed tool results, local structural criteria, runtime critic results, and independent evaluation-judge results remain separate. A valid local fallback is not reported as successful hosted teaching. An unqualified judge cannot supply release evidence.

The research project remains private. Only original authored examples and synthetic histories enter this pipeline. User files, song metadata, lyrics, and real practice histories remain outside it.

No new trainable teacher model is introduced. Models tracking, if published, contains a static measured campaign summary. The existing voicing-ranker training and Registry artifacts retain their separate purpose.

## Run and reproduce

From the application directory, `npx tsx research/teacher-agent/run.ts --prepare --dir <new-directory>` freezes sources, fixtures, historical spending, and the local baseline without cloud calls. `--run --qualify-only` executes the bounded development qualification. Inspect the complete receipt before `--run --resume` continues into judge qualification and the frozen cohort. An unresolved completion or changed source hash prevents resumption. `--summarize` is read-only.

After both hosted actors fail a completed qualification, `--prepare --failed-qualification <prior-directory> --dir <new-directory>` freezes a calibration-and-local-baseline-only campaign. It records the prior campaign hash and makes no hosted teacher calls. This option transfers no model eligibility to changed code. `--run` then calibrates judges and scores the local baseline only if a judge qualifies.

For a revised policy, `--prepare --actor-model openai/gpt-oss-20b --development-block 1 --dir <new-directory>` freezes a fresh 12-case development block for that actor alone. Blocks 0, 1, and 2 each contain four evidence states in each lesson. The selected models and block are stored in the manifest, so later run flags cannot change the cohort. Excluding a model leaves it ineligible; it does not establish a new measured result for that model.

Credentials are read from the existing `WANDB_API_KEY` environment variable and are never written into receipts. The runner uses the live model catalog and verifies the existing private research project. It cannot create a public project or raise the allowance.

`npx tsx research/teacher-agent/publish.mjs --dir <directory> --check` validates publication inputs without cloud access. `--lens` publishes captured SDK spans; `--weave` publishes recorded-output evaluations. Both support `--verify` for independent readback without another write. Evaluation replay makes no inference calls. Every publication attempt has a separate receipt; an unknown write outcome must be resolved by readback before another attempt.

## Protocol

The [protocol notes](protocol.md) specify units, controls, missingness, gates, and readback. [Results](results.md) distinguish prepared infrastructure from executed evidence. Previous arrangement, recall, and ranking studies remain unchanged.
