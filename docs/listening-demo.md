# Listening demonstration

Use the original CC0 study for recordings distributed outside the application. Popular songs stay inside visible, supported YouTube players; their pending annotations do not supply quizzes.

1. Open **Choose a song** and show the distinction between a ready authored study and catalog candidates needing review.
2. Open **Four chords, one key**. Choose Recall and start a listening question. Hear the synthesized passage while notation, chord diagrams, and conversation are hidden.
3. Submit D, G7, Cmaj7, Am7. The first root is correct and its quality is wrong. Show the feedback instead of calling the entire answer simply wrong.
4. Ask the teacher about that quality discrepancy. Identify whether the visible reply came from the on-device guide, the hosted actor, or fallback after a failed hosted turn.
5. Open the progression on the neck and select Frets 5–9. The progression and timing are shared with the score. Add color only as an explicitly derived variation.
6. Choose Transfer to load the related study in G. Keep the transposition's relationship explicit; it is not an independent learner study.
7. Open the linked private Forge comparison and trace. Show actual actor/critic calls, the accepted or rejected reply, and the matching evaluation row. Keep unexecuted cases and unavailable reviewer scores visible.

`scripts/capture-listening.ts` drives the actual app in an isolated Playwright browser. Its receipt records the source, scripted answer, selected guide, timestamps, and browser errors. The WebM/GIF is silent; it does not establish audio quality. Real-device Safari/iOS and Chromium/Android listening checks remain separate.

The [listening research report](../research/listening-agent/results.md) links measured runs and readback receipts. The captured guide demonstration is intentionally local; it must not be presented as a successful cloud inference or as evidence that a person learned the material.

The separate `scripts/capture-live-listening.ts` capture exercises three hosted turns through the loopback demo server. All three recorded turns fell back; keep that outcome visible. Its original SDK spans, responses, and accounting remain in `listening-demo-001`. To replay them without repeating inference, `scripts/prepare-listening-demo-replay.mjs` creates a nested publication snapshot with an explicit post-execution source scope. Publish that snapshot with the normal Lens, Weave, and table commands, then use `scripts/verify-listening-table.mjs` for read-only confirmation if the remote summary is still propagating. Never repeat an upload merely because its immediate summary read is stale.
