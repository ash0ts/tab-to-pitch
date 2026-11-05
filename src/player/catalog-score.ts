import { generateVoicings, parseChordSymbol } from '../engine/harmony';
import { catalogSourceId, passageReady, type Passage } from '../songs/catalog';

/** A new accompaniment score, never a transcription of the recording. */
export function catalogScore(p: Passage) {
  if (!passageReady(p)) throw new Error('Review the passage before opening a graded arrangement.');
  const guitar: string[] = [],
    bass: string[] = [];
  for (const c of p.chords) {
    const chord = parseChordSymbol(c.symbol)!;
    const shape = generateVoicings(chord, [64, 59, 55, 50, 45, 40], 0, {
      minFret: 0,
      maxFret: 12,
      maxSpan: 4,
      voiceCount: 4,
      maxCandidates: 1,
    }).voicings[0];
    if (!shape) throw new Error('No accompaniment shape fits the catalog constraints.');
    const notes = `(${shape.notes.map((n) => `${n.position.fret}.${n.position.string}`).join(' ')})`;
    guitar.push(
      `\\ts ${c.beats} 4 ${Array.from({ length: c.beats }, () => `${notes}.4`).join(' ')}`,
    );
    const rootFret = (chord.rootPitchClass - 4 + 12) % 12;
    bass.push(
      `\\ts ${c.beats} 4 ${Array.from({ length: c.beats }, () => `${rootFret}.4.4`).join(' ')}`,
    );
  }
  return {
    sourceId: catalogSourceId(p),
    alphaTex: `\\title "Listening accompaniment"\n\\artist "TabToPitch synthesized teaching example"\n\\tempo ${p.bpm}\n\\track "Guitar" \\instrument 25 \\tuning E4 B3 G3 D3 A2 E2\n. ${guitar.join(' | ')}\n\\track "Bass" \\instrument 33 \\tuning G2 D2 A1 E1\n${bass.join(' | ')}`,
  };
}
