# Verification record

This is the preserved verification history of earlier implementations. For the consolidated application and its exact release gates, use the [combined verification record](../integration/release-verification.md). Historical totals and cloud settings below do not describe a newly qualified release.

Local verification on October 29, 2026 used Node 24, pinned dependencies, Google Chrome, and isolated PostgreSQL 16 containers. These are implementation checks, not learner-outcome evidence.

| Check                   | Result                                                                                                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`         | TypeScript (including unused-code checks), 94 unit tests, and production build pass. Two PostgreSQL tests are optional without `TEST_DATABASE_URL`; the full 36-test server suite also passed against an isolated database.                                                               |
| `npm run test:browser`  | 16 checks pass across desktop and emulated phone layouts. Four duplicate mobile request/storage cases are intentionally skipped; their shared logic is covered on desktop. Targeted checks after the final UI edits also pass, including draft-answer preservation across panel remounts. |
| `npm run test:renderer` | Real rendering worker, painted SVG labels, stable masks, audio startup, and horizontal mobile notation pass.                                                                                                                                                                              |
| `npm run test:offline`  | Production cache, offline score/audio playback, durable attempts through repeated reloads, and API cache exclusion pass with ordinary HTTP cache disabled.                                                                                                                                |
| `npm run format:check`  | Authored TypeScript, CSS, JSON, and documentation pass Prettier.                                                                                                                                                                                                                          |
| `npm run eval:replay`   | Four authored synthetic coach regression cases pass. No inference or publication occurred.                                                                                                                                                                                                |
| ML unittest suite       | All 18 tests pass, including consent, pre-attempt feature isolation, chronological/learner splits, identity collisions, per-family metrics, and synthetic-only training. Network access is blocked by the tests.                                                                          |
| Production container    | Node 24 runs as a non-root user with cloud coaching disabled. Asset serving, health, offline reload, and actual playback tick advancement pass.                                                                                                                                           |
| Database recovery       | Compiled migrations, private custom-format dump, and transactional restore pass against isolated PostgreSQL 16 with restore network access disabled.                                                                                                                                      |
| Forge SDK               | The installed SDK emits conversation, model, and tool spans into an in-memory processor; metadata allowlist and privacy assertions pass. No Agent Lens service call occurred.                                                                                                             |

App tests cover malformed-file recovery, saved-file reopening, all exercise families, hidden labels, separate reveal/self-report evidence, stale responses after consent withdrawal, invalid recommendations, and storage-quota failure. Engine tests cover tied sustain, repeats, supported spelling, inversion, alternate locations, delayed-review timing, and first-exposure transfer evidence.

## Note and chord exploration revision

The subsequent note-first revision passed TypeScript and the production build, 134 unit tests (two optional database tests skipped), 26 desktop/emulated-phone browser checks (four duplicate mobile cases skipped), and all three worker/renderer checks. The first combined browser run timed out during one desktop audio initialization; all 30 cases completed in the subsequent run with the stated 26 passes and four skips. No timeout was reclassified as a pass.

New coverage includes default note-name labels and persisted octave display, fixed engraving bounds when toggling register, any-octave versus exact-pitch answer sets, capo and reentrant tuning, complete triad roles and sounding-bass inversions, neck/string/inversion filters, derived versus source audition frequencies, selected-note practice handoff, and a low-E2 exact-location empty state. Hidden note-name questions remove tuning clues. Location-grading IDs separate the new contracts from earlier attempts.

Native Safari showed the new explorer controls and fretboard, but the shared background window suspended score/audio initialization during this revision's capture attempt. No new complete native demo or real-device audio-quality result is claimed. Automated browser checks include painted notation and playback advancement; they do not replace that native release gate.

The [fretboard-intent results](../research/practice-intent/results.md) own live inference and Forge readback evidence for this revision. Earlier verification rows above describe the initial implementation, not those later service calls. Source ownership was reviewed for the new engine, UI, tests, and research paths; the standalone ownership declaration still awaits a verified GitHub principal before publication.

## Progression revision — October 30, 2026

The progression implementation passed the following local checks against the final save/restore fixes:

| Check                                    | Result                                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and production build          | Pass, including alphaTab worker/worklet assets and the separate harmony and ranking workers.                                                                                                                         |
| Unit and integration tests               | All 207 tests in 24 files pass, including the invitation/quota tests against isolated PostgreSQL 16. The temporary database was removed afterward.                                                                   |
| Desktop and emulated-phone browser tests | 40 pass. Four duplicate mobile request/storage cases are intentionally skipped; desktop covers their shared logic. All 14 progression cases pass.                                                                    |
| Worker/renderer checks                   | All three pass: painted pitch labels, stable masking bounds, audio advancement, and mobile notation.                                                                                                                 |
| Production offline check                 | Pass with ordinary HTTP cache disabled: score/audio, durable attempts, the downloaded ranking model, and the recorded Forge example remain usable offline; API responses are excluded from caches.                   |
| Research contracts                       | Five Python ranking tests, three runtime-ranking tests, and all 17 Forge transport/publication tests pass. Runtime tests are also part of the application suite above.                                               |
| Formatting                               | Authored source, tests, scripts, and docs pass Prettier.                                                                                                                                                             |
| Demonstration                            | Isolated Playwright Chrome recorded the actual CC0 progression, added ninth, local proposal, and recorded Forge response. Capture receipt reports no page errors; desktop and mobile stills were visually inspected. |

The final review fixed three persistence defects: restoring a saved path with identical controls now forces regeneration; Undo restores the diagram and controls along with playback; and a failed preview cannot save the variation or report success. Regression checks cover saved-path restoration and Undo. Recorded Forge replay is checked for the exact trace reference and absence of a cloud request.

The [arrangement results](../research/arrangement-agent/results.md) retain the original campaign, revised regression, fresh confirmation, failed qualifications, and service readback separately. Fresh confirmation scores 46/64 request-correct model attempts, below the 90% release gate. Live arrangement coaching stays disabled by default. The [voicing results](../research/voicing-ranking/results.md) report the blocked GuitarSet comparison, independent Guitar-TECHS checks, downloaded-artifact reproduction, and Registry readback. These experiments do not measure learner outcomes.

The updated builder articles and their actual-app media passed static validation and desktop/mobile visual review. New Forge records were verified through service readback; their rendered dashboard pages were not rechecked. The private [dashboard tour](../research/forge/dashboard-tour.md) distinguishes those records from historical screenshots.

The original container/recovery checks above remain dated evidence; this revision does not claim a new hosted deployment or a physical-device audio review. Ownership was reviewed for the standalone app and research paths. Its CODEOWNERS declaration still needs a verified GitHub principal before repository publication.

## Music-teacher revision

The October 30 teacher implementation passed these checks:

| Check                | Result                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration | All 266 tests in 33 files pass, including concurrent quota reservations and invitation/session behavior against isolated PostgreSQL 16. The temporary container was removed afterward.               |
| Browser              | 58 desktop and emulated-phone checks pass. Four duplicate mobile cases remain intentionally skipped; desktop covers their shared logic. Teacher and progression flows account for 32 passes.         |
| Renderer             | All three worker/renderer checks pass, including painted notation, stable masks, audio startup, and advancing score events.                                                                          |
| Production offline   | Pass: score, audio, progress, and the downloaded model remain available; API responses stay outside caches.                                                                                          |
| Build                | TypeScript, Vite production assets, and the compiled Node service pass.                                                                                                                              |
| Research harness     | All ten teacher campaign/publication tests pass. Hosted records were independently read back; see the [teacher results](../research/teacher-agent/results.md).                                       |
| Demonstration        | The isolated browser captured the actual original-song workflow with the on-device guide and scripted answers. The capture receipt reports no page errors. Desktop and mobile stills were inspected. |

New checks cover exact two-position connections, frozen derived questions, note/role separation, contextual rootless harmony, hidden conversation during assessment, assistance before help, shared preview state, old backups, memory-only storage, deletion races, stale cloud replies, bounded actor/critic accounting, and exposure identities across regions.

The hosted actors and judges did not qualify. The authored policy completed 264 structural turns, but no qualified independent teaching-quality score exists. Cloud teaching remains disabled; successful local fallback is not counted as model success. Agent Lens conversation grouping also passed a separate two-process restart probe with a mocked provider. Its spans are explicitly separate from live inference evidence.

No physical-device audio review, hosted deployment, teacher review, or learner study is claimed. The new service, lesson state, UI, copied model artifact, tests, and research paths remain under the standalone owner's scope. A verified GitHub principal is still needed before publication.

## Review corrections

The review reproduced and fixed the following defects:

- Hidden responsive panels mounted competing coach clients. The UI now mounts one panel and retains the draft answer with its question. File reads and auditions reject obsolete work.
- Backup reloads could discard memory-only attempts, normal saves could overwrite evidence, and JSON property order could create false conflicts. One persistence owner now preserves unsaved evidence and checks immutable records consistently.
- Interval generation could bridge excluded attacks or voices, and a repeated chord could satisfy the distinct-question gate by counting its individual notes. Eligibility and progression now use the actual stimulus. New exercise IDs version the corrected answer contract.
- Tied pitch changes and staccato duration could produce incorrect eligibility or overlap. Unsupported sustain timing now withholds harmony; its limitations are recorded in the fixture guide.
- Encoded API routes bypassed origin/cache controls, malformed provider usage could release reserved quota, idle database errors were unhandled, and failed dumps could leave partial backups. Regression tests cover each case.
- Research export validation accepted Boolean schema versions, delimiter-based identities could collide, and pooled metrics hid exercise-family gaps. Dataset validation and reports now preserve those distinctions.

Cleanup removed unused player lookup/audition paths, an unused semitone-only interval helper, redundant presentation renders, and duplicate CSS overrides. The final desktop and phone captures were inspected for painted notation and viewport overflow. Source ownership was reviewed; the standalone repository still needs a verified GitHub owner before publication.

## Dependency review

The production-only npm audit reports zero known advisories for the pinned runtime lock. The full development audit reports nine moderate and four low findings, with no high or critical findings. The moderate chain belongs to Weave's older OpenTelemetry dependencies, used only by the offline evaluation CLI and omitted from the runtime image. A global major-version override would change Weave's unsupported dependency contract. Track the [OpenTelemetry baggage advisory](https://github.com/advisories/GHSA-8988-4f7v-96qf) when updating Weave.

The low chain belongs to build-time Workbox/Rollup use of deepmerge. The [upstream advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) lists no patched version at this verification date. Build configuration is repository-controlled; imported scores and request data do not enter that merge path. Re-run both audits on dependency changes.

Real Safari/iOS and Chromium/Android audio quality, broader external-format compatibility, hosted operations, and learner outcomes remain the [release gates](release-gates.md). Actual Forge inference and record readback are documented above; model qualification remains specific to the tested configuration.
