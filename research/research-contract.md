# Public-data experiment contract

Frozen before hosted inference on 2026-10-29. Dataset-specific protocol files add exact source revisions, sampling and split membership before fitting or evaluation.

## Decisions

1. Can the music adapter derive supported exercises from real recorded guitar annotations while retaining the limits of those annotations?
2. Does the existing bounded agent execute its tool protocol and return a valid proposal on those held-out passages? Does the larger hosted model change observed reliability?
3. Does a regularized logistic predictor beat fixed and history-based baselines for public Anki self-rated recall under temporal and held-out collection splits?

None of these experiments measures improved guitar playing or establishes that a recommendation teaches better. The Anki study cannot qualify a guitar recall predictor for deployment.

## Music and coaching units

GuitarSet recordings are source units. One first eligible passage per test recording is a coaching task. Notes, generated questions and the two model responses to one task are not independent recordings. Performer and progression-family splits are frozen in the music protocol. Published errata and unsupported notes are excluded with counts and reasons.

The 20 test recordings contain 16 distinct numeric model contexts, one held-out performer and one progression family. Report these finite cases without treating them as 20 independent learners or a population estimate.

The three arms are the existing deterministic policy, `openai/gpt-oss-20b`, and `openai/gpt-oss-120b`. Both hosted arms use the production prompt, tool schemas, two-step limit, 384-token completion cap and 20-second request deadline. There is no fabricated learner evidence. Models select among the same validated candidates; the application constructs explanations and settings.

The full campaign uses at most 20 held-out recordings and two hosted arms. Qualification uses at most two non-test recordings per model. The hard campaign allowance is 88 completion requests and 200,000 accounted tokens. Unknown usage consumes a conservative reservation. Fresh model discovery and trace initialization must qualify before a paid call. No failed task is silently retried or replaced. Qualification and test attempts remain separate. An outcome-unknown request is retained and never retried automatically.

## Measures

For each arm report eligible selection, preserved settings, grounded explanation and response schema as Boolean counts divided by all task attempts. Fallback can satisfy those application contracts. Separately report provider success, fallback reasons, trace coverage, model calls, reported token usage, unknown-usage reservations and wall latency. Local policy has no provider success or token cost; those fields are unavailable rather than zero failure.

Agreement with deterministic tie-breaking is policy conformance only. Any eligible candidate is valid when all candidates are untested. Do not grade first-candidate agreement as pedagogical correctness. Pair comparisons by recording and retain shared failures. Denominators include every started test attempt. Report missing and unstarted tasks separately; they never become successes.

Weave uses one frozen source-only dataset and the same scorer objects for every arm. Responses and provider execution receipts stay outside the dataset and are looked up by task ID. Replaying recorded results makes no new inference calls. Replay latency and token fields are not live-provider performance; original execution receipts and Agent Lens supply those measurements.

## Recall study

The recall protocol specifies the public source license, pinned revision, cohort/card selection, pre-response features, temporal cutoff, collection holdout, controls and fitting settings. Current rating, current response duration and future events are excluded from predictors. IDs are grouping keys, not features. Missingness and self-report semantics stay explicit. Report Brier score, log loss, calibration and group-level uncertainty with denominators for each split. A candidate losing to a baseline stays in the report.

## Publication and cleanup

Use `wandb/tab-to-pitch-public-data-research`, verified PRIVATE, independently of the earlier synthetic demo. Save input/source hashes, package versions, dataset references, model identifiers, trace IDs, evaluation call IDs and Models run/artifact identities. Read back every headline value. SDK completion alone is not persistence proof.

The research runner checkpoints actual Forge SDK spans as local OTLP protobuf batches before attempting publication. Local trace IDs prove instrumentation, not hosted Agent Lens ingestion. Upload the exact bytes and reconcile conversation/span identities through the server before counting hosted trace coverage. Campaign request receipts retain known provider usage and conservative unknown-usage reservations; a rejected response can omit usage from its Lens span.

Stop affected execution on fixture drift, exhausted allowance, unqualified model/trace access or unavailable write paths. Preserve failed and uncertain attempts. Do not force run state to finished when a stream failed. Do not publish a comparison with mismatched dataset/scorer identities. No source score, private history, raw review identifiers, credential or learned scheduler is uploaded or deployed.
