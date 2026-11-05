# Illustrated practice studio

This layer presents the existing musical tools. `App` retains the single alphaTab controller and canonical source score. `ProgressionWorkspace` retains lesson, homework, listening and live-input hooks; only the active task is rendered. The optional bandmate opens the existing teacher. It is not another agent.

## Entry points

- `catalog.ts`: activity descriptors and attributable teaching references.
- `useStudio.ts`: hash routes, local preferences, practice set, participation events and bookmark.
- `StudioPages.tsx`: Studio, activity library, progress and teaching library.
- `Timeline.tsx` / `timeline-events.ts`: Canvas presentation and repeat-expanded source events.
- `contracts.ts`: practice-set schema, run references and scoring policy.
- `studio.css`: presentation tokens and responsive layouts. Musical degree colors remain in the existing fretboard styles.

Routes contain only destination and a registry activity ID. Private titles, filenames and grading keys never enter URLs. Bookmarks use the local source hash, track, loop and speed. Existing source files remain in IndexedDB. A lesson resumes without opening an audio input.

The studio exposes listening, teaching practice, CAGED, experimental live guitar and Ear Lab. Ear Lab uses the optional local worker; its absence leaves other activities usable. The shell does not fake analysis or acquire recordings.

## Evidence and scoring

A challenge is a bounded set of up to five deterministic screen-answer targets. `StageRun` references existing immutable attempt IDs; it has no independent answer history. Correct first responses receive 100 points, without multipliers. The first mismatch resets the combo. Duplicate, retry, missing, stale, unsupported and self-reported records cannot create another correct target. Assistance is recorded by the existing task lifecycle before revealing content and excludes a ranked result. A complete identical target set, source, task version, input, tempo, support and scoring policy are required for a comparable personal best.

Experimental live input is excluded from ranked challenges. Timing is never scored. Canvas reads `PlayerController.state`; animation callbacks do not produce attempts, pitch facts or grades. Repeat occurrences are expanded from the adapter. Missing positions remain unassigned. Derived variation playback hides the source timeline. Reduced motion and the static toggle advance a whole visible passage rather than scrolling it.

Homework, listening and musicianship tasks keep their own assessment contracts. Hidden tasks are not mounted for display and cannot record a visual exposure merely because the Studio is open. The teacher masks its history during active questions. Changing route stops playback and live capture, interrupts active work and invalidates pending demonstrations.

## Persistence and privacy

The presentation is stored under `studio-v1` and `stage-runs-v1` in the existing settings store. The backup contract accepts these optional fields without changing legacy attempt semantics. Only presentation preferences, event timestamps and references are added; no raw audio is saved. All participation data stays local. It is not a proxy for learning or mastery.

`presentation` is an optional bounded teacher-context extension. It names the activity, mode, playback state and feedback visibility. Existing actor/critic limits, consent, factual validation and quota behavior are unchanged. Only explicit teacher requests run; no unsolicited paid turn is triggered by navigation or a completed set.

## Art and evidence

[Asset provenance](../../public/art/provenance.md) records the original generated artwork. Art is decorative, locally bundled and nonessential to navigation. The research library distinguishes pedagogical sources from historical technical experiments. Public notebook summaries use only original/authored examples and aggregate published research results. Private dashboards still require their existing access. Their historical readbacks are not represented as freshly reverified.

[practice-stage-v1](../../research/practice-stage/protocol.json) freezes the new presentation cases. [Delivery evidence](../../docs/studio-delivery.md) records checks and pending qualifications. This layer does not claim improved learning, retention or actual guitar performance.
