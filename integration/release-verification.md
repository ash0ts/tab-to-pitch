# Combined release verification

This record applies to the integrated standalone application. Per-worktree test totals are historical and are not added together to qualify this release.

## Automated evidence

Type checking, the production build and 451 unit/contract checks passed locally, with two PostgreSQL checks awaiting the isolated CI service. Seven additional compatibility checks passed against authored backups serialized by all six frozen source schemas. The full combined browser, renderer, offline and container checks are in progress; CI is the merge gate.

The guitar-homework browser suite covers both desktop and mobile: unplugged self-report, synthetic input through the real worklet, uncertainty, assistance order, method changes and interruption/resume. The source-preserving player fixtures verify backing tracks, harmonic timing and immutable imported arrangements.

## Qualification boundaries

| Capability | Release status |
| --- | --- |
| Local teacher and deterministic exercises | Available; automated contracts checked |
| Guitar homework without an interface | Available; reports explicitly self-reported |
| USB/MIDI detection | Experimental; synthetic browser checks do not qualify hardware accuracy or latency |
| Timing, fingering and hand technique | Not graded |
| Cloud teacher | Invitation-only opt-in; enablement does not imply qualification |
| Ear Lab | Optional local worker; hypotheses and learner corrections cannot become reference truth |
| Commercial-song grading | Disabled where annotations or recording alignment remain unverified |
| Learning effectiveness | Not evaluated; human review and learner study remain unexecuted |

## Research

`guitar-homework-v1` has a separate frozen authored suite. Its local policy results are recorded; hosted actors, critics and remote publication are unexecuted. Historical campaigns and their retained failures are preserved. The integration made no paid calls and did not promote a research model.
