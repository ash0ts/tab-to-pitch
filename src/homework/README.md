# Guitar-first homework

The homework assignment owns the plan and resume checkpoint. `planner.ts` creates derived playing steps from the confirmed passage, tuning and region. The progression owner supplies chord timing; the existing alphaTab variation builder retains backing tracks and source timing for progression play-along. Isolated examples are separately labeled 4/4 studies with count-in and response/rest measures.

`presentation.ts` supplies concise instructions and a navigable view of the existing objectives. It does not change task identities, expected answers, or the planner. The four groups can be selected in any order; the final step exposes Finish session, and Wrap up session is always available. Both use the shared Studio bookmark and recap.

`usePlayingHomework` coordinates the existing homework, lesson and live-input owners. It records self-reports and support in immutable lesson events. Detected outcomes remain in `PerformanceAttempt`; homework events reference their IDs. Switching response method interrupts an active attempt and retains its episode and first response. Reload never reopens capture. Save status distinguishes pending persistence from a resumable checkpoint.

The default response method is self-report. A detected pitch does not verify a coordinate, family, technique or timing. A location answer set is never converted into a mandatory arpeggio. A selected fragment accepts its notes in any order unless the instruction specifies movement; the authored F→E connection requires one descending semitone in any register.

Note-finding play-along uses an unpitched percussion pulse through the same alphaTab player. Response bars contain quarter-note clicks and the configured rest bars remain silent; the backing does not reveal the requested pitch. The G7→Cmaj7 accompaniment uses validated four-note realizations with the root in the bass for the selected tuning and capo.

Teacher-v5 negotiates `homework-playing-v1`. Tools select an eligible step, isolate a change or prepare a retry. Device activation, saving arrangements and paid turns remain explicit learner actions. During a label-free attempt, unrelated teacher history remains hidden until help is recorded.

The suggested workload reserves roughly four-fifths for playing or listening-and-playing. This is an editable product default, not an enforced timer or a measured teaching result. Coordinate checks remain a separate optional surface. See [the frozen behavior checks](../../research/guitar-homework/README.md) and [integration verification](../../integration/verification.md).

## Playable explanations

`stimulus.ts` projects the frozen homework step into the teacher's harmonic context. A G7→Cmaj7 connection therefore reaches the teacher as that progression, even when the imported score contains C–F–G–C. Derived examples do not inherit imported note IDs or bass claims. Candidate F→E pairs preserve signed pitch movement and the selected tuning/capo. Both endpoints are shown.

In exploration, every displayed fretboard cell can be selected and auditioned through the existing player. The inspector distinguishes the note name from its chord role. Support is recorded before audition; label-free or active attempts hide the inspector and disable revealing audition. A difficult self-reported pass offers an example, note isolation, or another playing attempt. It does not turn the report into a graded error.

The desktop teacher shares the screen with the task; narrower displays keep the existing sheet. The request version acknowledges the learner's own message save once, so saving that message cannot cancel its pending cloud response. Changes to the actual source, task, or constraints still invalidate it. [The walkthrough and retained failures](../../public/research/notebook/connected-homework.md) document the integration check.
