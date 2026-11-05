# TabToPitch contributor guide

This is a standalone repository. Use Node 24 and the pinned npm lockfile. `npm ci` applies the version-checked alphaTab patch; do not edit `node_modules` manually.

Read the relevant domain README before changing the player, coaching service, evaluation suite, or ML pipeline. `docs/implementation-plan.md` records the accepted plan; current contracts belong beside their implementations or in `docs/architecture.md` and `docs/curriculum.md`.

Keep music identity independent of rendered bounds. Grading and supported musical facts remain deterministic. Model output cannot become an answer key or executable code. Do not upload scores, user metadata, practice history, evaluation artifacts, or model datasets without the corresponding opt-in.

Run `npm run typecheck` and the relevant unit tests for changes. For player/UI changes also run the browser and renderer suites; for offline/deployment changes build and run the offline suite. PostgreSQL integration tests require an isolated `TEST_DATABASE_URL`. Never point tests or restore rehearsals at production.

Capture UI screenshots under the parent workspace's `.context/` directory. Inspect painted notation, not only SVG DOM text. Chrome full-page captures can omit composited notation; use a viewport capture for application screenshots.

Keep repository ownership explicit when adding paths. Do not add test suites to commit/push hooks. Do not report live Forge, real-device audio, learner outcomes, or trained-model results unless actually measured.
