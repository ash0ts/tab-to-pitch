# Illustrated practice studio delivery

This worktree adds the studio presentation to the integrated listening, teaching-practice, CAGED and experimental live-input snapshot. The base was copied from `dfc0/lima/.context/tab-to-pitch` on November 4, 2026. The original worktree was not edited. Ear Lab's Python worker remains in its separate worktree; the library describes that activity but does not pretend it is integrated.

The runnable application is `.context/tab-to-pitch` in the `f167/lima` worktree. It remains a standalone application, outside the W&B Core product. The accompanying patch and base-file checksums make this change portable to the eventual integrated repository.

## What changed

The Studio opens with an original illustrated rehearsal room and an editable 5, 15 or 30 minute practice set. Its Continue action resumes a local source, loop and goal. Activities have ordinary labeled navigation. The central stage contains one task, the existing transport and an optional teacher drawer. CAGED, listening, progression, musicianship, notation and experimental input keep their existing engines.

The moving timeline reads alphaTab playback ticks and repeat occurrences. It never schedules audio or grades an answer. String assignments come from the canonical score; absent assignments stay unassigned. Original notation, a static timeline and a semantic passage description remain available. Artwork is decorative and cached locally. [Asset provenance](../public/art/provenance.md) records the generated originals and optimized derivatives.

Knowledge challenges contain up to five deterministic screen questions. A correct first response earns 100 points. Help converts the run to assisted practice before disclosure; retries cannot replace the original answer. Missing, stale, unsupported or self-reported evidence cannot produce a ranked result. Personal bests require identical target IDs and configuration. Live guitar input and timing are not qualified for scoring.

The optional bandmate opens the existing teacher. It preserves the learner's cloud choice while the drawer closes, uses the shared musical selection, and masks conversation during recall. Changing a goal invalidates pending actions and pauses affected tasks. Closing the drawer cancels its outstanding request. No new model call happens automatically.

The teaching library links each activity to its objective, measurable response, limits, support and a next application. It distinguishes pedagogical studies from historical agent/ranking experiments. Private dashboards retain their access controls. This change makes no claim about improved learning or voluntary return.

## Reproduce locally

Use the versions in `package.json` and the lockfile. Run `npm ci`, then `npm run dev -- --port 5204 --strictPort`. Open `http://127.0.0.1:5204`. The authored teacher and local exercises work without cloud credentials. A separately configured backend is needed for invited Forge access.

Start at Studio, continue into CAGED homework, request a root landmark, then save a bookmark. Open a progression, move its region and preview it in the existing player. Play the timeline, switch to static or notation, then try a knowledge challenge. Requesting help should show assisted practice. Open How this teaches from the activity and return to the same application.

Run `node scripts/capture-studio.mjs` with the app running to capture the walkthrough in an isolated browser. `STUDIO_URL` and `STUDIO_CAPTURE_DIR` override its defaults. It writes screenshots and a silent video; no user tabs or physical input device are accessed.

The captured walkthrough uses the original authored studies. Its live-input scene uses a **silent browser fixture**, through the actual capture/worker/assessment path, to demonstrate “Could not assess.” It is not a guitar detection benchmark or hardware qualification. Popular-song recordings and the Hotelier attachment are not included in public media.

## Evidence and remaining qualification

Automated delivery checks cover canonical music/teacher behavior, fixed-target scoring, duplicated and stale evidence, repeat-expanded timelines, mobile/desktop tasks, assistance and masking, atomic backup restoration, missing artwork, reduced motion, zoom, production caching and worker/worklet assets. The [verification receipt](../research/practice-stage/verification.json) records 327 passing unit tests (2 existing skips), 62 passing browser regressions (4 duplicate-device skips), 11 passing studio checks (1 duplicate-device skip), 3 renderer checks and 1 production-offline check. No failures or flaky results remained in the final runs. The production build and TypeScript check passed.

The new [practice-stage-v1 protocol](../research/practice-stage/protocol.json) retains eight presentation/teacher scenarios independently of earlier campaigns. Its engineering fixtures execute locally. Its Forge actor/critic comparison is **unexecuted**: this worktree has no reconciled shared campaign reservation or new spending allowance. No inference calls, Weave publication, Registry promotion or remote readback were performed for this layer. Historical notebook links are clearly labeled as historical.

Real USB-interface latency, Safari/iOS and Android audio, human usability, accessibility with assistive-technology users, learner outcomes and return behavior remain unqualified. Chromium automation and a silent fixture do not substitute for those checks. The existing production bundle still carries alphaTab and its soundfont; Vite reports a large-chunk warning. Art failure cannot block the activity.

Before promoting the UI, integrate Ear Lab through its real source/job contracts, run the shared campaign accounting check, execute the frozen teacher comparison with a qualified evaluator, and perform the hardware and human checks below. Preserve the current experimental status until those gates pass.

## Prepared human study, not executed

A first usability session should ask an intermediate tab-reading guitarist to resume a goal, complete a task without opening a long transcript, request a different explanation, recover from uncertain input, and save the next step. Record task completion, navigation errors, assistance, abandonment and the learner's explanation of what was measured. Test keyboard and touch use separately. Do not infer educational effectiveness from completion.

A later consented comparison can contrast this presentation with the conventional player while holding musical material, teacher policy and practice time constant. Group related passages and positions before allocation. Measure delayed unassisted recall, unfamiliar-context transfer, independently assessed playing, voluntary return and perceived pressure separately. Retain revealed, interrupted and abandoned trials in denominators. Do not treat game points, time in the app or confidence as mastery. Freeze the protocol and analysis before collecting data.
