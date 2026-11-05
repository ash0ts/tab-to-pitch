import { importer, model } from '@coderline/alphatab';
import type { TimedStudy } from '../engine/musicianship';

/** A separate original stimulus, never assigned imported source-note identities. */
export function buildPracticeScore(study: TimedStudy): model.Score {
  if (
    study.cells.length !== 16 ||
    study.tempo < 40 ||
    study.tempo > 180 ||
    !Number.isFinite(study.tempo)
  )
    throw new Error('The original study must contain two complete bars.');
  const tuning = [64, 59, 55, 50, 45, 40];
  const cells = study.cells.map((midi) => {
    if (midi === null) return 'r.8';
    if (study.texture === 'chords') {
      if (midi !== 55 && midi !== 60) throw new Error('Unsupported harmonic attack.');
      return midi === 55 ? '(1.1 0.2 0.3 0.4 2.5 3.6).8' : '(0.1 0.2 0.3 2.4 3.5).8';
    }
    if (!Number.isInteger(midi)) throw new Error('Unsupported study pitch.');
    const string = tuning.findIndex((open) => midi >= open && midi - open <= 12);
    if (string === -1) throw new Error('No supported guitar position for this study.');
    return `${midi - tuning[string]!}.${string + 1}.8`;
  });
  const score = importer.ScoreLoader.loadAlphaTex(
    `\\title "Original two-bar study"\n\\tempo ${study.tempo}\n\\track "Study" \\instrument 25 \\tuning E4 B3 G3 D3 A2 E2\n. ${cells.slice(0, 8).join(' ')} | ${cells.slice(8).join(' ')}${study.texture === 'melody' ? '\n\\track "Accompaniment" \\instrument 25 \\tuning E4 B3 G3 D3 A2 E2\n. (1.1 0.2 0.3 0.4 2.5 3.6).1 | (0.1 0.2 0.3 2.4 3.5).1' : ''}`,
  );
  for (const beat of score.tracks[0]!.staves[0]!.bars.flatMap((bar) => bar.voices[0]!.beats)) {
    beat.dynamics = study.dynamics === 'f' ? model.DynamicValue.F : model.DynamicValue.MP;
    for (const note of beat.notes) note.isStaccato = study.articulation === 'staccato';
  }
  return score;
}
