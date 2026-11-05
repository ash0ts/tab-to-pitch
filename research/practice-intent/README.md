# Practice intent experiment

This experiment asks whether a hosted model can translate a learner's request into the constraint API behind the fretboard explorer. The selected note or chord comes from the music engine. The model can choose a note search or triad search and bounded filters; it cannot supply pitches, chord tones, positions, grading keys, or code.

The engine accepts numeric ranges beyond the current UI's preset fret windows. This is an experiment at the engine boundary, not a completed natural-language input feature.

The comparison uses authored synthetic requests, not recorded learner language. A deterministic parser is the local control. Exact constraint agreement tests whether the request was understood. Engine validity checks a separate question: whether the resulting search respects the selected music and returns usable positions. A valid search can still misunderstand the learner.

The source contract, cases, parser, prompt, checker, dependencies, and engine are frozen before hosted inference. The original GuitarSet and recall experiments remain unchanged. No experiment automatically enables an application feature or promotes a learned scheduler.

## Run and inspect

Read the [protocol](protocol.md), [dataset card](dataset-card.md), and [measured results](results.md) before interpreting the dashboards. Preparation v1 is retained and made no hosted calls. The executed v2 campaign uses the corrected local parser and unchanged cases.

```sh
npx tsx research/practice-intent/run.ts --prepare
npx tsx research/practice-intent/run.ts --run
npx tsx research/practice-intent/run.ts --summarize
npx tsx research/practice-intent/publish.mjs --lens
npx tsx research/practice-intent/publish.mjs --weave
npx tsx research/practice-intent/publish.mjs --models
```

Preparation and execution refuse existing manifest/campaign paths. Publication also refuses an existing receipt. `--verify` with a publication target performs readback only; it never retries inference or an unresolved write. The hard allowance covers qualification and test calls together. The hosted intent feature remains experimental research, separate from the existing coach endpoint.

The completed campaign used reviewed `--recover` publication attempts after read-only preflight failures and an independently confirmed absent source file. Verify the completed records with `--weave --recover --verify` and `--models --recover --verify`. Recovery preserves original receipts and requires the existing dataset to match all frozen rows before any evaluation starts. The recovery code uses the pinned SDK's actual object/table reference types, verified offline before execution.
