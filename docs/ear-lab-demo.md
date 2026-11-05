# Work it out by ear: reproducible demonstration

Start the local backend and Vite using the [worker setup](../audio_worker/README.md). The experimental activity stays disabled on hosted deployments without that worker. The original study and proposal controls do not require Forge or a cloud session.

1. Open **Work it out by ear → Open original listening study**. Choose **Hear passage**. Leaving space after playback lets the learner sing or play a response.
2. Choose **Try without help**. Enter `G`, then `Cmaj7`, and check the proposal. The first root matches; its quality does not. The second chord matches. This is an authored screen-answer contract, not a microphone assessment.
3. Enter `G7` for the first change and audition the proposal. Expand **Try a bass or melody note** to compare a specific pitch such as `F3`. These comparisons count as help.
4. With the research dependencies and permitted weights available, choose **Prepare draft notes**. The job runs locally. Completion does not reveal the answer. Choose **Reveal draft** when ready to compare. The original synthetic timbre can expose missing notes and incorrect durations; no model confidence is invented.
5. Correct a note, or reject it. The UI labels the edit as a learner correction. The original hypothesis remains in the export and review log. Proposed tablature positions include omissions rather than shifting unplayable notes.
6. Choose **Play my proposal across the neck**, then **Frets 5–9**. This opens separate accompaniment with the entered G7→Cmaj7 harmony. Preview, add a color, and use **Apply & save** for a variation. The imported source remains unchanged.
7. Open the [saved failure evidence](media/ear-lab/forge-failure.html), then follow its Lens and Weave links. This retained model answer is deliberately shown as a failure. The guide did not display its disputed prose to a learner.

[Actual capture](media/ear-lab/ear-workflow.webm), [GIF](media/ear-lab/ear-workflow.gif), and [research results](../research/ear-lab/results.md). `scripts/capture-ear.mjs` records an isolated Playwright browser against ports 5190/3011. It uses original CC0 audio and the actual cached model-stage output. It does not record a user's tabs or upload audio to Forge.

Browser checks verify audio startup and score events. Independent listening on Safari/iOS and Chromium/Android remains a release check. The separate Toraneko app is not deprecated until its remaining project-reconstruction and replacement checks pass.
