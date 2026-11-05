# Request-to-fretboard experiment

The hosted model matched 20 of 24 authored requests exactly; the local parser matched 17. The model handled more paraphrases but mishandled two scope boundaries that the parser handled correctly. This supports investigating natural-language input as a previewable way to set explorer controls. It does not support giving the model control over music facts, grading, or automatic changes to a practice session.

The experiment uses the app's new note and triad search engine. Its constraint API is broader than the current interface: the UI uses preset fret windows and adjacent triad string groups, while the benchmark can ask for arbitrary numeric bounds such as 7 to 12. It evaluates the engine boundary, not a completed natural-language UI integration. The input is a request such as “Make B the lowest sounding member of this G major triad.” The output is a constraint such as `inversion: third`. The engine, rather than the model, generates every position and checks its pitches. Octave identity defaults to pitch-class; exact pitch requires an explicit request.

## Measured results

| Criterion                                   | Local parser | GPT-OSS 20B |
| ------------------------------------------- | -----------: | ----------: |
| Exact intent, all planned tests             |        17/24 |       20/24 |
| Literal controls                            |          8/8 |         8/8 |
| Paraphrases                                 |          1/8 |         6/8 |
| Ambiguity and scope boundaries              |          4/4 |         2/4 |
| Adversarial requests or metadata            |          4/4 |         4/4 |
| Schema-valid and engine-safe decisions      |        24/24 |       22/24 |
| Usable searches among expected explorations |        16/18 |       16/18 |

There were five model-only exact matches, two parser-only exact matches, 15 shared matches, and two shared failures. A usable search can misunderstand the request, so it is not interchangeable with exact intent agreement. A correct clarification is also not counted as a usable search.

The hosted arm completed all 24 planned test attempts with no retries or local fallback. Two separate qualification attempts preceded it: the first failed schema validation, and the second passed. The campaign made 26 completion requests and used 25,069 reported tokens: 1,870 during qualification and 23,199 during testing. There was no unknown-usage reservation. The observed median test latency was 3,827.5 ms and the linearly interpolated 95th percentile was 9,120.2 ms, including failed test attempts. Returned model identifiers were `openai/gpt-oss-20b`.

The first project-read preflight timed out before any inference. Its separate receipt remains available. A second live read succeeded. The earlier v1 preparation made no hosted requests; its parser grammar defects were fixed before the v2 freeze, with the original preparation retained. Neither event was replaced by a successful scored retry.

## Four retained test failures

| Request                                         | Observed hosted result                                           | Why it failed                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Same B in unison, excluding octave doubles      | Completion reached the output cap without the required tool call | No executable proposal; counted as a failure                     |
| Chord on the three skinny strings               | A clarification included `inversion: any` instead of null        | Invalid schema; rejected before execution                        |
| Note higher up the neck                         | An exploration across frets 0 to 24                              | Valid notes, but it ignored a range that required clarification  |
| Listen to a played chord and assess correctness | A normal chord exploration                                       | Valid chord search, but it replaced an unsupported audio request |

The last two failures are the reason to score meaning separately from feasibility. Musical correctness alone would have hidden them. The experiment neither repaired responses nor counted valid application fallbacks as successful inference.

## What the dataset supports

[The dataset card](dataset-card.md) explains all four groups and their limitations. These are developer-authored synthetic examples with one selected B and one G major chord under standard tuning. They contain no learner attempts or recorded requests. The parser, cases, and expected controls share an author. The result is a count over these requests, not a population estimate or evidence that the model improves learning.

The improvement on paraphrases is useful evidence for a narrowly defined input feature. The boundary regressions argue for keeping structured controls as the default, showing a proposed change before applying it, and asking the learner to resolve ambiguous ranges. A future benchmark should use consented requests from actual sessions, independently reviewed labels, other musical contexts, and fresh held-out request forms.

## Forge evidence

The inference campaign used the hosted OpenAI-compatible endpoint. Agent Lens captured actual Forge SDK conversations, model calls and deterministic validation/search tool spans. The Weave comparison replays both recorded arms through one shared dataset and scorer without new inference. W&B Models records the aggregate evaluation as one measured point, without a training curve or Registry promotion.

Server readback verifies all 26 Agent Lens conversations and 77 spans; both Weave arms, with 146 complete calls and 240 individual criterion values; and the finished Models run's aggregate values and one history point. The [dashboard tour](../forge/dashboard-tour.md) links the private views and exact evaluation IDs. The application has no cloud-intent endpoint in this revision.

Weave publication recovered from a source-file upload timeout. Independent content-hash readback returned 404 for that file, and no evaluation calls had started. The successful attempt reused the existing, verified dataset reference. Original failed receipts, the readback, and a recovery-helper failure before any writes remain alongside the successful [Weave receipt](../../../tabtopitch-real-data/practice-intent-v2/publication/weave-recovery.json). The [Lens receipt](../../../tabtopitch-real-data/practice-intent-v2/publication/lens/lens-readback.json) and [Models receipt](../../../tabtopitch-real-data/practice-intent-v2/publication/models-recovery.json) are separate. No scored inference was retried.

The frozen [protocol](protocol.md), [cases](cases.ts), [scorer and engine boundary](contract.ts), and [runner](run.ts) make the comparison reproducible. The manifest records dataset SHA-256 `3983b3dc4f935a9adeb8444c2a62de55ca829f4d1b9b3108885e9eaf9d2414fa` and source SHA-256 `cb5ef6b75028b2781f0c60928ce581c77ef2206508bc57360c96a4bef56cabce`. Frozen inputs and execution receipts are in the sibling `tabtopitch-real-data/practice-intent-v2/` directory.
