import type { ScoreDocument, ScoreTrack } from '../engine/types';
import { displayNoteLabel } from '../engine/exploration';
export function timelineEvents(score: ScoreDocument, track: ScoreTrack, octaves: boolean) {
  const occurrences =
    score.playbackOccurrences ??
    score.measures.map((m) => ({
      measureIndex: m.index,
      occurrence: 0,
      startTick: m.startTicks,
      endTick: m.startTicks + m.durationTicks,
    }));
  return occurrences
    .flatMap((o) => {
      const m = score.measures.find((m) => m.index === o.measureIndex);
      if (!m) return [];
      return track.notes
        .filter((n) => n.measureIndex === m.index)
        .map((n) => ({
          id: `${n.id}:${o.occurrence}`,
          tick: o.startTick + n.onsetTicks - m.startTicks,
          duration: n.durationTicks,
          label: displayNoteLabel(n, octaves),
          string: n.position?.string ?? null,
          fret: n.position?.fret ?? null,
        }));
    })
    .sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
}
/** Sorted onset lookup. Long held notes stay visible without scanning a whole score per frame. */
export function visibleEvents<T extends { tick: number; duration: number }>(
  events: readonly T[],
  start: number,
  end: number,
  maxDuration: number,
): readonly T[] {
  const lower = (tick: number) => {
    let lo = 0,
      hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid]!.tick < tick) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return events
    .slice(lower(start - maxDuration), lower(end + 1))
    .filter((e) => e.tick + e.duration >= start);
}
