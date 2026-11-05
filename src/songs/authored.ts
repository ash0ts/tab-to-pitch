import type { Passage, Recording } from './catalog.js';

/** Original short progressions. Families, including their transpositions, stay in one split. */
const studies = [
  ['dev-01', 'C', 'C F G C'],
  ['dev-02', 'G', 'G Em C D'],
  ['dev-03', 'D', 'D G Em A'],
  ['dev-04', 'F', 'F Dm Gm C'],
  ['dev-05', 'A', 'A D A E'],
  ['dev-06', 'E', 'E F#m B E'],
  ['eval-01', 'C', 'C Am Dm F'],
  ['eval-02', 'G', 'G Bm C D'],
  ['eval-03', 'D', 'D Bm G Em'],
  ['eval-04', 'F', 'F Bb C Dm'],
  ['eval-05', 'A', 'A E Bm D'],
  ['eval-06', 'E', 'E A C#m B'],
  ['eval-07', 'C', 'Dm7 G7 Em7 Am7'],
  ['eval-08', 'G', 'Am7 D7 Gmaj7 Cmaj7'],
  ['eval-09', 'D', 'Dmaj7 F#m7 Em7 A7'],
  ['eval-10', 'F', 'Bbmaj7 C7 Am7 Dm7'],
  ['eval-11', 'A', 'F#m7 Bm7 E7 Amaj7'],
  ['eval-12', 'E', 'C#m7 Amaj7 F#m7 B7'],
] as const;
export const AUTHORED_PASSAGES: Passage[] = studies.map(([id, tonic, symbols]) => ({
  id: `ear-${id}`,
  version: 'songs-v1',
  recordingId: `ear-${id}-synth`,
  title: `Listening study ${id}`,
  tonic,
  bpm: 84,
  startSeconds: 0,
  endSeconds: (16 * 60) / 84,
  chords: symbols.split(' ').map((symbol) => ({ symbol, beats: 4, alternatives: [] })),
  status: 'authored',
  representation: 'authored',
  sources: [],
  reuse: 'CC0-1.0',
  review:
    'Original authored listening stimulus. Screen answers do not establish instrumental performance.',
}));
export const AUTHORED_RECORDINGS: Recording[] = AUTHORED_PASSAGES.map((p) => ({
  id: p.recordingId,
  songId: 'authored-ear-studies',
  provider: 'synthesized',
  availability: 'verified',
  description: 'Original authored accompaniment rendered locally. No commercial recording is used.',
}));
