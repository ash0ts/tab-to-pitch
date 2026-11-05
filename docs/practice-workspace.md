# Practice workspace

TabToPitch now keeps a learner's musical goal beside the task. The learner can choose an approach, revise an answer, ask for a specific kind of help, and save a reflection. The teacher uses the same lesson record and player as the manual controls.

This release serves intermediate guitarists. Its new rhythm, construction and expression activities use original two-bar G7 → Cmaj7 studies. They are labeled as synthesized studies; they do not pretend to annotate or assess the currently imported song. The imported selection remains available when the activity closes.

## Entry points and task ownership

`PracticeWorkspace` offers listening, performance-intention and creation entry points. A starting check is optional. Strategy proposals require learner acceptance; rejecting a strategy and choosing exploration are supported states. No score assigns an overall ability level.

`ProgressionWorkspace` owns one `useLessonSession`, shared by the teacher, listening lesson and `usePracticeSession`. Desktop puts the teacher alongside the task. Mobile provides a persistent teacher trigger and a compact conversation sheet above transport. The complete conversation, provenance, research settings and advanced progression controls remain secondary.

The original-source score stays immutable. `PlayerController.previewPracticeStudy` builds a separate alphaTab score and plays it through the existing synthesizer. Melody studies include a separate accompaniment track. Rendering is serialized so a worker cannot apply old layout bounds to a new score. A masked score remains measurable for engraving but is invisible, inert, and excluded from the accessibility tree. The coordinator stops competing sources; playback events, not button clicks, record audio exposure.

## Evidence and help

The additive `practice` field in a lesson contains the goal, intent, chosen or proposed strategy, reflection, bookmark, review and current episode. The episode freezes its original study and answer contract. `practice-response` events retain every response. The first response is never overwritten; revisions after feedback are assisted responses in the same episode.

Help offers an attention cue, focused comparison, worked example, or full explanation. Selecting one commits a `practice-support` event synchronously before the UI exposes it. A worked example can be auditioned. An incorrect answer gives a discrepancy and possible next action; the answer remains masked until an explicit reveal. The legacy note/location practice and listening controls now preserve a first error and offer assisted retries rather than immediately revealing the solution. For the new studies, even a full explanation keeps unrelated conversation history hidden until the learner finishes or chooses **Stop question and talk**. Older note/location questions retain their explicit full-conversation reveal.

Evidence records skill, response format, assistance, familiarity, prior exposure, elapsed delay and context. The new studies distinguish hearing/recognition, hearing/symbolic recall, and construction. An expressive preference is stored as the learner's reflection, not scored for artistic merit. No microphone assessment is present. Playing remains unknown unless separately self-reported. Older evidence with an absent response format or unknown exposure remains unknown.

A study is conservatively marked exposed when opened; an audio exposure requires a player-start event. All local lesson events are checked before describing a study as reserved. Audible content keys also prevent the same melody from becoming “fresh” merely by appearing in another activity. The four variants per activity are a small authored pool, not evidence of transfer to unfamiliar songs. New task IDs alone never establish that a musical concept is unfamiliar.

Successful studies become due after the existing versioned 1/3/7-day defaults. Only a due, independent first response advances the interval. Same-session retries do not advance it. These intervals are product defaults, not an established optimum. Goals and bookmarks resume after reload; unfinished questions resume as interrupted, rather than as supposedly untouched checks.

## Deterministic musical boundaries

| Activity            | What is checked                                                                               | What is not checked                                                |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Rhythm              | Attacks and rests in sixteen eighth-note slots; chord change at bar 2                         | Clapping, guitar timing, or expressive microtiming                 |
| Phrase construction | Supplied pitches; at least three sounding notes; at least one rest; final sounding E in bar 2 | Originality, beauty, stylistic preference, or one preferred melody |
| Expression          | The authored articulation or dynamic difference between two versions                          | Which version a learner should prefer                              |

Different valid phrases are accepted. These examples use concert pitches in the engine; note names are prominent in the UI. Existing optional staff rendering retains the adapter's guitar octave contract. A dominant-seventh quality does not automatically imply dominant function; the teacher reference and local explanation include the blues-tonic exception.

## Teacher and storage compatibility

`teacher-v3` negotiates `teaching-practice-v1` on `/api/teacher/next`. Versions 1 and 2 remain accepted without this capability. The new context carries a bounded goal, strategy, optional reflection, review and recent evidence; it excludes the frozen grading contract. A validated study ID retrieves the authored activity instructions and harmony separately from imported-score facts, so the teacher cannot confuse the two sources. The `practice_activity` tool proposes a strategy, prepares an eligible original study, or opens reflection. Existing inspect, reference, arrangement, assessment and review tools remain available. Four actor calls, eight tools, one critic and the shared 60-second deadline are unchanged.

The actor prompt is `teacher-tools-v5-practice`; the critic is `teacher-review-v2-practice`. Experimental enablement and qualification stay separate. A prior qualification no longer silently qualifies these prompts: `TEACHER_QUALIFIED_PROMPT`, `TEACHER_QUALIFIED_CRITIC`, `TEACHER_QUALIFIED_MODEL` and `TEACHER_QUALIFIED_CRITIC_MODEL` must match the deployed versions before status can read qualified. Qualification still requires measured campaign results; setting environment variables is not a substitute for them.

Persistence extends existing IndexedDB version 4 records without a destructive migration or another database. Old backups remain readable. A missing new field stays absent. Current in-memory lesson writes survive a storage failure, and stale/cross-tab revisions reject changes. Source, context and lesson revisions invalidate pending proposals.

## Teaching rationale and limits

The strategy choices are informed by [Lubert and Gröpel's review](https://journals.sagepub.com/doi/full/10.1177/10298649241290448), whose studies end in 2022 and whose results are mixed. Meaningful choice follows a design hypothesis informed by [Bonneville-Roussy and Evans](https://doi.org/10.1177/03057356241296109); their cross-sectional associations do not establish a causal benefit from this UI.

Focused repetition remains available alongside comparison and variation. [Mathias and Goldman](https://doi.org/10.1177/00224294231222801) found a delayed blocked-practice advantage in their advanced-violin task; music education does not justify constant interleaving. [Lin and Zheng](https://link.springer.com/article/10.1007/s44163-026-02689-9) studied human-teacher-mediated AI feedback, with group and continued-support limitations. This implementation therefore connects a supported discrepancy to a practical response and subsequent check without claiming autonomous AI teaching effectiveness.

The creating/performing/responding coverage in [NAfME's standards](https://nafme.org/publications-resources/standards/) motivates adding construction and expressive reflection beside identification. It is a coverage framework, not an efficacy result.

The implementation's claim is a coherent, testable practice workflow. The [evaluation protocol](../research/teaching-practice/README.md) tests agent and application behavior. Human review and learner recruitment remain unexecuted. A later consented study should measure independent strategy use, delayed listening/recall, new-context transfer and actual playing separately.

## Parallel-work integration

Apply this work to the frozen listening baseline, then reconcile the listening and Ear Lab branches. Keep their source/provider contracts authoritative. Do not copy over new audio-worker code or historical campaigns. The main conflict areas are `App.tsx`, `ProgressionStudio.tsx`, `TeacherPanel.tsx`, lesson storage, teacher schemas and the shared player.

All campaign runners must adopt one absolute shared SQLite reservation ledger before this branch can make new paid calls. A copied ledger is not shared. The prepare command records concurrent nonparticipating campaigns and leaves cloud arms unexecuted. See the research README for the adoption receipt and limits.
