import type { ChordHypothesis } from '../shared/live-guitar';

export const CHORD_FORMULAS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '6': [0, 4, 7, 9],
} as const;
/** Exact observed pitch-class sets only. Missing tones never become evidence of silence. */
export function chordsFromPitches(pitches: readonly number[]): ChordHypothesis[] {
  const pcs = new Set(pitches.map((p) => ((Math.round(p) % 12) + 12) % 12));
  const candidates: ChordHypothesis[] = [];
  for (let root = 0; root < 12; root++)
    for (const quality of Object.keys(CHORD_FORMULAS) as (keyof typeof CHORD_FORMULAS)[]) {
      const formula = CHORD_FORMULAS[quality];
      if (formula.length === pcs.size && formula.every((n) => pcs.has((n + root) % 12)))
        candidates.push({ root, quality, score: 1 });
    }
  // A six/add-six reading shares the pitch set of a minor seventh. Without bass
  // context neither is uniquely established, even if only one is in our vocabulary.
  return candidates.slice(0, 3);
}

export function spectralChords(chroma: readonly number[]): ChordHypothesis[] {
  const peak = Math.max(...chroma);
  if (!Number.isFinite(peak) || peak <= 0) return [];
  const active = chroma.flatMap((v, pc) => (v >= peak * 0.24 ? [pc] : []));
  if (active.length < 3 || active.length > 4) return [];
  const candidates = chordsFromPitches(active);
  return candidates
    .filter((c) => {
      const inside = CHORD_FORMULAS[c.quality].map((n) => chroma[(n + c.root) % 12]!);
      return Math.min(...inside) / peak >= 0.3;
    })
    .map((c) => ({
      ...c,
      score: Math.min(
        1,
        CHORD_FORMULAS[c.quality].reduce<number>((s, n) => s + chroma[(n + c.root) % 12]!, 0) /
          (chroma.reduce((s, v) => s + v, 0) || 1),
      ),
    }));
}
