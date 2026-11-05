# Third-party notices

alphaTab 1.8.4 is copyright Daniel Kuschny and contributors, licensed under MPL-2.0. This project modifies its note-label measurement, serialization, and specific playback bugs. Exact modified JavaScript source, license, and patch script ship in `public/vendor/alphatab-source/` and in the built application at `/vendor/alphatab-source/`. See [patch provenance](patches/README.md).

Bravura is distributed under the SIL Open Font License; its license and font log are in `public/font/`. The Sonivox SoundFont is distributed with its upstream license in `public/soundfont/`. These assets are copied from the pinned alphaTab package by the build patch script.

DM Sans and Libre Caslon Display are distributed under their SIL Open Font Licenses in `public/fonts/`. Font files were obtained from the Google Fonts repository. They are served locally.

The original TabToPitch study in `src/player/demo.ts` and original score fixtures authored for this repository are dedicated to the public domain under CC0-1.0. Imported user arrangements retain their own rights and are never bundled automatically.

Other dependencies retain the licenses distributed in their packages. No ownership or license for third-party arrangements is implied by support for their file formats.

Pitchy 4.1.0 (Ian Prime and contributors) is licensed under 0BSD. fft.js 4.0.4 (Fedor Indutny and contributors) is licensed under MIT. Their license texts are preserved under `public/vendor/live-input/` and ship with the built application. Live DSP does not bundle a Jam Origin product or transcription-model weights.

## Local audio research


The [port ledger](audio_worker/PROVENANCE.md) records the Toraneko source revision and changed components. MuScriptor source is MIT; its weights are CC BY-NC 4.0 and remain restricted to permitted research use. Demucs 4.0.1 and Beat This 1.1.0 retain their MIT source terms. Model permissions and training-data limitations remain upstream.

The adapted Basic Pitch decoder is Copyright 2022 Spotify AB, licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). It derives from Spotify commit `fa5997af0a8210982619003269994a1be25eddf3`, through Toraneko, with application dependencies removed. It is provided without warranties under that license. The ONNX checkpoint retains the upstream project terms. FFmpeg is supplied by the host and its license depends on its build configuration.
