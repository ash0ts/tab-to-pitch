# Research model provenance

The two `voicing-ranker-v1.json` files contain matching provenance references, not trained parameters. The standalone distribution excludes model weights. The optional browser ordering and teacher tool return an unavailable result; deterministic movement ordering remains the default and works offline.

The historical artifact is `tabtopitch-voicing-ranker-runtime-v1:v0`, SHA-256 `64e24a350e4cb9c6b5c759523f7f8b8766821d09df778f78d7736bf7947cf46b`. Its [training, evaluation and Registry lineage](../../research/voicing-ranking/README.md) remain preserved. Research scripts can verify a separately downloaded artifact outside this source distribution. Restoring it to an application deployment requires an explicit packaging decision; this import does not download it automatically.

Unit checks retain the frozen Python feature examples and use authored arithmetic coefficients for scorer validation. Those checks are distinct from the historical trained-model prediction reproduction.
