# Live guitar evaluation

This campaign asks whether local detection supports an exercise without turning uncertain input into a learner error. It does not test learning effectiveness. The [protocol](protocol.json) preserves the proposed targets and the required recorded-guitar and hardware evidence.

## Current evidence

`replay.ts` freezes a manifest before running the browser's actual DSP engine on 60 original generated fixtures: 40 notes, 12 identifiable chords, and eight unknown/silence/clipping cases. These are development and regression material. The same pitches at two sample rates are related conditions, not independent musical examples.

The first run recovered all 40 notes but rejected all 12 clean chord cases. Wide FFT-bin neighborhoods were assigning one low-frequency peak to adjacent semitones. The second run uses interpolated local peaks before harmonic suppression. It recovered all 40 notes and 12 clean chord cases and abstained on all eight unknown cases. Both runs remain retained; subsequent source-snapshotted replays reproduce the second result. The four minor-seventh/sixth and power-chord fixtures test ambiguity and missing thirds, not all possible omissions.

These denominators are too small and artificial to qualify the detectors. The displayed Wilson intervals describe fixture proportions only; they do not correct for related conditions. Offline sample accumulation before detection is approximately 93–107 ms for these notes and 363–372 ms for these chords. These numbers exclude physical capture, browser scheduling, UI presentation, and monitoring. Do not report them as hardware latency.

The 12 authored teacher cases cover uncertain harmony, fingering and technique claims, timing claims, wrong notes, interruption, stopping, injection, assistance, changing goals, and help during an attempt. Unit tests exercise local policy and action boundaries. Mocked actor/critic tests exercise transport and withholding. They do not establish that a hosted model or reviewer succeeds on these cases.

## Reproduce and extend

From the application directory:

```sh
node --import tsx research/live-guitar-v1/replay.ts ../live-guitar-results/new-run
npm run test -- research/live-guitar-v1/contracts.test.ts
npm run test:live
```

A run refuses to overwrite a manifest or results. Preserve failed runs and choose a new output directory after changing code. The manifest records source hashes, fixture membership and creation time. Results retain individual observations, first supported detections, failures, and denominators.

Recorded-guitar evaluation must use independently annotated events. GuitarSet is a suitable additional acoustic cohort; its performed chord labels are partly derived from pitch annotations. It cannot substitute for clean electric guitar captured through a USB interface. Previously inspected recordings remain development or regression material. Freeze held-out performer/instrument/recording groups before iteration, keep excerpts and transformations together, and publish licenses, source checksums and exclusions. See the existing [music dataset documentation](../music-data/README.md).

For physical tests, record the interface model, driver/browser/OS versions, input/output rates, channel, gain, guitar/pickup, monitoring route and test conditions locally. Measure physical onset-to-display with an independently synchronized reference. Test repeated attacks, slow strums, missed sevenths, extra strings, distortion and loopback leakage. Log detection, grading, dropout and timing errors separately. A tap-along offset is not an independent hardware measurement.

## Forge and spending

The production teacher reuses the existing Forge actor, critic, token reservation, cancellation and Agent Lens conversation path. Live context contains bounded symbolic summaries. The production trace policy excludes learner payloads.

No paid calls or publication were executed for this campaign. Existing campaign ledgers are per campaign, and this checkout does not have a reconciled atomic spending reservation shared by all active worktrees. Running another campaign before that integration would risk exceeding the original shared $25 authorization. This is an accounting dependency, not a request for a new allowance.

Once that ledger is reconciled, freeze model/pricing/judge versions, run the authored cases with actor and critic costs reserved together, and publish recorded outputs through the existing Forge research transport. Read back exact case IDs, outputs, criterion scores, Lens conversation/turn relationships and usage. Weave replay must not invoke the actor again. Keep fallback success distinct from actor success. W&B Models can record real detector experiments; no learned detector or calibrator was trained, so there is no new Registry artifact.

Jam Origin, physical interface latency, held-out recorded guitar, hosted teacher quality, and remote dashboard reconciliation remain unexecuted. All live capabilities remain experimental.

## Delivery verification — 2026-11-04

| Check | Observed result |
| --- | --- |
| TypeScript and production build | Passed; worker and worklet are separate precached assets. Existing bundle-size warnings remain. |
| Unit/service contracts | 337 passed, two PostgreSQL tests skipped without an isolated test database. |
| Existing browser integration | 62 passed, four existing skipped variants. Desktop and Chromium mobile emulation. |
| Live worklet/worker browser integration | Ten passed in a separate run; generated audio traverses the actual capture and analysis pipeline. |
| Renderer | Three passed, including measured labels and assessment masking. |
| Production offline reload | One passed; capture and analysis assets present in the cache. |
| DSP replay | 40/40 note fixtures and 12/12 identifiable chord fixtures recovered; eight unknown fixtures abstained. Development only. |
| Production walkthrough | Original C–F–G–C study, visible synthetic-input label, CAGED fragment, uncertain chord, F→E, and local teacher. No physical guitar or hosted model used. |

One live-capture startup stopped with a frame/channel-unavailable error when run alongside the larger browser suite. The failed trace is retained; an isolated rerun passed all ten tests. The failure produced no graded answer. This does not establish resilience under sustained CPU load, which remains part of hardware qualification.

Integration checks also exposed an alphaTab rendering race and mobile dialog overlap. Render revisions now reject old worker bounds and SVG before they can be attached to a new score. Starting a teacher question closes the mobile teacher sheet before opening the exercise. The accompanying regression tests exercise those failures. Mobile listening choices now fit their grid cells.

The implementation remains in the workspace's standalone `.context/tab-to-pitch` copy, outside the Core Git diff. The sibling `live-guitar.patch` and `live-guitar-integration-manifest.json` contain the changes and per-file base/result checksums. The patch was applied to a fresh baseline copy and every resulting file hash checked. Other worktrees should check the patch against their current application before resolving integration conflicts; this work did not modify them.

Before a broader release, obtain independently annotated clean electric-guitar recordings and a physical interface matrix, measure onset-to-display and accompaniment alignment separately, qualify any MIDI converter, and reconcile the shared inference budget before hosted actor/critic runs. Keep all current detector results experimental until those gates pass.
