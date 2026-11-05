# Fretboard homework

For guitarists who know open and barre chords, this activity connects note recall to chord tones and progressions. Open **Understand → Fretboard homework → Open C–F–G–C study**. Choose a suggested workload of 5, 15 or 30 minutes and a neck region. There is no countdown.

## Use the workspace

**Explore** shows a major parent map or a three-note fragment. The C–A–G–E–D strip selects a shape family. The heading names the actual sounding chord separately. For example, E-family coordinates shifted three frets in standard tuning produce G major. Some fragments belong to multiple families; those alternatives remain visible. A full movable C or G grip is not required.

**Recall** offers note locations, position names, root sets, template completion, any valid small voicing, neighboring-family fragments, seventh-to-third connections, and phrase destinations. All cells remain selectable. An exact-template task states its strings; an any-voicing task checks musical and physical constraints instead of membership in a candidate list. Octaves are optional for note identity and explicitly required for exact-pitch tasks. A voice-connection answer must satisfy both roles and the actual signed pitch movement.

Position-name questions sample the region independently of the current chord root. The planner uses past first responses and frozen definitions to rotate note/string locations and family maps. Due questions remain available after their original assignment is replaced. Attempt counts guide coverage; they are not mastery estimates.

Help is selectable: attention cue, root landmark, partial shape, separate worked example, or complete reveal. Support is recorded before it becomes visible. The first answer remains in the assignment and immutable lesson events. Revisions after feedback are assisted. There is no inference about a misconception from one error.

**Apply** uses the shared progression controller and existing audio transport. Compare C–F–G–C at frets 0–5 and 5–9. Change the current chord’s quality to inspect minor thirds, sevenths and extensions. The derived voicing lists actual degrees and omissions. Preview is reversible; **Apply & save variation** preserves the source and **Undo saved variation** restores the previous variation. An extension is not relabeled as a canonical CAGED parent.

The original study also contains G7 → Cmaj7 in bars 5–6. Select those bars with the shared passage controls for accompaniment comparison. The dedicated seventh-to-third task constructs its own F → E example and does not pretend those coordinates were imported notes. Playing on a guitar is recorded only when the learner chooses **I tried it on guitar**.

## Contracts and data flow

- `src/engine/caged.ts` owns five versioned parent definitions, open coordinates, muted strings, root anchors and supported fragments. String 1 remains the highest physical string. Placements transpose then validate each sounding pitch against the supplied tuning and capo. Conventional CAGED is available only when all six strings retain standard tuning’s interval structure. Note and chord exercises retain the actual alternate tuning.
- `src/engine/homework.ts` owns deterministic task generation and grading. Frozen task identities include the generator version, instrument, region, family, harmony and variant. Restored contracts must reproduce exactly from that recipe. They never invent source-note IDs.
- `src/shared/homework.ts` defines the assignment, support, response and bounded teacher contracts. `useHomeworkSession` writes checkpoints and immutable observations through the existing lesson controller. IndexedDB needs no new store: the optional assignment is additive to existing lesson records, and events carry homework observations plus frozen task definitions. Starting a new assignment does not erase an earlier grading contract. Old backups remain valid without fabricated homework evidence.
- `src/engine/exposure.ts` supplies the same physical-position identity used by existing teacher exercises. Explore displays and answer-revealing support record exposure. A different task ID cannot make those positions new. Legacy exposure remains unknown. A reserved coordinate set is not proof that the learner has never encountered the idea outside this app.
- `teacher-v4` adds optional homework context to `/api/teacher/next`; v1–v3 remain accepted. `homework_map` returns validated map facts, and `homework_activity` proposes eligible tasks or comparisons. The actor never supplies coordinates as a grading key. The actor/critic deadline, call limits, consent and quotas are unchanged. The teacher can start an assignment directly from Explore, using the same selected workload and region as the manual controls. Provider requests include tools for enabled capabilities so schemas remain within the existing byte allowance.

Question state changes advance the lesson revision. Source or harmonic-constraint changes pause old work, reject further answers and invalidate pending teacher actions. Reload preserves assignments and answers but resumes an interrupted question with support. Storage failures retain the existing in-memory fallback and export path. Cross-tab conflicts block new writes through the shared lesson controller.

## Teaching boundaries

Natural-note cues explain the E–F and B–C semitone gaps. Octave examples include the extra fret across G and B. Return to direct recall after using a landmark. A neck position is not a mode; tonic and mode remain explicit in the progression workspace.

The parent coordinates are application-authored fixtures, informed by [Fender’s CAGED introduction](https://www.fender.com/articles/scales/major-guitar-scales). That instructional source is not evidence that CAGED or this interface improves learning. Existing [curriculum](curriculum.md) research guides retrieval, optional support, practice variation and delayed review. The 1/3/7-day intervals remain versioned defaults.

Progress reports first-response denominators per task family and separately counts self-reported playing. It does not convert shape recognition into fretboard fluency, technique assessment or an overall mastery percentage. Fret indices follow the existing application convention and are relative to the capo; the configured region must suit the physical instrument.

## Verification and demonstration

Independent fixtures cover all twelve roots and five families, octave repetition, capo, transposed standard tuning, alternate tuning, ambiguous family membership, G–B octave relations, alternative voicings, minor thirds, sevenths, exact connections and mutated frozen contracts. Browser checks cover desktop/mobile recall, assistance order, saved first responses, resume and shared playback. The worker patch discards layout from replaced scores; its regression test rapidly alternates two original scores.

Run the original-song demonstration in an isolated browser: find C, inspect C and A family fragments, construct another valid C-major fragment, compare C–F–G–C in two regions, then select F → E for G7 → Cmaj7. Pause and change approach whenever needed. See [the separate evaluation protocol](../research/homework-caged/README.md) for agent evidence and unexecuted cloud checks.

## Recorded walkthrough

The isolated Playwright walkthrough is `tests/homework-demo.spec.ts`, configured by `tests/homework-demo.playwright.config.ts`. It uses only the original study, records actual UI interaction, checks the shared player starts, and captures screenshots plus a silent browser video. The test covers an incorrect note answer, a cue and correction, C/A family comparison, two accompaniment regions and the F→E position pair. The video does not validate perceptual audio quality.

The [verification record](homework-verification.md) separates completed local checks from unexecuted cloud and real-device checks.
