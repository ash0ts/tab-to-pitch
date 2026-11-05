import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as alphaTab from '@coderline/alphatab';
import { adaptScore, sourceNoteId, sourceSpelling } from '../src/engine/adapter';
import { applyPitchLabels, type PresentedNote } from '../src/engine/presentation';
import { DEMO_ALPHATEX } from '../src/player/demo';
import { measurePlaybackRange, notePlaybackTick } from '../src/player/timeline';
import { createExerciseBank } from '../src/engine/exercises';

function notes(score: alphaTab.model.Score): alphaTab.model.Note[] {
  return score.tracks.flatMap((track) =>
    track.staves.flatMap((staff) =>
      staff.bars.flatMap((bar) =>
        bar.voices.flatMap((voice) => voice.beats.flatMap((beat) => beat.notes)),
      ),
    ),
  );
}

function render(score: alphaTab.model.Score, width = 900) {
  const settings = new alphaTab.Settings();
  settings.core.engine = 'svg';
  settings.core.enableLazyLoading = false;
  settings.core.includeNoteBounds = true;
  settings.display.staveProfile = alphaTab.StaveProfile.Tab;
  const renderer = new alphaTab.rendering.ScoreRenderer(settings);
  renderer.width = width;
  let svg = '';
  renderer.partialRenderFinished.on((event) => {
    svg += String(event.renderResult ?? '');
  });
  renderer.renderScore(score, [0]);
  const bounds = notes(score)
    .filter((note) => note.beat.voice.bar.staff.track.index === 0)
    .map((note) => {
      const bound = renderer.boundsLookup
        ?.findBeat(note.beat)
        ?.notes?.find((item) => item.note.id === note.id)?.noteHeadBounds;
      return bound ? { x: bound.x, y: bound.y, w: bound.w, h: bound.h } : null;
    });
  renderer.destroy();
  return { svg, bounds };
}

describe('measured alphaTab presentation', () => {
  it('renders actual SPN text in alphaTab SVG with wider allocated note bounds', () => {
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex('. 7.6.4 8.6.4 9.6.4 10.6.4');
    const native = render(score);
    applyPitchLabels(score, { mode: 'pitch', showOctaves: true });
    const pitched = render(score);
    expect(pitched.svg).toContain('>B2</text>');
    expect(pitched.svg).toContain('>C3</text>');
    expect(pitched.svg).not.toContain('>7</text>');
    expect(pitched.bounds[0]!.w).toBeGreaterThan(native.bounds[0]!.w);
    expect(pitched.bounds[1]!.x).toBeGreaterThan(pitched.bounds[0]!.x + pitched.bounds[0]!.w);
  });

  it('defaults to note names and preserves bounds when octaves are toggled', () => {
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex('. 7.6.4 8.6.4');
    applyPitchLabels(score, { mode: 'pitch', fretHint: true });
    const names = render(score);
    expect(names.svg).toContain('>B·7</text>');
    expect(names.svg).not.toContain('>B2·7</text>');
    const pitches = notes(score).map((note) => note.realValue);
    applyPitchLabels(score, { mode: 'pitch', fretHint: true, showOctaves: true });
    const octaves = render(score);
    expect(octaves.svg).toContain('>B2·7</text>');
    expect(octaves.bounds).toEqual(names.bounds);
    expect(notes(score).map((note) => note.realValue)).toEqual(pitches);
  });

  it('serializes visible and reserved text through the worker score payload', () => {
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex('. 7.6.4');
    applyPitchLabels(score, { mode: 'pitch', fretHint: true, showOctaves: true });
    const restored = alphaTab.model.JsonConverter.jsonToScore(
      alphaTab.model.JsonConverter.scoreToJson(score),
    );
    const note = notes(restored)[0] as PresentedNote;
    expect(note.tabToPitchLabel).toBe('B2·7');
    expect(note.tabToPitchWidthText).toBe('(B2·7)');
    expect(render(restored).svg).toContain('>B2·7</text>');
  });

  it('keeps all note bounds fixed when a quiz masks and reveals labels', () => {
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX);
    applyPitchLabels(score, { mode: 'pitch', fretHint: true, showOctaves: true });
    const revealed = render(score, 700);
    applyPitchLabels(score, {
      mode: 'pitch',
      maskedNoteIds: new Set(notes(score).map(sourceNoteId)),
    });
    const masked = render(score, 700);
    expect(masked.svg).toContain('>?</text>');
    expect(masked.svg).not.toContain('>D4·3</text>');
    expect(masked.bounds).toEqual(revealed.bounds);
  });

  it('reserves natural-harmonic and ghost decorations when masking a dense phrase', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex(
      '. 7.6.16 8.6.16 9.6.16 10.6.16 11.6.16 12.6.16 13.6.16 14.6.16',
    );
    const first = notes(source)[0]!;
    first.harmonicType = alphaTab.model.HarmonicType.Natural;
    first.harmonicValue = 7;
    first.isGhost = true;
    const harmonic = notes(source)[1]!;
    harmonic.harmonicType = alphaTab.model.HarmonicType.Natural;
    harmonic.harmonicValue = 7;
    applyPitchLabels(source, { mode: 'pitch', fretHint: true });
    const shown = render(source, 500);
    applyPitchLabels(source, {
      mode: 'pitch',
      maskedNoteIds: new Set(notes(source).map(sourceNoteId)),
    });
    const hidden = render(source, 500);
    expect(hidden.bounds).toEqual(shown.bounds);
  });

  it('leaves pitches, source frets and effect flags unchanged in all views', () => {
    const score = alphaTab.importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX);
    const snapshot = () =>
      notes(score).map((note) => [
        note.realValue,
        note.fret,
        note.string,
        note.isTieDestination,
        note.harmonicType,
      ]);
    const before = snapshot();
    for (const mode of ['pitch', 'fret'] as const) {
      applyPitchLabels(score, {
        mode,
        fretHint: true,
        maskedNoteIds: new Set([sourceNoteId(notes(score)[0])]),
      });
      expect(snapshot()).toEqual(before);
    }
  });

  it('all browser entry variants use the patched core and readable source is published', () => {
    for (const name of [
      'alphaTab.core.mjs',
      'alphaTab.core.min.mjs',
      'alphaTab.js',
      'alphaTab.min.js',
    ]) {
      const source = readFileSync(`node_modules/@coderline/alphatab/dist/${name}`, 'utf8');
      expect(source).toContain('TAB_TO_PITCH_MEASURED_LABEL_V2');
      expect(source).not.toContain('return this.loadedMidiInfo;');
      expect(source).toContain('TAB_TO_PITCH_WORKLET_CANCELLATION_FIX');
    }
    for (const name of [
      'alphaTab.mjs',
      'alphaTab.worker.mjs',
      'alphaTab.worklet.mjs',
      'alphaTab.min.mjs',
      'alphaTab.worker.min.mjs',
      'alphaTab.worklet.min.mjs',
    ]) {
      expect(readFileSync(`node_modules/@coderline/alphatab/dist/${name}`, 'utf8')).toContain(
        './alphaTab.core.mjs',
      );
    }
    expect(readFileSync('public/vendor/alphatab-source/alphaTab.core.mjs', 'utf8')).toContain(
      'tabToPitchWidthText',
    );
  });
});

describe('alphaTab adapter fidelity', () => {
  it('preserves tuning order, concert pitches, track identity and independent bass durations', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX);
    const score = adaptScore(source, 'fixture');
    expect(score.tracks[0].tuningMidi).toEqual([64, 59, 55, 50, 45, 40]);
    expect(
      score.tracks[0].notes
        .slice(0, 4)
        .map((note) => note.soundingMidi)
        .sort(),
    ).toEqual([47, 50, 55, 62]);
    expect(score.tracks[0].notes[0].position).toEqual({ string: 5, fret: 2 });
    expect(score.tracks[1].notes[0].soundingMidi).toBe(35);
    expect(score.tracks[1].notes[0].durationTicks).toBe(3840);
    expect(score.tracks[0].notes[0].durationTicks).toBe(960);
    expect(score.measures).toHaveLength(4);
  });

  it('round-trips an actual exported GP7 container through the binary importer', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX);
    const bytes = new alphaTab.exporter.Gp7Exporter().export(source);
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
    const restored = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes);
    const first = adaptScore(source, 'fixture');
    const second = adaptScore(restored, 'fixture');
    const musicalData = (document: typeof first) =>
      document.tracks.map((track) => ({
        tuning: track.tuningMidi,
        capo: track.capo,
        notes: track.notes.map((note) => ({
          position: note.position,
          pitch: note.soundingMidi,
          tick: note.onsetTicks,
          duration: note.durationTicks,
        })),
      }));
    expect(musicalData(second)).toEqual(musicalData(first));
  });

  it('preserves reentrant strings, capo, low non-fretted pitches and tie exclusions', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex('. 0.1.4 2.2.4');
    const staff = source.tracks[0].staves[0];
    staff.stringTuning.tunings = [64, 55, 59, 50, 45, 40];
    staff.capo = 2;
    const all = notes(source);
    all[1].isTieDestination = true;
    all[1].tieOrigin = all[0];
    const result = adaptScore(source, 'fixture');
    expect(result.tracks[0].tuningMidi).toEqual([64, 55, 59, 50, 45, 40]);
    expect(result.tracks[0].notes[0].soundingMidi).toBe(66);
    expect(result.tracks[0].notes[1].eligible).toBe(false);
    expect(result.tracks[0].notes[1].effects.tieOriginId).toBe(result.tracks[0].notes[0].id);
    const low = all[0];
    low.string = -1;
    low.fret = -1;
    low.octave = 3;
    low.tone = 0;
    expect(adaptScore(source, 'fixture').tracks[0].notes[0].soundingMidi).toBe(36);
    expect(adaptScore(source, 'fixture').tracks[0].notes[0].position).toBeNull();
  });

  it('keeps one attack sounding through a source tie chain across measures', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex('. 3.1.1 | -.1.1 | -.1.1');
    const result = adaptScore(source, 'tied').tracks[0].notes;
    expect(result[0].durationTicks).toBe(3 * 3840);
    expect(result.map((note) => note.eligible)).toEqual([true, false, false]);
    expect(result[1].effects.tieOriginId).toBe(result[0].id);
    expect(result[2].effects.tieOriginId).toBe(result[1].id);
  });

  it('does not grade a stable pitch through an articulated tie continuation', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex('. 3.1.1 | -.1.1');
    const continuation = notes(source)[1]!;
    continuation.addBendPoint(new alphaTab.model.BendPoint(0, 0));
    continuation.addBendPoint(new alphaTab.model.BendPoint(60, 4));
    const result = adaptScore(source, 'tied-bend').tracks[0]!.notes;
    expect(result[0]!.durationTicks).toBe(2 * 3840);
    expect(result[0]!.eligible).toBe(false);
    expect(result[0]!.effects.unsupported).toContain('articulated tie continuation');
    expect(result[1]!.effects.bend).toEqual([
      { offset: 0, semitones: 0 },
      { offset: 1, semitones: 2 },
    ]);
  });

  it('uses staccato duration and withholds chord claims when native sustain timing is unqualified', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex(DEMO_ALPHATEX);
    notes(source)[0]!.isStaccato = true;
    let document = adaptScore(source, 'staccato');
    expect(document.tracks[0]!.notes[0]!.durationTicks).toBe(480);
    expect(document.tracks[0]!.notes[0]!.effects.staccato).toBe(true);
    expect(document.tracks[0]!.harmonySupported).toBe(true);
    notes(source)[0]!.isLetRing = true;
    document = adaptScore(source, 'let-ring');
    expect(document.tracks[0]!.harmonySupported).toBe(false);
    expect(document.tracks[0]!.notes[0]!.effects.letRing).toBe(true);
    const bank = createExerciseBank(document, 't0');
    expect(bank.some((exercise) => exercise.kind === 'note-name')).toBe(true);
    expect(bank.some((exercise) => exercise.kind === 'triad-role')).toBe(false);
    expect(
      document.warnings?.some((message) => message.includes('chord analysis is unavailable')),
    ).toBe(true);
  });

  it('maps expanded repeat occurrences, alternate endings and tempo changes from the native transport', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex(
      String.raw`\tempo 90 . \ro 0.1.1 | \tempo 120 \ae 1 \rc 2 1.1.1 | \ae 2 2.1.1`,
    );
    const result = adaptScore(source, 'repeats');
    expect(result.playbackOccurrences).toEqual([
      { measureIndex: 0, occurrence: 0, startTick: 0, endTick: 3840 },
      { measureIndex: 1, occurrence: 0, startTick: 3840, endTick: 7680 },
      { measureIndex: 0, occurrence: 1, startTick: 7680, endTick: 11520 },
      { measureIndex: 2, occurrence: 0, startTick: 11520, endTick: 15360 },
    ]);
    expect(result.tempoEvents?.slice(0, 3)).toEqual([
      { tick: 0, bpm: 90, measureIndex: 0 },
      { tick: 3840, bpm: 120, measureIndex: 1 },
      { tick: 7680, bpm: 90, measureIndex: 0 },
    ]);
    expect(result.tracks[0].notes.map((note) => note.onsetTicks)).toEqual([0, 3840, 7680]);
    expect(notePlaybackTick(result, result.tracks[0].notes[0], 1)).toBe(7680);
    expect(notePlaybackTick(result, result.tracks[0].notes[2])).toBe(11520);
    expect(measurePlaybackRange(result, 0, 2)).toEqual({ startTick: 0, endTick: 15360 });
    expect(measurePlaybackRange(result, 0, 1, 1)).toBeNull();
  });

  it('preserves explicit enharmonic spelling and keeps unsupported chromatic spelling unknown', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex('. 9.6.4');
    const note = notes(source)[0]; // MIDI 49: C#3 or Db3.
    expect(sourceSpelling(note)).toEqual({ spelling: null });
    note.accidentalMode = alphaTab.model.NoteAccidentalMode.ForceFlat;
    expect(sourceSpelling(note)).toEqual({ spelling: 'Db3', spellingSource: 'explicit' });
    applyPitchLabels(source, { mode: 'pitch', showOctaves: true });
    expect(render(source).svg).toContain('>Db3</text>');
    note.accidentalMode = alphaTab.model.NoteAccidentalMode.Default;
    note.beat.voice.bar.keySignature = alphaTab.model.KeySignature.D;
    expect(sourceSpelling(note)).toEqual({ spelling: 'C#3', spellingSource: 'key-context' });
  });

  it('preserves accidental octave boundaries and does not mistake hiding an accidental for spelling evidence', () => {
    const source = alphaTab.importer.ScoreLoader.loadAlphaTex('. 1.2.4 0.2.4');
    const [c, b] = notes(source);
    c!.accidentalMode = alphaTab.model.NoteAccidentalMode.ForceSharp;
    b!.accidentalMode = alphaTab.model.NoteAccidentalMode.ForceFlat;
    expect(sourceSpelling(c!)).toEqual({ spelling: 'B#3', spellingSource: 'explicit' });
    expect(sourceSpelling(b!)).toEqual({ spelling: 'Cb4', spellingSource: 'explicit' });
    c!.accidentalMode = alphaTab.model.NoteAccidentalMode.ForceNone;
    expect(sourceSpelling(c!)).toEqual({ spelling: 'C4', spellingSource: 'key-context' });
    const chromatic = alphaTab.importer.ScoreLoader.loadAlphaTex('. 2.2.4');
    const sharp = notes(chromatic)[0]!;
    sharp.accidentalMode = alphaTab.model.NoteAccidentalMode.ForceNone;
    expect(sourceSpelling(sharp)).toEqual({ spelling: null });
    sharp.beat.voice.bar.keySignature = alphaTab.model.KeySignature.D;
    expect(sourceSpelling(sharp)).toEqual({ spelling: 'C#4', spellingSource: 'key-context' });
  });
});
