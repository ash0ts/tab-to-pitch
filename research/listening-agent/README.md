# Listening teacher research

This experiment asks whether a conversational teacher can operate listening and fretboard tools while keeping musical facts, assistance, sources, and learner evidence straight. It does not measure hearing, playing, or learning gains.

Read the [dataset card](dataset-card.md), [product contract](../../docs/listening.md), and [results](results.md). Earlier teacher, arrangement, and voicing-ranking campaigns are immutable and remain in their original directories.

## Frozen comparison

The authored policy and hosted teacher receive identical checkpoint histories. There are 24 development checkpoints, 48 held-out checkpoints, twelve six-turn episodes, and twelve boundaries. Hosted actors have two trials. Episodic follow-ups use actual prior replies and scripted learner events; different actor replies can therefore produce different episode histories. No particular teaching tool sequence is the answer key.

20B receives a fresh capability check. A completed reviewed turn establishes that the transport can execute, not that the model is qualified. The full experimental comparison may continue after other development failures. 120B enters the full suite only after two usable fresh smoke turns. Missing or malformed output remains a failure; unexecuted cases remain unexecuted.

The runtime critic is charged in each teacher turn. Independent reviewers must pass the existing factual and dialogue calibration before their quality ratings can support promotion. A frozen, hash-checked calibration may be reused without repeating inference. The comparison reports structural correctness, hosted completion versus fallback, independent quality ratings, latency, and usage separately. Weave replays recorded outputs; its duration is replay time, not inference time.

Promotion requires zero observed critical accepted violations, at least 90% acceptable ordinary checkpoints, and at least 90% valid episode completion under a qualified evaluator. Experimental access is independent of promotion. No qualified evaluator means no quality or release claim, even when deterministic checks pass.

## Reproduction

Use the pinned npm dependencies. Prepare a new directory; never overwrite a campaign:

```sh
node --import tsx research/listening-agent/run.ts --prepare --dir ../tabtopitch-real-data/listening-agent-new
node --import tsx research/listening-agent/run.ts --run --dir ../tabtopitch-real-data/listening-agent-new
node --import tsx research/listening-agent/publish.mjs --lens --dir ../tabtopitch-real-data/listening-agent-new
node --import tsx research/listening-agent/publish.mjs --weave --dir ../tabtopitch-real-data/listening-agent-new
node scripts/publish-listening-table.mjs ../tabtopitch-real-data/listening-agent-new
```

`WANDB_API_KEY` stays in the process environment. The private project is checked before writes. `--reuse-calibration <completed-campaign.json>` snapshots prior calibration and its hash at preparation. Source changes require another campaign. The runner reserves worst-case cost before each request and retains unknown-usage reservations. It reconciles every prior root campaign against the original $25 ceiling; the new campaign cannot exceed $15 or the remaining authorization, whichever is lower. Prepared campaigns with zero requests consume no inference budget.

The publisher verifies source hashes, imports the frozen scorer, and checks dataset membership, recorded outputs, criterion values, and call trees after upload. Lens readback reconciles exact captured span identities and conversation membership. The W&B Table distinguishes observed actor turns, successful local fallback, evaluator failures, and unexecuted cases, with direct trace links and execution latency. Models and Registry retain the existing voicing-ranker lineage; no teaching model is trained.
