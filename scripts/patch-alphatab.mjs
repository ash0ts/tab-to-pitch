import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// MPL-2.0 alphaTab modifications. See patches/README.md.
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(root, 'node_modules/@coderline/alphatab/dist');
const manifest = JSON.parse(await readFile(resolve(dist, '../package.json'), 'utf8'));
if (manifest.version !== '1.8.4') throw new Error(`Expected alphaTab 1.8.4, received ${manifest.version}`);
const marker = 'TAB_TO_PITCH_MEASURED_LABEL_V2';

function replaceOnce(source, from, to, name) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${name}: expected one patch anchor, found ${count}`);
  return source.replace(from, to);
}

function patch(source) {
  // 1.8.4's worker API getter recurses into itself. Its backing field is already
  // populated by the midiLoaded message handler. This fixes range/seek setup.
  if (source.includes('return this.loadedMidiInfo;')) {
    source = replaceOnce(source, 'return this.loadedMidiInfo;',
      'return this._loadedMidiInfo; // TAB_TO_PITCH_LOADED_MIDI_FIX', 'Worker MIDI getter');
  }
  if (!source.includes('TAB_TO_PITCH_WORKLET_CANCELLATION_FIX')) {
    source = replaceOnce(source, 'this.source.stop(0);',
      'try { this.source.stop(0); } catch (error) { if (error.name !== "InvalidStateError") throw error; } // TAB_TO_PITCH_WORKLET_CANCELLATION_FIX',
      'Pause before worklet startup');
    source = replaceOnce(source,
      'BrowserUiFacade.createAlphaSynthAudioWorklet(ctx, this._settings).then(() => {',
      'const pendingSource = this.source;\n\t\tBrowserUiFacade.createAlphaSynthAudioWorklet(ctx, this._settings).then(() => {\n\t\t\tif (this.source !== pendingSource || this.context !== ctx) return;',
      'Cancel stale async worklet startup');
  }
  if (source.includes(marker)) return source;
  // Works for the ESM core and the indented UMD distribution.
  source = replaceOnce(source, 'static globalNoteId = 0;', `// ${marker}\n\ttabToPitchLabel = null;\n\ttabToPitchWidthText = null;\n\tstatic globalNoteId = 0;`, 'Note field');
  const start = source.indexOf('class NoteSerializer');
  const end = source.indexOf('//#endregion', start);
  if (start < 0 || end < 0) throw new Error('NoteSerializer region missing');
  let serializer = source.slice(start, end);
  serializer = replaceOnce(serializer, 'o.set("fret", obj.fret);', 'o.set("fret", obj.fret);\n\t\to.set("tabtopitchlabel", obj.tabToPitchLabel);\n\t\to.set("tabtopitchwidthtext", obj.tabToPitchWidthText);', 'Note serialization');
  serializer = replaceOnce(serializer, 'case "fret":', 'case "tabtopitchlabel":\n\t\t\t\tobj.tabToPitchLabel = typeof v === "string" ? v : null;\n\t\t\t\treturn true;\n\t\t\tcase "tabtopitchwidthtext":\n\t\t\t\tobj.tabToPitchWidthText = typeof v === "string" ? v : null;\n\t\t\t\treturn true;\n\t\t\tcase "fret":', 'Note deserialization');
  source = source.slice(0, start) + serializer + source.slice(end);
  source = replaceOnce(source,
    'this._noteString = n.isDead ? "x" : fret.toString();',
    'this._noteString = n.isDead ? "x" : (n.tabToPitchLabel ?? fret.toString());',
    'Measured label');
  source = replaceOnce(source,
    'this._noteString = `(${(n.tieOrigin.fret - n.beat.voice.bar.staff.transpositionPitch).toString()})`;',
    'this._noteString = `(${n.tabToPitchLabel ?? (n.tieOrigin.fret - n.beat.voice.bar.staff.transpositionPitch).toString()})`;',
    'Continuation label');
  source = replaceOnce(source,
    'this.noteStringWidth = this.renderer.scoreRenderer.canvas.measureText(this._noteString + (hasTrill ? " " : "")).width;',
    'this.noteStringWidth = this.renderer.scoreRenderer.canvas.measureText(this._noteString + (hasTrill ? " " : "")).width;\n\t\t\tif (n.tabToPitchWidthText) this.noteStringWidth = Math.max(this.noteStringWidth, this.renderer.scoreRenderer.canvas.measureText(n.tabToPitchWidthText).width);',
    'Stable mask envelope');
  return source;
}

for (const file of ['alphaTab.core.mjs', 'alphaTab.js']) {
  const path = resolve(dist, file);
  await writeFile(path, patch(await readFile(path, 'utf8')));
}

// All ESM entry points (main, worker, worklet) import this same patched core.
// Replace the minified aliases with the corresponding readable patched variants;
// the production Vite build performs its own minification.
for (const [from, to] of [
  ['alphaTab.core.mjs', 'alphaTab.core.min.mjs'],
  ['alphaTab.js', 'alphaTab.min.js'],
  ['alphaTab.mjs', 'alphaTab.min.mjs'],
  ['alphaTab.worker.mjs', 'alphaTab.worker.min.mjs'],
  ['alphaTab.worklet.mjs', 'alphaTab.worklet.min.mjs'],
]) await copyFile(resolve(dist, from), resolve(dist, to));

// Vite enumerates public files before buildStart plugins copy new assets.
// Materialize them during setup so a fresh dev server serves binary data.
for (const directory of ['font', 'soundfont']) {
  await cp(resolve(dist, directory), resolve(root, 'public', directory), { recursive: true });
}

// Publish the complete unminified modified distribution and the patch source
// alongside every build, so the deployed app supplies its MPL source changes.
const sourceDir = resolve(root, 'public/vendor/alphatab-source');
await mkdir(sourceDir, { recursive: true });
for (const file of ['alphaTab.core.mjs', 'alphaTab.js', 'alphaTab.mjs', 'alphaTab.worker.mjs', 'alphaTab.worklet.mjs']) {
  await copyFile(resolve(dist, file), resolve(sourceDir, file));
}
await copyFile(resolve(dist, '../LICENSE'), resolve(sourceDir, 'LICENSE'));
await copyFile(fileURLToPath(import.meta.url), resolve(sourceDir, 'patch-alphatab.mjs'));
await copyFile(resolve(root, 'patches/README.md'), resolve(sourceDir, 'README.md'));
console.log('alphaTab 1.8.4: measured labels patched in ESM/UMD and all entry variants; source published.');
