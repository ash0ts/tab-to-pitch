# Curriculum and evidence

The source-note engine generates four exercise families from eligible source notes: name the note, find it elsewhere on the neck, name a spelling-supported simple interval, and identify a validated triad role. `src/engine/exercises.ts` owns eligibility and answer sets; `assessment.ts` owns grading.

Note names and chord tones are the default presentation. Showing octave numbers is a separate display preference; it does not change grading or exercise identity. Note naming accepts enharmonic equivalents and, by default, answers in any octave. The advanced naming option requires the exact concert pitch.

A location question accepts every valid alternative string/fret in its configured range, including another octave on the same string, and rejects the source coordinate. The advanced exact-pitch option restricts answers to the same sounding octave. Location questions have a small choice set plus typed input; the full valid answer set remains available to the grader. Switching between these contracts changes the exercise ID so their item histories remain separate.

Interval quality and number depend on validated written spelling. Interval prompts and notation retain octave numbers even when the general display preference hides them: C4 to G3 and C4 to G4 ask different distances. Triad-role questions exclude ambiguous or unsupported harmony. They grade root, third, or fifth independently of register.

## Explore before recall

Understand mode connects the selected source note to ordinary fretted locations in a chosen neck area. Matching by note name is the default; exact pitch is optional. Tapping a marked location auditions its actual register. Notes with unsupported articulations do not receive a speculative physical mapping.

For a validated major or minor triad, chord exploration shows derived three-string voicings containing one root, one third, and one fifth. The player can change neck area, string group, and inversion, then compare the source chord with the selected shape. These are chord-tone arrangements, not complete refingerings of the imported passage or verified CAGED shapes. The inspector's major/minor listening example transforms every duplicated third without altering the source score.

Starting practice from the inspector begins a guided question about the selected note or chord tone. An answered guided question can lead to a hidden recall attempt. Exploring or auditioning a shape does not itself create a correct answer or a guitar-performance result.

## Harmony and variation practice

The progression studio starts from confirmed chord spans. Its original four-bar lesson is Dm7–G7–Cmaj7–Am7 in C major, with both guitar and bass. Moving a voicing keeps its chord identity; adding a color can change its quality; a same-function substitution changes the chord and must be judged in the phrase. These operations are presented separately so a neck-position change does not teach a false change of key or mode.

`src/engine/harmony-exercises.ts` adds chord-tone questions for the supported extended degrees, next-chord target questions, and single-added-tone comparisons. Chord-role answers come from the confirmed symbol and a matching eligible source note. Next-target questions ask for the next chord's third in the chosen region and accept every matching physical location in any octave. Their wording states the region and octave contract. The explorer may display both thirds and sevenths as targets, but the current graded next-target question asks for the third.

An added-tone question exists only when the chosen variation adds exactly one pitch class and removes none. Its listening example compares the two defined chords. This does not grade arbitrary substitutions, multiple added tones, or whether a player prefers the changed sound. Progression exercises use the same assistance, attempt, and grading machinery as source-note questions. Only explicit answer attempts create evidence.

The tonic, scale/mode collection, chord tones, and next targets appear together as separate overlays. Auditioning a mode uses its tonic as a drone. Opening the original lesson through the fifths controls transposes guitar and bass together. A position move retains the tonal context. A player's chosen mode supplies a listening context, not proof of a song's mode.

Harmony questions in the last quarter of scores with at least four measures are marked held back. Their transfer keys include the confirmed chord and stimulus. This remains an in-app partition: the progression, diagrams, previews, and source score may already have shown the answer. A new shape, a successful preview, or a saved variation does not establish transfer or retention.

## Guided practice and review

A new skill begins with a guided question. A correct guided answer is followed by hidden recall. Wrong answers and reveals restore guidance. Hints change between attempts, not while a phrase is playing. Three clean correct answers across at least two distinct stimulus variants enable a held-out transfer check. A stimulus variant is its complete set of source pitch/string/fret coordinates: repeating one interval or chord cannot satisfy this gate by counting its constituent notes separately. Different source variants can still have overlapping valid answers, especially when a note-location question accepts any octave. Successful items become due after one, three, and seven days. These are versioned product defaults, not established learning constants.

Exercise IDs include the grading-contract version and relevant difficulty options. Updating that contract retains historical attempts but starts item-specific progress for the new version. Self-reported playing does not consume a held-out question or establish exposure to its coordinates.

If every note in a repeating riff would be reserved, the engine reserves none: that score supports recall without a transfer claim.

The scheduled practice partition excludes questions whose source coordinates were reserved for held-out checks. Explicitly choosing one of those notes in the inspector may still start a guided question; its recorded exposure prevents a later fresh held-out check on the same coordinates. The scheduler checks answer-attempt history across exercise versions.

This partition does not establish that a learner has never seen a location. The score, fretboard explorer, chord diagrams, and valid alternatives to earlier location questions can all expose reserved coordinates. Browsing exposure is not recorded as an attempt, and a correct answer may reuse a familiar location. The UI therefore reports held-back question checks. Internal `transfer` fields describe this in-app practice partition, not measured transfer to unseen guitar positions. A learner study needs separate passages, controlled exposure, and a response task that actually requires a new position.

## Attempt records

An attempt records its first response, timestamps, hint state, source references, exercise version identity, practice/held-out partition, and evidence source. A reveal and a guided correct answer cannot count as unassisted success. Leaving a question records interruption; looking away and playing records self-report. Self-report never changes knowledge accuracy.

Response time measures wall-clock time while a question is active, including reading and interaction. It is not a playing-latency estimate. Hidden tabs pause the player and interrupt active questions.

"Unassisted" means no answer-revealing hint or reveal. Some exercises still offer answer choices; pitch naming can also accept typed answers. These are different response demands, so the current accuracy metric is on-screen identification, not a uniform free-recall assessment. A learner study must fix the response format and assess actual playing separately.

Report unassisted accuracy with its denominator, guided answers, reveals, interruptions, delayed reviews, and held-out checks. Inspect delayed and transfer results separately. A high completion accuracy with many abandoned questions is not evidence of broad retention.

## Conversational lessons

The teacher can choose explanations, demonstrations, and questions across notes/roles, chord connections, and extensions with bass context. Its objectives are reference material rather than mandatory phases. The [teacher contract](teacher-agent-plan.md) records implementation boundaries and attributable teaching principles.

Teacher-generated questions freeze their own stimulus and answer contract. They do not borrow source-note identities. Exact voice-leading questions grade both endpoints and the signed semitone movement; destination-only questions retain their broader answer set. Teacher conversation and demonstration exposures are stored separately from attempts. Their conservative context-level exposure guard does not retroactively qualify the earlier held-back question partition or establish that a learner has never seen a position.

## Learner pilot

Recruit intermediate tab readers and obtain consent for any collected data. Begin with observed task completion: importing a score, confirming a progression, moving it to another neck region, identifying a third or seventh, distinguishing revoicing from a color change, finding a next-chord target, distinguishing note-name matching from exact pitch, and understanding a reveal. Record confusion and answer leakage before comparing outcomes.

For a subsequent matched-passage comparison, counterbalance conventional-tab and TabToPitch conditions, keep time on task and question difficulty comparable, and reserve unseen positions/passages. Collect immediate, delayed, and transfer outcomes separately. Predeclare exclusions and report reveals and abandonment. Sample size and follow-up duration require a pilot estimate; this repository does not invent a powered study size or claim a retention improvement.

## Listening progressions

[The listening activity](listening.md) separates roots, qualities, and sequence errors, then returns the selected harmony to fretboard practice. Replays, assistance, familiarity, and screen answers are recorded separately. The teacher can choose the sequence; the catalog and deterministic engine own the grading facts.

## Goals, feedback and broader musicianship

The [practice-workspace contract](practice-workspace.md) defines persisted goals and accepted strategies, first-response episodes, graduated help, original rhythm/construction/expression activities, distinct evidence formats, and conservative exposure tracking. These activities add creating and responding; they do not provide microphone-based performance assessment.
