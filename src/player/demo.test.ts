import { describe, expect, it } from 'vitest';
import { importer } from '@coderline/alphatab';
import { parseChordSymbol } from '../engine/harmony';
import { progressionStudy, progressionStudyTonic, PROGRESSION_ALPHATEX } from './demo';

describe('transposed original progression study', () => {
  it('moves guitar and bass together through all twelve keys, retaining rhythm', () => {
    const original = importer.ScoreLoader.loadAlphaTex(PROGRESSION_ALPHATEX);
    for (const tonic of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']) {
      const study = progressionStudy(tonic);
      expect(progressionStudyTonic(study.sourceId)).toBe(tonic);
      const score = importer.ScoreLoader.loadAlphaTex(study.alphaTex);
      for (let index = 0; index < 4; index++) {
        const chord = parseChordSymbol(study.symbols[index]!)!;
        const guitar = score.tracks[0]!.staves[0]!.bars[index]!.voices[0]!.beats[0]!;
        const bass = score.tracks[1]!.staves[0]!.bars[index]!.voices[0]!.beats[0]!;
        expect([...new Set(guitar.notes.map((note) => note.realValue % 12))].sort()).toEqual(
          chord.tones.map((tone) => tone.pitchClass).sort(),
        );
        expect(bass.notes[0]!.realValue % 12).toBe(chord.rootPitchClass);
        expect(guitar.playbackDuration).toBe(
          original.tracks[0]!.staves[0]!.bars[index]!.voices[0]!.beats[0]!.playbackDuration,
        );
        expect(score.masterBars[index]!.tempoAutomations.map((item) => item.value)).toEqual(
          original.masterBars[index]!.tempoAutomations.map((item) => item.value),
        );
      }
    }
  });
});
