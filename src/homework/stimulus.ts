import type { PlayingStep } from '../shared/homework-playing';
import { parseChordSymbol } from '../engine/harmony';
import { locations, noteAt } from '../engine/caged';
import type { FretPosition } from '../engine/types';

/** The authored accompaniment is shared by playback, diagrams and teacher inspection. */
export const CONNECTION_CHORDS = ['G7', 'Cmaj7'] as const;

export function homeworkHarmony(step: PlayingStep): { symbol: string; ticks: number }[] {
  if (step.progression.length) return step.progression;
  if (step.objective === 'connection' || step.objective === 'phrase')
    return CONNECTION_CHORDS.map((symbol) => ({ symbol, ticks: 3840 }));
  if (step.family) {
    // Legacy assignments stored the parent harmony in the title. Validate it against
    // the frozen pitches before interpreting it; unknown titles remain unavailable.
    const root = /^([A-G](?:#|b)?) major · /.exec(step.title)?.[1];
    const chord = root ? parseChordSymbol(root) : null;
    if (
      chord &&
      step.pitches.length &&
      step.pitches.every((p) => chord.tones.some((t) => t.pitchClass === p % 12))
    )
      return [{ symbol: chord.symbol, ticks: 3840 }];
  }
  return [];
}

export function homeworkConnections(step: PlayingStep, tuning: readonly number[], capo: number) {
  if (step.objective !== 'connection' || step.pitches.length !== 2) return [];
  const [fromPitch, toPitch] = step.pitches as [number, number];
  const delta = toPitch - fromPitch;
  const from = locations(fromPitch, tuning, capo, step.region);
  const to = locations(toPitch, tuning, capo, step.region);
  return from
    .flatMap((a) =>
      to
        .filter((b) => noteAt(b, tuning, capo)! - noteAt(a, tuning, capo)! === delta)
        .map((b) => ({ from: a, to: b })),
    )
    .sort(
      (a, b) =>
        Number(a.from.string !== a.to.string) - Number(b.from.string !== b.to.string) ||
        a.from.string - b.from.string ||
        a.from.fret - b.from.fret,
    );
}

export function homeworkPositions(
  step: PlayingStep,
  tuning: readonly number[],
  capo: number,
): FretPosition[] {
  if (step.fragment.length) return step.fragment;
  const pairs = homeworkConnections(step, tuning, capo);
  const positions = pairs.length
    ? pairs.flatMap((p) => [p.from, p.to])
    : step.pitches.flatMap((p) => locations(p, tuning, capo, step.region, step.exact));
  return [...new Map(positions.map((p) => [`${p.string}:${p.fret}`, p])).values()];
}
