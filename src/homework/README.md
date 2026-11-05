# Guitar-first homework

The homework assignment owns the plan and resume checkpoint. `planner.ts` creates derived playing steps from the confirmed passage, tuning and region. The progression owner supplies chord timing; the existing alphaTab variation builder retains backing tracks and source timing for progression play-along. Isolated examples are separately labeled 4/4 studies with count-in and response/rest measures.

`usePlayingHomework` coordinates the existing homework, lesson and live-input owners. It records self-reports and support in immutable lesson events. Detected outcomes remain in `PerformanceAttempt`; homework events reference their IDs. Switching response method interrupts an active attempt and retains its episode and first response. Reload never reopens capture. Save status distinguishes pending persistence from a resumable checkpoint.

The default response method is self-report. A detected pitch does not verify a coordinate, family, technique or timing. A location answer set is never converted into a mandatory arpeggio. A selected fragment accepts its notes in any order unless the instruction specifies movement; the authored F→E connection requires one descending semitone in any register.

Teacher-v5 negotiates `homework-playing-v1`. Tools select an eligible step, isolate a change or prepare a retry. Device activation, saving arrangements and paid turns remain explicit learner actions. During a label-free attempt, unrelated teacher history remains hidden until help is recorded.

The suggested workload reserves roughly four-fifths for playing or listening-and-playing. This is an editable product default, not an enforced timer or a measured teaching result. Coordinate checks remain a separate optional surface. See [the frozen behavior checks](../../research/guitar-homework/README.md) and [integration verification](../../integration/verification.md).
