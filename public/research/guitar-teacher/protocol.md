# Guitar teacher grounding experiment v1

Decision: should the experimental teacher explicitly inspect evidence and prepare a musical demonstration before its final reply? This study measures delivered musical actions and runtime reliability. It does not measure teaching quality or learning.

## Cohort and treatments

Use GuitarSet 1.1.0 annotations directly, with independent Python chord formula tables. The intended lead-sheet harmony supplies the requested accompaniment; it is not asserted to describe every performed note. A stable annotated note connects each role task to an actual passage. No audio is sent to inference.

Exclude the three publisher-identified erroneous recordings and the earlier live-coach cohort. Select six development recordings from performers 00/01, progression family 1. Select 36 evaluation recordings from performers 02/03/04, families 2/3: six recordings in each performer/family cell, chosen by a fixed hash. Recordings, performers and progression families are disjoint across this development/evaluation split. The whole corpus has previously supported ranking research; model pretraining overlap is unknown.

Each recording supplies two requests: show a specified chord role on the fretboard; prepare the same three-chord passage in a specified region. Thus evaluation has 72 checkpoints, clustered within 36 recordings and only two progression families. Learner wording and response history are authored, not observations of real learners.

Compare the unmodified local policy, the current Forge 20B teacher, and the same hosted configuration with an evidence-first prompt suffix. Both hosted arms receive the same request, tools, initial facts, four actor calls, eight tools, one critic and 60-second deadline. Run two trials per hosted arm; local is deterministic and runs once. Interleave arms and cases in a frozen hash order. The suffix combines evidence/demonstration guidance with format guidance learned on development cases; it is not a factorial isolation of those instructions. The suffix is the only intended actor treatment; do not modify production code during execution.

The evidence-first suffix asks for relevant inspection and a verified demonstration. It does not supply task answers or prescribe the same lesson sequence for every learner. Whether the actor follows it is measured separately; tool calls alone are not success.

## Measures

Primary: independently valid requested demonstration delivered in an accepted hosted response per checkpoint; use action delivery for the local policy. Verified artifacts retained by fallback are a separate product-delivery measure. For role tasks, require the requested span/degree and verify every highlighted pitch and position. For revoicing, require a returned variation preserving all three chord spans and verify notes, required degrees, timing, distinct strings, voice count, range and span against independent formula tables. Accept all valid alternatives. No keyword-matching explanation score.

Report hosted completion, requested-action delivery before fallback, delivery including fallback, observed invalid actions, structured-claim errors, actor-selected tools, calls, token usage, cost and execution latency separately. Failures/timeouts count as zero primary success. An unavailable evaluator is not an actor failure. Unexecuted cases remain absent outcomes with explicit counts.

Aggregate first within recording across its tasks/trials, then across recordings. Report task-family slices and paired wins/losses. Bootstrap paired recording means with a fixed seed and 10,000 draws; also show performer/family cells. The small number of performers and shared lead sheets limits generalization. Cluster resampling does not remove those dependencies.

## Reviewer experiment

Separately test the existing factual critic on 48 held-out, independently labeled statements: six roots (C, D, E♭, F♯, A♭, B) × two chord qualities, each containing a correct claim, wrong chord role, wrong position pitch, and invented fingering observation. Twelve development fixtures use G, A and B♭. Call the critic once per fixture with its production prompt/schema and the verified context. Report sensitivity to wrong claims, false rejection of correct claims, unavailable/malformed reviews and reasons. This is a diagnostic, not the full existing reviewer-qualification suite. Do not use an unqualified critic to label explanation quality in the actor comparison.

## Freeze, execution and accounting

Freeze the fixture membership, prompts, runtime source, dependencies, independent scorer and aggregation before evaluation. Development is for adapter/scorer validation; preserve development results. Do not tune on evaluation failures or silently retry them. Preserve raw provider receipts locally, including malformed and unknown-usage calls. Resume only identities proven not to have started. Stop on source drift or an unresolved budget error.

Use the canonical shared SQLite reservations and reconcile historical spending. This campaign receives no new authorization: maximum $15 or the remaining original $25, whichever is lower. Recheck provider prices before freeze. Discover model availability; capability success does not mean teacher qualification. No cloud GPU or model training.

Publish actual Lens spans, separate Weave replay evaluations and a W&B comparison Table. Read back identities, outputs, scores, aggregation and accounting. Store only licensed normalized music, authored requests and bounded outputs in the existing private research project. Never publish private scores, device identities or learner histories. No Registry artifact is warranted for a prompt comparison.

References: [GuitarSet](https://guitarset.weebly.com/), [dataset release](https://zenodo.org/records/3371780), [agent evaluation methods](https://www.anthropic.com/research/demystifying-evals-for-ai-agents), [Forge pricing](https://coreweave.com/forge-pricing/inference-agents).
