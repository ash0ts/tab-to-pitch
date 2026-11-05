# Runtime research artifact

`voicing-ranker-v1.json` is a byte-identical copy of the [public runtime model](../../public/research/voicing-ranker-v1.json). The shared teacher engine imports this copy because Vite does not allow module imports from `public/`; the compiled Node service needs the same artifact.

SHA-256: `64e24a350e4cb9c6b5c759523f7f8b8766821d09df778f78d7736bf7947cf46b`.

The teacher engine's artifact-parity test checks both files. Keep the published bytes intact rather than reformatting the JSON. This is the existing recorded-voicing ranker, not a newly trained teaching model. Its dataset, scope, evaluation, and Registry lineage are documented in the [voicing study](../../research/voicing-ranking/README.md).
