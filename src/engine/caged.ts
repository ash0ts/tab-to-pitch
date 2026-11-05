import { defineChord, type ChordDefinition, type ChordDegree } from './harmony.js';
import type { FretPosition } from './types.js';

export const CAGED_VERSION = 'caged-v1';
export const STANDARD_TUNING = [64, 59, 55, 50, 45, 40] as const;
export const CAGED_FAMILIES = ['C', 'A', 'G', 'E', 'D'] as const;
export type CagedFamily = (typeof CAGED_FAMILIES)[number];
export interface NeckRegion {
  minFret: number;
  maxFret: number;
}
export interface CagedShapeDefinition {
  version: typeof CAGED_VERSION;
  family: CagedFamily;
  openFrets: readonly (number | null)[];
  degrees: readonly (ChordDegree | null)[];
  rootStrings: readonly number[];
  mutedStrings: readonly number[];
  fragmentStrings: readonly number[][];
  source: string;
}
export interface CagedPlacement {
  id: string;
  version: typeof CAGED_VERSION;
  family: CagedFamily;
  chord: ChordDefinition;
  shift: number;
  notes: { position: FretPosition; midi: number; degree: ChordDegree; name: string }[];
  roots: FretPosition[];
  fragments: { id: string; positions: FretPosition[]; omittedDegrees: ChordDegree[] }[];
}
const source = 'https://www.fender.com/articles/scales/major-guitar-scales';
// Application-owned coordinates, string 1 = high E. Independent fixtures verify the pitches.
const parents = [
  ['C', [0, 1, 0, 2, 3, null], ['3', '1', '5', '3', '1', null], [2, 5]],
  ['A', [0, 2, 2, 2, 0, null], ['5', '3', '1', '5', '1', null], [3, 5]],
  ['G', [3, 0, 0, 0, 2, 3], ['1', '3', '1', '5', '3', '1'], [1, 3, 6]],
  ['E', [0, 0, 1, 2, 2, 0], ['1', '5', '3', '1', '5', '1'], [1, 4, 6]],
  ['D', [2, 3, 2, 0, null, null], ['3', '1', '5', '1', null, null], [2, 4]],
] as const;
function subsets<T>(items: readonly T[], size: number): T[][] {
  if (!size) return [[]];
  return items.flatMap((item, i) =>
    subsets(items.slice(i + 1), size - 1).map((rest) => [item, ...rest]),
  );
}
export const CAGED_SHAPES: readonly CagedShapeDefinition[] = parents.map(
  ([family, openFrets, degrees, rootStrings]) => {
    const sounding = openFrets.flatMap((f, i) => (f === null ? [] : [i + 1]));
    return {
      version: CAGED_VERSION,
      family,
      openFrets,
      degrees,
      rootStrings,
      source,
      mutedStrings: openFrets.flatMap((f, i) => (f === null ? [i + 1] : [])),
      fragmentStrings: [3, 4]
        .flatMap((size) => subsets(sounding, size))
        .filter((strings) => new Set(strings.map((s) => degrees[s - 1])).size === 3),
    };
  },
);
export const pc = (midi: number) => ((midi % 12) + 12) % 12;
export const positionKey = (p: FretPosition) => `${p.string}:${p.fret}`;
export function validRegion(region: NeckRegion): boolean {
  return (
    Number.isInteger(region.minFret) &&
    Number.isInteger(region.maxFret) &&
    region.minFret >= 0 &&
    region.maxFret <= 24 &&
    region.minFret <= region.maxFret
  );
}
export function conventionalCaged(tuning: readonly number[], capo = 0): boolean {
  return (
    tuning.length === 6 &&
    Number.isInteger(capo) &&
    capo >= 0 &&
    capo <= 12 &&
    tuning.every(
      (pitch, i) =>
        Number.isInteger(pitch) &&
        pitch >= 0 &&
        pitch <= 127 &&
        pitch - STANDARD_TUNING[i]! === tuning[0]! - STANDARD_TUNING[0],
    )
  );
}
export function noteAt(
  position: FretPosition,
  tuning: readonly number[],
  capo: number,
): number | null {
  if (
    !Number.isInteger(position.string) ||
    !Number.isInteger(position.fret) ||
    position.string < 1 ||
    position.string > tuning.length ||
    position.fret < 0 ||
    position.fret > 24 ||
    !Number.isInteger(capo) ||
    capo < 0 ||
    capo > 12
  )
    return null;
  const midi = tuning[position.string - 1]! + capo + position.fret;
  return Number.isInteger(midi) && midi >= 0 && midi <= 127 ? midi : null;
}
export function locations(
  pitch: number,
  tuning: readonly number[],
  capo: number,
  region: NeckRegion,
  exact = false,
): FretPosition[] {
  if (!validRegion(region)) return [];
  return tuning
    .flatMap((_, i) =>
      Array.from({ length: region.maxFret - region.minFret + 1 }, (_, f) => ({
        string: i + 1,
        fret: f + region.minFret,
      })),
    )
    .filter((p) => {
      const midi = noteAt(p, tuning, capo);
      return midi !== null && (exact ? midi === pitch : pc(midi) === pc(pitch));
    });
}
export function cagedPlacements(
  root: string,
  tuning: readonly number[] = STANDARD_TUNING,
  capo = 0,
): CagedPlacement[] {
  const chord = defineChord(root, 'major');
  if (!chord || !conventionalCaged(tuning, capo)) return [];
  return CAGED_SHAPES.flatMap((shape) => {
    const anchorString = shape.rootStrings[0]!;
    const openRoot = tuning[anchorString - 1]! + capo + shape.openFrets[anchorString - 1]!;
    const firstShift = pc(chord.rootPitchClass - openRoot);
    const placements: CagedPlacement[] = [];
    for (let shift = firstShift; shift <= 24; shift += 12) {
      const notes = shape.openFrets.flatMap((f, i) => {
        if (f === null) return [];
        const position = { string: i + 1, fret: f + shift };
        const midi = noteAt(position, tuning, capo);
        const degree = shape.degrees[i]!;
        const tone = chord.tones.find((t) => t.degree === degree);
        if (midi === null || !tone || pc(midi) !== tone.pitchClass) return [];
        return [{ position, midi, degree: degree!, name: tone.noteName }];
      });
      // A full parent must fit. Never silently truncate a reference diagram at the neck boundary.
      if (notes.length !== shape.openFrets.filter((f) => f !== null).length) continue;
      const id = `${CAGED_VERSION}:${root}:${shape.family}:${shift}:${tuning.join('.')}:${capo}`;
      placements.push({
        id,
        version: CAGED_VERSION,
        family: shape.family,
        chord,
        shift,
        notes,
        roots: notes.filter((n) => n.degree === '1').map((n) => n.position),
        fragments: shape.fragmentStrings.map((strings) => ({
          id: `${id}:${strings.join('.')}`,
          positions: notes
            .filter((n) => strings.includes(n.position.string))
            .map((n) => n.position),
          omittedDegrees: [],
        })),
      });
    }
    return placements;
  }).sort(
    (a, b) =>
      a.shift - b.shift || CAGED_FAMILIES.indexOf(a.family) - CAGED_FAMILIES.indexOf(b.family),
  );
}
export function regionFragments(placements: CagedPlacement[], region: NeckRegion) {
  return placements.flatMap((placement) =>
    placement.fragments
      .filter((fragment) =>
        fragment.positions.every((p) => p.fret >= region.minFret && p.fret <= region.maxFret),
      )
      .map((fragment) => ({ placement, fragment })),
  );
}
export function fragmentFamilies(
  positions: FretPosition[],
  placements: CagedPlacement[],
): CagedFamily[] {
  if (new Set(positions.map(positionKey)).size !== positions.length || positions.length < 2)
    return [];
  return [
    ...new Set(
      placements
        .filter((p) =>
          positions.every((pos) =>
            p.notes.some((n) => positionKey(n.position) === positionKey(pos)),
          ),
        )
        .map((p) => p.family),
    ),
  ];
}
