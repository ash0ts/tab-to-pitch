# Local audio worker

The ear workspace runs audio analysis on the user's computer. Fastify owns a child Python process over JSON-lines stdio. There is no second HTTP listener and no browser-provided filesystem path. Hosted deployments leave this capability disabled.

## Start

Install FFmpeg/ffprobe and Python 3.12. From this directory:

```sh
uv --no-config sync --locked --extra analysis --python 3.12
```

In the application's environment, set:

```sh
EAR_LAB_ENABLED=true
EAR_LAB_PYTHON=audio_worker/.venv/bin/python
EAR_LAB_DATA_DIR=.local/audio
EAR_LAB_RESEARCH_MODE=true
HF_TOKEN=<local Hugging Face read credential>
EAR_LAB_BASIC_PITCH_CHECKPOINT=<local nmp.onnx path>
```

Use `node --env-file=.env --import tsx server/index.ts` and `npm run dev`. MuScriptor weights require permitted non-commercial use; the flag is an operator assertion, not a license grant. The local original study and learner proposals work without model dependencies. Credentials stay in the worker environment and never appear in browser responses.

## Data flow

An import is bounded to 32 MB, ten minutes, and one mono/stereo audio stream. FFprobe validates its content. Jobs select at most 60 seconds. Source bytes and artifacts are SHA-256 addressed; records expose hashes, duration, permission, and opaque identities, never paths or original filenames.

SQLite atomically claims jobs. Repeated identical submissions return the same job. A single process lock prevents two workers from recovering each other's running jobs. Restart requeues interrupted work. Each completed stage is cached by input bytes, configuration, implementation, and lockfile fingerprint. Cancellation terminates the entire model process group and cannot be overwritten by a late completion.

MuScriptor returns instrument-tagged note hypotheses. Demucs supplies explicitly estimated parts. Beat This estimates timing. Basic Pitch supplies another model family, not an independent reference. Reconciliation counts model families rather than repeated passes. Confidence stays unknown; an absent detection is not silence. Results remain hidden until the learner reveals them.

Reviews are append-only decisions. The original result remains unchanged; the UI reconstructs the learner's current interpretation from the review log after reload. A source, excerpt, review, or lesson revision invalidates pending teacher actions. Model agreement and learner confirmation never supply listening answer keys.

## Interfaces

`/api/audio/health` negotiates local capabilities. `/assets`, `/demo`, `/jobs`, `/jobs/:id`, `/jobs/:id/reviews`, `/reviews`, `/projects`, and `/artifacts/:id` implement bounded import, job lifecycle, review, read-only legacy import, and artifact retrieval. Writes require the application's configured origin. Reads reject foreign hostnames and cross-site browser requests.

Teacher v3 may include a **local-only** asset binding outside `TeacherContext`. A validated `ear_activity(analyze)` can submit a job during the existing bounded actor loop. The next actor call sees only the opaque receipt. Actor and critic payloads exclude that binding. Completion requires no extra paid call and neither reveals the draft nor applies an arrangement. Without a bound worker, the tool prepares an explicit local action.

The diagnostic logs under the local data directory can contain paths. They are not publication artifacts. Deleting browser progress does not delete worker media; remove the selected `EAR_LAB_DATA_DIR` separately when retiring a local research workspace.

See [port provenance](PROVENANCE.md), [product contracts](../src/ear/README.md), and [research protocol](../research/ear-lab/README.md).
