# Music-teaching agent

The teacher operates the selected musical workspace through validated tools. A learner can ask a question, change direction, request a demonstration, or ask for another explanation. The cloud model chooses its teaching approach; lesson definitions supply objectives and references without a required sequence.

The first three areas are notes and chord roles, connections between chords, and extensions with bass context. The original Dm7–G7–Cmaj7–Am7 study supplies confirmed harmony and a separate bass track. Imported passages need confirmed symbols before they can generate graded harmony questions.

## Implementation

| Concern                                                    | Owner                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Versioned request, action, claim, and response schemas     | `src/shared/teacher.ts`                                         |
| Musical tools, derived questions, validation, local policy | `src/engine/teacher.ts`                                         |
| Attributed teaching references and objectives              | `src/engine/teacher-references.ts`                              |
| Conversation and shared progression controls               | `src/ui/TeacherPanel.tsx`, `src/hooks/useProgressionSession.ts` |
| Lesson checkpoints, events, and frozen questions           | `src/lesson-storage.ts`, `src/storage.ts`                       |
| Bounded actor, factual reviewer, and accounting            | `server/teacher.ts`, `server/teacher-provider.ts`               |
| Frozen experimental cases and readback                     | `research/teacher-agent/`                                       |

`POST /api/teacher/next` is separate from the existing coach and arrangement contracts. Each learner message permits four actor calls, eight deterministic tools, and one factual-review call within a shared 60-second deadline. The model can explain a concept even when a generation tool cannot produce the requested example. Invalid tool arguments return a repairable result and consume the tool allowance.

Tools inspect confirmed harmony, read bounded learner evidence, retrieve teaching references, generate voicings, prepare demonstrations, create questions, find review candidates, and optionally use the existing recorded-choice ranker. Their schemas distinguish a chord quality such as `m9` from a complete symbol such as `Dm9`. Rootless arrangement requires explicit compatible bass context. The optional ranker retains its existing standard-tuning, no-capo research domain; it does not assess comfort or teaching value.

The manual progression studio and teacher preview share one controller, worker, selection, constraints, and variation state. A validated preview is regenerated against the local score and matched by its musical shape. The learner still chooses **Apply & save**. The source file remains unchanged and playback uses the existing player lifecycle.

## Answers and evidence

Derived questions have frozen `derived:` stimulus identities and empty source-note references. Their definitions contain deterministic answer sets locally; the cloud receives the eligible question action and prompt, never its grading key. A new `voice-connection` answer contains both fretboard endpoints. For G7 to Cmaj7, standard-tuning string 2/fret 6 to string 2/fret 5 is F4 to E4, one descending semitone. An E in another octave is a valid destination-class answer but fails that exact connection.

Note identity, chord role, location, destination, and connection remain separate skills. Added-tone questions require exactly one added pitch class and no removed tones. Rootless explanations distinguish the upper guitar shape from the established ensemble bass. Audition can remove the root from a generated shape and compare it with and without that bass.

Conversation is separate from answer submission. Practice uses its existing grading controls. An active question hides conversation, diagrams, and explanations; asking for help records assistance before restoring them. Reveals and self-reported playing cannot become unassisted success.

IndexedDB version 3 introduced lesson checkpoints, immutable lesson events, and frozen exercise definitions. Version 4 adds source-aware listening definitions and attempts; the current backup reader accepts earlier versions. See [the listening contract](listening.md). A storage failure retains exportable memory state. Lesson revisions describe conversation and pending work, not mastery. Unknown curriculum versions cannot silently resume under a new contract.

Displayed teacher prose and demonstrations record physical-position and chord-role exposure, even if the actor omits its factual references. Changing the fret boundary or voice count does not reset those identities. A question can explicitly reserve another region; all accepted positions must be unexposed. A role already explained remains exposed in another position. Reserved-question replies withhold the actor’s prose and diagrams until the attempt, so the proposal cannot reveal its own answer. Legacy records have unknown browsing exposure and cannot establish a reserved assessment. These are application exposure rules, not proof that a person has never encountered the notes. Delayed recall and transfer claims still require controlled learner studies.

Source-score exposure is conservative: loading a displayed track records all its note positions, including those outside the current viewport. Teacher events record displayed explanations and invoked demonstrations. This prevents an already available source position from being described as reserved, but does not measure exactly what the learner looked at or heard.

## Factual review and failures

The engine checks action eligibility, pitches, coordinates, chord roles, evidence references, versions, and context freshness. A separate model reviews the actual prose, including claims omitted from the actor's structured list. It sees the learner question, context, tool results, and verified facts. It checks unsupported observations and musical assertions without prescribing a teaching sequence.

A failed or unavailable review withholds the actor's prose. Verified tool results can remain available alongside the authored local guide. Original model failure and successful fallback are recorded separately. A passing model reviewer remains fallible; its independent calibration belongs in the experimental results.

The service reserves actor and critic usage together. Existing invitation allowances do not grow automatically. Production cloud teaching is disabled by default and requires explicit learner consent for the question, bounded conversation, normalized music, and recent answer evidence. Production traces use an allowlist; authored research traces have their own richer policy. See the [backend contract](../server/README.md) for revocation, quotas, cancellation, and stable conversation grouping.

## Teaching rationale

The versioned reference cards connect each suggestion to a source and its limits. Gordon's sound/context/symbol approach motivates listening and prediction; it is a teaching tradition rather than a trial of this interface. Music-practice observations motivate goals and error correction. Retrieval and spacing research motivate answer-before-reveal and delayed checks, without validating the app's one/three/seven-day schedule for guitar. Mixed music-practice findings support offering focused and varied work selectively. The agent may interpret this material and change approach.

The references are retrievable tools, not hidden claims that an LLM knows how this learner learns. The app has no microphone or camera assessment and no trained teaching policy. Its existing voicing model predicts agreement with recorded GuitarSet choices.

## Qualification and remaining checks

The [teacher experiment](../research/teacher-agent/README.md) owns development/evaluation splits, actors, judge calibration, budget accounting, failures, and service readback. Earlier experiments remain unchanged. An authored baseline and scripted learners test behavior, not educational effectiveness.

Cloud release requires the declared correctness, conversation, episode, and reviewer gates. Experimental invited access may remain enabled with an explicit unqualified status; promotion requires the gates. Automated browser audio-startup checks do not replace audible Safari/iOS and Chromium/Android qualification. Human teacher review and a consented learner study are deferred. That later study should measure delayed unassisted recall, new-position transfer, and actual playing separately.
