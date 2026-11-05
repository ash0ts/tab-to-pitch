import type { NoteEvent, ScoreDocument } from '../engine/types';

/** Select an explicit repeat occurrence; source notation ticks are not seek ticks. */
export function notePlaybackTick(
  document: ScoreDocument,
  note: NoteEvent,
  occurrence = 0,
): number | null {
  const measure = document.measures.find((item) => item.index === note.measureIndex);
  const played = document.playbackOccurrences?.find(
    (item) => item.measureIndex === note.measureIndex && item.occurrence === occurrence,
  );
  if (!measure || !played) return null;
  return played.startTick + note.onsetTicks - measure.startTicks;
}

export function measurePlaybackRange(
  document: ScoreDocument,
  firstIndex: number,
  lastIndex: number,
  occurrence = 0,
): { startTick: number; endTick: number } | null {
  if (lastIndex < firstIndex) return null;
  const occurrences = document.playbackOccurrences ?? [];
  const first = occurrences.findIndex(
    (item) => item.measureIndex === firstIndex && item.occurrence === occurrence,
  );
  if (first < 0) return null;
  const last = occurrences.slice(first).find((item) => item.measureIndex === lastIndex);
  return last ? { startTick: occurrences[first].startTick, endTick: last.endTick } : null;
}
