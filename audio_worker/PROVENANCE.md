# Port provenance

The source baseline is Toraneko revision `7258c72d22bbe6b3e68875384afcbec43d3849d1`. This application does not import Toraneko at runtime.

| Component | Origin | Treatment |
| --- | --- | --- |
| Process-group cancellation | `services/api/src/toraneko/processes.py` | Ported process runner; tested cancellation and cleanup |
| Basic Pitch windowing and decoding | Toraneko audio provider, ultimately Spotify commit `fa5997af0a8210982619003269994a1be25eddf3` | Extracted model-independent decoder; [Apache-2.0 license](licenses/basic-pitch-APACHE-2.0.txt) and attribution retained |
| MuScriptor settings | Toraneko pinned baseline | Same source commit, medium checkpoint, CPU, beam 1, no sampling, CFG 1, batch 1, prelude forcing |
| Demucs and Beat This settings | Toraneko pinned baseline | Demucs 4.0.1 ft/6s; Beat This 1.1.0 final0, CPU |
| Evidence and job concepts | Toraneko domain and campaign code | Reimplemented with a smaller local SQLite/CAS contract |
| Harmony and fingering | TabToPitch engine | Duration-aware overlap interpretation, competing chord readings, explicit proposed positions and omissions |
| Project export reader | Toraneko `ArrangementDocument` 2.7.0 | Read-only, bounded JSON; unresolved references retained; no automatic authority promotion |

MuScriptor checkpoint SHA-256: `ac80adbdf85d87231735fd948af7013441c0afced316c4e9067fd5d8a7fb97ec`. Configuration SHA-256: `43e13a70fc9ae0af36b7447c06f3eac2282daeb69d79c1ff840ede7fdaa26a3b`.

Basic Pitch checkpoint SHA-256: `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec`.

The dependency resolution is [uv.lock](uv.lock). Source and model permissions are separate. MuScriptor's code is MIT; its weights are CC BY-NC 4.0. Spotify's adapted decoder is Copyright 2022 Spotify AB, licensed under Apache-2.0. See the application's [third-party notices](../THIRD_PARTY_NOTICES.md) and upstream sources before redistribution.

## Migration status

The importer preserves a supported export and identifies missing media without opening referenced paths. It does not yet reconstruct every Toraneko practice track, technique, timing edit, or accepted transcription revision in alphaTab. The legacy application must remain available until those replacement workflows and real-device audio checks pass. Do not archive its history, datasets, reports, or prior runs.
