import { defineChord, scaleTones } from '../engine/harmony';

/** Original TabToPitch study. Dedicated to the public domain, CC0-1.0. */
export const DEMO_ALPHATEX = String.raw`\title "A shape, two meanings"
\artist "TabToPitch · original CC0 study"
\tempo 92
\track "Guitar" \instrument 25 \tuning E4 B3 G3 D3 A2 E2
. (2.5 0.4 0.3 3.2).4 2.5.4 0.4.4 0.3.4 |
(0.1 0.2 0.3).4 2.4.4 2.3.4 0.2.4 |
7.1.8 8.1.8 10.1.8 7.2.8 8.2.4 7.3.4 |
(7.1 8.2 7.3 9.4).4 5.2.4 3.2.4 2.3.4
\track "Bass" \instrument 33 \tuning G2 D2 A1 E1
2.3.1 | 0.4.1 | 3.4.1 | 2.3.1`;

export const DEMO_SOURCE_ID = 'tabtopitch-original-study-v1';

/** Original accompaniment lesson, CC0-1.0. Symbols are authored facts, not inferred labels. */
export const PROGRESSION_SOURCE_ID = 'tabtopitch-progression-study-v1';
export const PROGRESSION_SYMBOLS = ['Dm7', 'G7', 'Cmaj7', 'Am7'] as const;
export const PROGRESSION_ALPHATEX = String.raw`\title "One progression, many places"
\artist "TabToPitch · original CC0 study"
\tempo 84
\track "Guitar" \instrument 25 \tuning E4 B3 G3 D3 A2 E2
. (1.1 1.2 2.3 0.4).1 | (1.1 0.2 0.3 0.4 2.5 3.6).1 |
(0.1 0.2 0.3 2.4 3.5).1 | (0.1 1.2 0.3 2.4 0.5).1
\track "Bass" \instrument 33 \tuning G2 D2 A1 E1
0.2.1 | 3.4.1 | 3.3.1 | 0.3.1`;

export function progressionStudy(tonic = 'C') {
  const tones = scaleTones({ tonic, mode: 'ionian' });
  if (tones.length !== 7) throw new Error('Choose a supported major key.');
  const shift = tones[0]!.pitchClass;
  const symbols = [1, 4, 0, 5].map(
    (degree, index) =>
      defineChord(tones[degree]!.noteName, (['m7', '7', 'maj7', 'm7'] as const)[index]!)!.symbol,
  );
  // Every fretted note, including the bass track, moves by the same semitone distance.
  const alphaTex = PROGRESSION_ALPHATEX.replace(
    /(\d+)\.([1-6])(?=[\s).])/g,
    (_, fret: string, string: string) => `${Number(fret) + shift}.${string}`,
  );
  return {
    symbols,
    alphaTex,
    sourceId: tonic === 'C' ? PROGRESSION_SOURCE_ID : `${PROGRESSION_SOURCE_ID}:${tonic}`,
  };
}
export function progressionStudyTonic(sourceId: string): string | null {
  if (sourceId === PROGRESSION_SOURCE_ID) return 'C';
  return sourceId.startsWith(`${PROGRESSION_SOURCE_ID}:`)
    ? sourceId.slice(PROGRESSION_SOURCE_ID.length + 1)
    : null;
}

/** Original homework accompaniment, CC0-1.0. One chord per four-beat bar. */
export const HOMEWORK_SOURCE_ID = 'tabtopitch-homework-study-v1';
export const HOMEWORK_SYMBOLS = ['C', 'F', 'G', 'C', 'G7', 'Cmaj7'] as const;
export const HOMEWORK_ALPHATEX = String.raw`\title "A familiar chord, a wider neck"
\artist "TabToPitch · original CC0 study"
\tempo 84
\track "Guitar" \instrument 25 \tuning E4 B3 G3 D3 A2 E2
. (0.1 1.2 0.3).1 | (1.1 1.2 2.3).1 | (3.1 3.2 4.3).1 | (3.1 5.2 5.3).1 | (1.1 0.2 0.3 0.4).1 | (0.1 0.2 0.3 3.5).1
\track "Bass" \instrument 33 \tuning G2 D2 A1 E1
3.3.1 | 1.4.1 | 3.4.1 | 3.3.1 | 3.4.1 | 3.3.1`;
