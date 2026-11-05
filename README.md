# TabToPitch

Learn the fretboard through the songs you play. Open a Guitar Pro file, read note names on its strings, find those notes across the neck, move a confirmed progression, compare chord colors, and practice without hints. Octave numbers are optional.

This standalone application runs independently of `wandb/core`. The local player and exercises work without an account. Cloud coaching is optional and requires a configured Forge account and an invitation.

## Run locally

Use Node 24 and npm 11. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The original demonstration song is included. Importing a score saves it in this browser; it does not upload the file. The library reopens saved files. Settings offers progress export, import, and deletion.

For the invitation API, start `npm run dev:server` in another terminal. The local guide remains available when the backend or Forge is unavailable. See [deployment](docs/deployment.md) before enabling cloud access.

## What is implemented

- Measured pitch labels and optional fret hints in alphaTab's engraving pipeline, including worker serialization and stable masked-label widths.
- Audio playback, tempo control, repeat-aware passage loops, track selection, mute/solo, metronome, count-in, and notation zoom.
- Note locations across octaves, optional exact-pitch matching, and three-string major/minor voicings filtered by neck area and inversion. Audition source and derived shapes without changing the score.
- Progression studies across 24 supported chord families, bounded alternatives ranked by movement, shared-player A/B previews, saved variations, tonal context, and explicit melody preservation.
- Source-note and confirmed-harmony exercises, deterministic grading, guided and hidden attempts, held-back questions, and scheduled reviews.
- IndexedDB files and immutable attempt records, portable progress backups, offline app assets, and user-controlled app updates.
- A conversational music teacher with validated workspace tools, a separate factual reviewer, derived questions, exact voice-leading answers, and local lesson/exposure storage. Cloud teaching is experimental and off by default.
- An invited Fastify/Postgres service with bounded Forge calls, validated proposals, local fallback, persistent quotas, and Agent Lens conversation grouping.
- Authored arrangement-request evaluations, a real GuitarSet observed-voicing ranking study with preserved Registry lineage (trained parameters are not bundled), an independent Guitar-TECHS chord audit, and the retained earlier coach/recall experiments.

## Verify

```sh
npm run check
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:browser
PLAYWRIGHT_CHANNEL=chromium npm run test:renderer
PLAYWRIGHT_CHANNEL=chromium npm run test:offline
```

On a Mac with Google Chrome installed, omit `PLAYWRIGHT_CHANNEL`; browser tests default to that channel. The offline suite runs the production build. Postgres integration and ML verification are documented in their domain guides.

The automated checks cover deterministic musical correctness, masking and answer evidence, browser flows, worker/audio transport startup, and backend contracts. Browser audio startup is not a perceptual audio-quality check. Real Safari/iOS and Chromium/Android testing, a licensed import corpus, deployment-specific Forge qualification, and a learner pilot remain release gates. Trained ranking parameters are excluded from this distribution; its research lineage and deterministic movement ordering remain available. No improved-learning claim is made.

## Repository guide

| Area                                       | Entry point                                                   |
| ------------------------------------------ | ------------------------------------------------------------- |
| Accepted product plan                      | [Implementation plan](docs/implementation-plan.md)            |
| Boundaries and decisions                   | [Architecture](docs/architecture.md)                          |
| Learning rules and measurement             | [Curriculum](docs/curriculum.md)                              |
| Music teacher contracts and evaluation     | [Teacher-agent plan](docs/teacher-agent-plan.md)              |
| Original fixtures and format qualification | [Fixture provenance](docs/fixtures.md)                        |
| Run the product demonstration              | [Demo script](docs/demo.md)                                   |
| Remaining release evidence                 | [Release gates](docs/release-gates.md)                        |
| Checks completed for this implementation   | [Verification record](docs/verification.md)                   |
| Deploy, migrate, recover, and roll back    | [Deployment](docs/deployment.md)                              |
| Invitation service and Forge integration   | [Backend](server/README.md)                                   |
| Coach regression replay                    | [Evaluations](evals/README.md)                                |
| Arrangement-language study                 | [Protocol and evidence](research/arrangement-agent/README.md) |
| Observed-voicing ranking study             | [Protocol and results](research/voicing-ranking/README.md)    |
| Earlier language-to-exploration experiment | [Protocol and results](research/practice-intent/results.md)   |
| Recall predictor and consent requirements  | [ML](ml/README.md)                                            |
| Modified renderer and source availability  | [alphaTab patch](patches/README.md)                           |

The original study in `src/player/demo.ts` is CC0. Third-party code, fonts, and audio assets retain their respective licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

## Listening activity

**Learn from my songs** adds local list import, visible recording previews, deterministic listening questions, and a shared fretboard/teacher lesson. The original study is playable and gradable offline; popular-song excerpts remain pending annotation and embedding qualification. See [the current listening contract](docs/listening.md), [research protocol](research/listening-agent/README.md), and [results](research/listening-agent/results.md).

The [practice workspace](docs/practice-workspace.md) adds learner goals, graduated help, immutable retries, and original rhythm, construction and expression studies. Its separate [teaching-practice protocol](research/teaching-practice/README.md) preserves earlier experiments and shares their remaining inference authorization.

## Fretboard homework

Open **Understand → Fretboard homework** for note recall, CAGED fragments and progression application. See [the activity guide](docs/homework.md) and [evaluation protocol](research/homework-caged/README.md).
