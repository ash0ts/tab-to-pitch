# alphaTab measured pitch labels

This application uses `@coderline/alphatab` **1.8.4**, published under MPL-2.0 by Daniel Kuschny and contributors. Upstream tag `v1.8.4` resolves to commit `022a45c8e42370f9e12e68949d11eada370da83d` in https://github.com/CoderLine/alphaTab.

`scripts/patch-alphatab.mjs` changes the published unminified JavaScript distribution. `Note` gains two nullable presentation fields, `tabToPitchLabel` and `tabToPitchWidthText`. `NoteSerializer` preserves them across worker messages. `NoteNumberGlyph.doLayout` measures the visible label and reserves the larger of its width and the reveal text width. Normal layout, line clearance, note bounds and interaction include that space; quiz masks do not move subsequent notes. The patch preserves the underlying fret, string, pitch, tie and playback data. Dead notes remain `x`; native tie visibility and ghost/harmonic decoration remain active.

Run `node scripts/patch-alphatab.mjs` after installation and before development or builds. It refuses any other package version and checks each patch anchor. Repeated execution is safe. ESM main, rendering worker and audio worklet import the patched shared core; the UMD distribution is patched too. Minified aliases receive the readable patched entry variants because Vite performs production minification.

The package's `AlphaSynthWebWorkerApi.loadedMidiInfo` getter recursively returns itself in 1.8.4. The patch corrects it to return the existing `_loadedMidiInfo` field populated by the worker message handler. Browser verification reproduced a stack overflow when setting a playback range without this correction. Setup also copies the font and SoundFont assets before Vite enumerates its public directory.

Browser verification also reproduced a pause during asynchronous AudioWorklet startup. The patch permits stopping an audio source that has not started yet and ignores a completed worklet setup if its original source was paused, replaced or destroyed. Other stop errors still propagate. This prevents a rapid play/pause or view change from throwing or starting an obsolete source.

The complete modified unminified distributions, MPL license and exact patch script are served at `/vendor/alphatab-source/`. These JavaScript files are the source form modified by this project. Upstream TypeScript source and build instructions remain available at the commit above. Retain these sources and notices when redistributing the application.

No upstream files are relicensed. The application demo is original material dedicated to the public domain under CC0-1.0. Bravura retains its SIL Open Font License 1.1 at `/font/Bravura-OFL.txt`. The bundled SONiVOX SoundFont retains its upstream Apache 2.0 notice at `/soundfont/LICENSE` and provenance notes at `/soundfont/README.md`. Setup copies those notices with the unchanged assets.
