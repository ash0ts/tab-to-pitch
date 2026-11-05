# Experiment review and next decision

Reviewed 2026-10-29 against the current application, frozen recovery campaign, recall report, and canonical article revision `fa9f1de8f7c75da17cebcc28779359ebaf1edb06677548c6b23c1f91a4601571`. This is a proposed research direction; no new model calls or learner study ran.

## Decision

Keep the deterministic scheduler as the product default. The current experiments do not justify paying a model to rank the next drill. Retain the Forge work as a reproducible execution and evaluation demonstration. A useful agent must solve a task the current rules do not already specify completely.

The product worth testing is the song-to-understanding sequence: inspect a shape, explain its pitches, answer without the labels, and find the same idea elsewhere. The present article spends more space on infrastructure receipts than on that experience. More dashboard counts cannot fix that mismatch.

## What the evidence establishes

| Experiment            | Useful result                                                                                                                     | Missing product evidence                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GuitarSet conversion  | Recorded string/pitch/timing annotations exercise the adapter; generated answers agree with normalized pitch and fret arithmetic. | No independent fingering labels, full audio-transcription assessment, or learner outcomes. The contour check shares the recording's annotation pipeline.                    |
| Hosted coach          | Production tool protocol succeeds on 16/20 test attempts; fallback keeps all final proposals valid.                               | No improved exercise choice, personalized remediation, musical reasoning, or learning benefit.                                                                              |
| Public Anki predictor | A reproducible chronological prediction gain; the reserved-collection point estimate loses to card history.                       | Guitar-domain validity, competitive spacing-model performance, or an effect of changing instruction. Logged reviews were collected under existing study/scheduling choices. |
| Forge readback        | Requests, traces, evaluation rows, and aggregate metrics can be reconciled.                                                       | Persistence and auditability do not establish a useful recommendation.                                                                                                      |

The controls, chronological separation, failure retention, and independent reconciliation are sound engineering practices. The problem is relevance to the product decision, not the presence of a negative result.

## Why the present LLM test cannot establish added value

[App.tsx](../src/App.tsx) calls `selectNextExercise` separately for each exercise family and offers at most one candidate per family. The scheduler already chooses the item, review/transfer mode, and hint support. The agent selects a family candidate. [modelContext](../server/forge-agent.ts) removes pitches, note identities, timestamps, and free text, retaining numerical phrase features and aggregated family outcomes. [proposalForCandidate](../src/shared/coach.ts) supplies the explanation and settings; the model does not write them.

The frozen benchmark differs from that app construction: 16 cases contain six generated candidates and four contain four, with repeated families. All 20 have empty evidence, offer only note-name/location tasks, and put a note-name task first. The prompt explicitly resolves ties by list order. Both baseline and all final hosted outputs chose candidate zero; the 16 successful model choices therefore added no observed decision benefit. Four fallbacks are additional protocol failures, even though the application remained correct. Twenty recordings reduce to 16 model-visible contexts and one held-out performer/progression family.

The current ranking also has no recency or resolution rule. `buildPracticeEvidence` aggregates recorded family outcomes, and `localCoach` gives any positive historical error count priority over an unseen family. Later correct answers reduce the error fraction but never remove that priority tier. A resolved old mistake can therefore dominate an untried family. This is a concrete policy behavior to test, not evidence that the ordering improves or harms learning.

Five contract checks largely verify bounded selection and application-generated output; the sixth checks agreement with the local tie-breaker. Those checks belong in regression coverage. They are not an independent recommendation-quality rubric. The larger model never qualified, so there is no test-set model comparison. More repetitions could estimate protocol reliability, but cannot establish teaching utility on this task.

## Dataset context

The [dataset explainer](presentation/dataset-explainer.md) follows actual records into the application. GuitarSet supplies examples of people playing, not people learning. One real annotation maps a measured pitch near MIDI 62.09 on the B string to D4 at inferred fret 3. The engine can ask for another D4 and accept the G string at fret 7. That is a concrete conversion test. It says nothing about whether the performer or a learner knows the note's name.

FSRS supplies flashcard self-ratings. A positive label means the reviewer reported remembering. It has no connection to those GuitarSet performers, songs, or exercises. Combining the datasets does not create a song-to-retention dataset. Keep the Anki work as method development; even a stronger Anki result would not qualify a guitar scheduler. A future method comparison should include an appropriate established spacing predictor, fitted under the same information and split restrictions.

## Next experiment before a learner pilot

**Primary decision: does optional language-based practice setup merit a prototype alongside the existing controls?** Example authored request: “Find this exact pitch on another string below fret eight.” The engine computes valid pitches and positions; a model would translate the request into constrained tool arguments. This is a proposed feature, not a capability demonstrated by the current agent.

First run an unpaid information-sufficiency audit using current code. Construct explicitly synthetic histories that preserve aggregate counts while changing error recency, target notes, review due dates, or transfer exposure. Identify which required decisions the engine already resolves and which cannot be distinguished after projection. Identical projected inputs cannot support different justified model choices. This audit should remove unnecessary model responsibilities before changing the prompt.

For a later, separately frozen intent experiment:

- Have guitar instructors define acceptable plans for authored requests against original passages and supported dataset notes before seeing model outputs. Include ambiguous requests whose acceptable result is clarification. Keep source references and every valid answer; do not judge the model's prose with another model.
- Compare a rule parser and one pinned model on identical free-text requests. Include the structured goal picker plus engine as a capability ceiling. It is not a fair same-input language baseline and must be reported separately.
- Hold out request templates and passages. Group paraphrases under their underlying goal; report both group and request counts. Freeze rubric, cases, settings, and exclusions before execution. Preserve invalid responses and abstentions.
- Primary metric: fraction of all requests producing a plan that satisfies every stated constraint and references eligible material. Secondary metrics: unsupported references, appropriate clarification, completion latency, provider failures, and known/unknown token usage. Report paired wins and losses against the strongest parser, not only average pass rate.
- Proposed gate: no critical pitch/reference violations; at least a proposed 10 percentage-point increase in exact-plan success over the strongest same-input parser, with a paired 95% group-bootstrap interval excluding zero; and a product-approved latency/cost budget fixed before running. A tie, unresolved ambiguity in the rubric, or a cheaper parser meeting the requirement means keep the simpler implementation. The 10-point threshold is a proposed product tradeoff to freeze before execution, not an observed result or educational constant. These are prototype gates, not evidence of improved learning.

Now: build the audit and authored fixture, validate plans with the engine, and record the existing app sequence. Instructor review needs people; hosted execution needs a separately bounded run. A learner pilot is required to measure setup effort, task completion, and delayed/transfer answers. Compare the same musical content, response format, and practice opportunity; retain reveals, abandonment, and prior familiarity. Decide the effect worth detecting and analysis unit before choosing sample size.

## What to demonstrate

Record the actual app using its original study: select G/B, inspect B2's role, hide the answer, then find B2 at another exact-pitch position. Label any deliberately entered wrong answer as a demonstration. Keep real-time app actions and separately presented dataset examples distinct. The compelling question is whether the player understands a familiar shape better afterward; an app recording shows the interaction, while a learner study must answer that question.

Evidence: [current results](results.md), [campaign and independent audit](../../tabtopitch-real-data/coach-recovery/independent-audit.json), [frozen contexts](../../tabtopitch-real-data/guitarset/campaign-test-cases.json), [music adapter limits](music-data/README.md), [recall protocol](recall-benchmark/README.md). Frozen experiments and the article were not edited for this review.
