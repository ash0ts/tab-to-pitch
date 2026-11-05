# Teacher evaluation protocol

The decision is whether a bounded, free-form music-teaching agent merits an explicitly experimental opt-in beside the authored local teacher. The treatment can choose tools, ask questions, answer follow-ups, and change its teaching approach. Structural guards protect musical validity, source ownership, grades, privacy, and budgets; they do not prescribe an explanation template or lesson sequence.

## Cohorts and controls

The authored corpus has 36 development checkpoints, 96 fixed-history checkpoints over 24 musical contexts, 24 boundary cases, and 24 conditional episodes capped at six learner-triggered turns. Each hosted arm has two trials. Repeat trials describe consistency, not independent musical contexts. Development cases have separate identities and regions; the same musical concepts necessarily occur in both sets. These are finite engineering fixtures, not a representative sample of learners.

Compare the authored adaptive local teacher, qualified GPT-OSS 20B, and qualified GPT-OSS 120B. A separate 20B fixed-history arm withholds earlier attempt evidence to test its role. Keep current request text and musical context unchanged in that ablation. It is not a deployment candidate. Qualification and any development runs have their own rows and consume the same budget.

Every ordinary checkpoint declares a goal, actual history, and constraints. It does not declare an exact next action. Episode follow-ups depend on whether the teacher offers a question or variation. The script never claims to have heard or played audio. Its simulated help requests remain assistance; they are not correct knowledge labels. An episode that ends correctly demonstrates orchestration only.

Boundary cases cover injected instructions, unsupported audio judgments, mode/position confusion, invented bass context, impossible strings/voice constraints, source mutation, mastery from exposure, and indiscriminate substitution. Report them separately so correct refusals cannot inflate ordinary teaching success. Server and browser fault tests cover stale contexts, interruption, quota exhaustion, cancellation, storage, masking, and inaccessible services.

## Scoring

Deterministic criteria check response structure, valid engine operations, source immutability, honored constraints, task eligibility, references, and evidence handling. The production musical checker is supplemented by independently authored pitch and degree facts. Neither a schema pass nor matching references proves that arbitrary prose says something true.

A separate judge invocation receives the actual question, visible prior dialogue, selected music, facts, tool results, final response, and resulting state. It does not receive the actor identity, baseline preference, expected score, or another judge's result. It extracts exact claim excerpts and marks them supported, contradicted, or unverifiable, then reviews responsiveness, continuity, evidence use, clarity, next-action usefulness, leakage, and unsupported performance claims. An independent audit prompt looks for omitted claims and false premises. Same-family judges can share errors; separate prompts do not establish independence.

Judge calibration contains 120 authored atomic-claim cases: 60 development and 60 held-out, each balanced across supported, contradicted, and unverifiable claims. Musical and evidence examples are disjoint between those partitions. Twenty-four dialogue probes additionally test irrelevance, false premises, injection, invented observations, and leakage. Their labels establish known factual/application errors, not expert teaching preferences. The numerical judge gates in `protocol.json` are product defaults, not educational findings.

Before any judge call, version 2 added a 90% dialogue-probe accuracy gate and checks that claim excerpts occur in the actual response and evidence IDs exist in supplied facts. Each judge first receives two development smoke cases. If neither returns a valid judgment, calibration stops with the missing cohort retained; otherwise the remaining claims run with at most four independent calls in flight. A changed actor implementation cannot inherit eligibility merely because its provider is available. When an earlier completed qualification rejects both actors, a separate calibration-only campaign can evaluate the local baseline without making more actor calls.

The actor models and development block are frozen per manifest. Qualification 001 and 002 used block 0. The third actor policy uses block 1, twelve unused development cases, for 20B only. The 120B actor remains ineligible after its null-response failure; its independent judge interface can still be tested on calibration cases. Changing to a later block does not erase earlier failures or convert development results into a held-out product score.

Report actor, runtime critic, independent evaluation judge, infrastructure, and persistence failures separately. Keep unavailable judge results unavailable; do not substitute a pass, zero judgment, or local baseline response. A hosted fallback may preserve the app contract but remains a hosted failure.

Aggregate fixed-history outcomes and episodes separately, with their planned and observed denominators. Report each criterion, accepted-invalid count, ordinary acceptable rate, boundary handling, paired wins/losses, and context-grouped results. A complete episode requires appropriate conversation and tools, not merely six nonempty responses. Original execution latency and cost remain separate from Weave replay latency.

## Budgets, freeze, and retry policy

Before any completion, record exact input hashes, source/dependency/prompt/scorer revisions, model catalog, current pricing, source manifests, and the aggregate historical ledger. Reconcile canonical root campaign ledgers once, excluding nested suite exports and publication snapshots. Include the earlier seven-call synthetic demonstration, using conservative token pricing where its split usage is missing.

The campaign ceiling is the smaller of $15 and the unused portion of the previously authorized cumulative $25. Reserve serialized request bytes plus framing and the maximum completion allowance before transmission. Known valid usage replaces the reservation; unknown usage retains the full reserve. Include actor, runtime critic, independent judges, qualification, calibration, ablation, and failures. There are no automatic completion retries.

A started request is persisted before sending. Resumption refuses an unresolved request because it may already have executed. New campaigns preserve old attempts and require new identities; source drift cannot overwrite a frozen study. Ordinary scored failures continue. Privacy drift, source drift, budget exhaustion, or unknown publication writes stop affected execution.

At most four independent evaluation attempts run concurrently; each episode's turns remain sequential. A failed scheduler drains already-started work before stopping. The inherited inference connection caps an individual HTTP call at 30 seconds inside the 60-second overall agent turn deadline. Qualification remains sequential to stop after repeated unavailable responses.

## Forge evidence

Capture actual Forge SDK Agent Lens spans for lessons, turns, model calls, tools, validators, critic reviews, and failures. Correlate separate HTTP turns through the SDK's explicit conversation ID. Publish captured spans and read back their exact identities and turn relationships.

Publish Weave datasets and recorded-output evaluations for ordinary checkpoints, episodes, boundaries, and judge calibration separately. Replay makes no additional inference calls. Read back row membership, output hashes, criterion values, aggregates, and call trees. A flush or ingestion acknowledgment alone is not a verified result. Human review is deferred and must not be implied by an automated score.

The release gate only permits an experimental feature. Learning claims require a later consented learner study with delayed unassisted recall, genuinely unexposed transfer questions, and playing assessed separately from screen answers.
