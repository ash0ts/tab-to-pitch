# Combined release verification

This record applies to the integrated standalone application. Per-worktree test totals are historical and are not added together to qualify this release.

## Automated evidence

The final local application checks passed TypeScript, NodeNext server compilation, the production build, 465 unit/contract checks and 17 accounting/publication guards. Two database checks require the isolated CI PostgreSQL service. The unit total includes seven compatibility checks using authored backups serialized by the six frozen source schemas.

The guitar-homework browser suite passed all 16 checks across desktop and mobile, including playback-driven chord changes, hidden-score startup and restored bookmarks. The complete union of browser, renderer, offline, Python and container/recovery suites is enforced by [Validate](../.github/workflows/ci.yml). Its result on each exact PR head is the merge gate; earlier worktree counts do not qualify this integration.

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

## Demonstration

The [original-song walkthrough](../docs/guitar-homework-demo.md) uses an isolated Chromium browser. The learner actions and guitar input are simulated and labeled. It retains an unassessed first response before a supported F→E retry, shows both C–F–G–C regions, and reloads the bookmark. This is software evidence, not a recording of a learner or a hardware qualification.
