# Ear-lab dataset cards

The campaign manifest is the authoritative row list. It records each selected recording and reference SHA-256, excerpt boundaries, performer group, partition, prior-inspection status, and exclusion. The protocol fixes six-second excerpts before inspecting new model output. No raw audio is published to Forge.

| Source | Labels and use | Limits and permissions |
| --- | --- | --- |
| [GuitarSet 1.1.0](https://zenodo.org/records/3371780) | Microphone recordings with hexaphonic-pickup-derived note annotations. Six selected accompaniment recordings, one per performer; two training, two calibration, two test. MIDI pitch rounding is derived. | CC BY 4.0. Six performers and constrained material. Three documented annotation errata are excluded. Previous Toraneko recordings are excluded from fresh selection. Training-set overlap with transcription models is unknown. |
| [GAPS](https://huggingface.co/datasets/xavriley/GAPS) | Recorded classical guitar with dataset-aligned MIDI. Six selected recordings, each from a distinct performer group. Alignment and MIDI are reference annotations, not new manual labels made for this experiment. | The publisher's card declares MIT; recording rights and reuse conditions must be considered separately. This campaign keeps media local and publishes derived metrics and hashes only. It does not establish generalization to amplified bands or commercial mixes. |
| [Guitar-TECHS](https://guitar-techs.github.io/) | Two previously inspected P3 musical excerpts with synchronized MIDI-pickup note references, decoded by Toraneko's historical reference adapter. Used as regression checks. | Dataset release CC BY 4.0. These two excerpts do not establish technique recognition or all-chord conformance. No fresh holdout is claimed for this subset. |
| [Slakh2100](http://www.slakh.com/) | Two previously inspected synthesized mixtures with MIDI and reference stems. Notes are synthesis references, not human-performer annotations. Used as mixture regressions. | CC BY 4.0 release. Synthetic timbres, limited selected source songs, and prior inspection restrict conclusions. The local subset does not supply a fresh Slakh holdout. |
| Original G7→Cmaj7 study | Authored waveform and separate symbolic reference. Development, browser demonstration, corrupted-evidence tests, and independent answer contract. | CC0 original example. A simple synthesized chord pair does not represent real guitar timbre, articulation, or teaching outcomes. |

## Derived labels

The note matcher uses exact rounded MIDI pitch and at most 50 ms onset difference with one-to-one assignment. Offset matching is reported separately. The binary reliability target comes from that match, not model agreement. A matching reference is still subject to dataset annotation quality.

Pitch-class overlap and lowest-pitch accuracy are computed from overlapping durations on 100 ms slices. They are not reviewed chord-symbol or ensemble-bass labels. Guitar fingering existence uses standard tuning and frets 0–24. It does not recover the original performer's position or evaluate comfort.

GuitarSet's source annotations carry string identity; this first audio scorer uses note accuracy rather than claiming inferred string accuracy. Guitar-TECHS technique annotations and Slakh stem-isolation quality are not silently substituted with note F1. Those dimensions require separate scorers and are unavailable in this report.

## Grouping and audit

All excerpts and transpositions from a recording belong together. Fresh groups exclude every audio path in the prior Toraneko manifests. GuitarSet performers 00–01 train, 02–03 calibrate, and 04–05 test. GAPS uses distinct performer groups selected deterministically from available uninspected recordings. The manifest stores opaque performer-group hashes for GAPS.

The four fresh test recordings support only a small local comparison. Recording-level bootstrap intervals describe this cohort; they do not compensate for its size or establish population-wide performance. The calibration partition is reported separately without tuning thresholds or regularization on it. Actual source/checksum membership and exclusions are retained in the manifest rather than reconstructed from article summaries.

The excerpt reference retains note onsets within the selected interval and clips their ends. Notes already sustaining at the start are excluded; duration-based measures therefore cover that selected cohort rather than full boundary harmony.
