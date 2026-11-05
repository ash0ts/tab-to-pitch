# Prospective recall pilot

Status: proposed research protocol. No learners have been enrolled by this scaffold, and no learning effect has been measured.

## Decision

Decide whether a recall predictor should influence exercise selection. Predicting the next recorded answer is a qualification step. The adoption decision requires evidence that the resulting schedule improves later unaided recall without increasing burden or invalid questions.

## Shadow qualification

Freeze the application revision, feature version, source/dataset hashes, eligibility rules, chronological cutoff, held-out learners, model configuration and metric code before execution. Preserve each run directory. Corrections create new runs with a documented reason; they do not replace prior results.

Use the existing deterministic schedule for every learner. Compute model predictions in shadow only. Compare regularized logistic regression with the training-only skill-rate baseline. Report both temporal and learner-held-out Brier score, log loss, calibration bins, answer counts and learner counts. Treat repeat answers from a learner as correlated observations. Examine error and missingness by drill family and review mode before interpreting pooled results.

No threshold in this scaffold declares qualification. Set tolerable calibration error and the minimum useful prediction improvement in a study specification before collecting data. Estimate their uncertainty at the learner level. Single-class or empty splits are failed qualification, not zero loss. Synthetic fixtures only verify execution and are excluded from this decision.

## Learning experiment

After shadow qualification, obtain separate consent for a prospective schedule comparison. Randomize at the learner level between the deterministic schedule and a model-assisted schedule, stratifying by a preregistered baseline recall assessment. Keep supported content, interface, hint access and session budgets matched. The model may rank already validated exercise candidates; it cannot create musical facts, bypass eligibility checks or assign grades.

Choose the observation period and assessment schedule before enrollment. The existing one-, three- and seven-day review intervals are product defaults, not evidence that those intervals are optimal. The primary endpoint is unaided correctness on a frozen set of held-out pitch/string/fret combinations at the prespecified delayed assessment. Keep those combinations out of practice in both arms. Record exposure leakage as a protocol violation.

Report the learner-level difference between arms, its uncertainty and the number of assessed learners. Specify the minimum educationally useful difference with a guitar teacher and learners before calculating sample requirements. Use measured participant variability and expected retention to plan recruitment; do not adopt a universal number of attempts or users from this repository.

Secondary measures include retention of previously practiced concepts, hint use, voluntary session completion and perceived burden. Fix the answer format before the study: choosing from visible answers measures recognition as well as recall and must not be pooled indiscriminately with free responses. Keep performance on the guitar self-reported unless a separately validated assessment captures it. The app's timed answers measure on-screen identification, not playing accuracy.

## Missingness and exclusions

Use the same supported-technique and first-answer rules in both arms. Revealed, assisted, interrupted and self-reported attempts remain distinct from unassisted correct/incorrect answers. Report their counts by arm. Missing delayed assessments remain missing; do not silently count them as incorrect or omit their denominator. Report completion rates and preregister a sensitivity analysis for plausible missing outcomes.

Freeze the analysis population and randomization unit before enrollment. Report all assigned learners and the assessed subset. Do not tune the model, rewrite the curriculum or change the grading rules in response to the evaluation cohort. A new revision requires a new study phase.

## Evidence and promotion

Retain a trace from each aggregate to consented export, immutable attempt, frozen feature vector, prediction, deterministic grade and split membership. Keep identifiers and raw exports in approved private storage; publication includes only approved aggregates and model artifacts. A learner's withdrawal blocks future use and initiates the study's documented data/model retention review.

Stop a run for consent failure, corrupted timestamps, overlap leakage, unsupported content, inconsistent grading or missing provenance. Report the failure separately from model quality. An apparent predictive gain does not establish causality or a learning benefit.

Promotion requires human review of the frozen study report, domain correctness, subgroup limitations, privacy approval and a reversible rollout plan. The rollout must preserve the deterministic fallback, record which policy chose each exercise, monitor missingness and hint use, and allow rollback without losing learner history. This scaffold deliberately implements none of those promotion actions.
