import { analyzeHarmony } from '../engine/harmony';
import { findUnisons, midiToSpn, STANDARD_TUNING } from '../engine/theory';
import type { NoteEvent, FretPosition } from '../engine/types';
import type { AudioNote } from '../shared/audio';
/** Interpret an explicitly hypothetical sound at one time, never the union of a measure. */
export function hypothesisHarmony(notes: AudioNote[], seconds: number) {
  const sounding: NoteEvent[] = notes
    .filter((n) => n.start <= seconds && n.end > seconds)
    .map((n) => ({
      id: 'derived-ear:' + n.id,
      trackId: 'derived-ear',
      staffIndex: 0,
      voiceIndex: 0,
      measureIndex: 0,
      beatId: 'derived-ear',
      onsetTicks: Math.round(n.start * 960),
      durationTicks: Math.round((n.end - n.start) * 960),
      soundingMidi: n.midi,
      spelling: midiToSpn(n.midi),
      position: null,
      effects: {},
      eligible: true,
    }));
  // These constructed events never enter source-note exercise generation or learner evidence.
  return { authority: 'model-hypothesis' as const, ...analyzeHarmony(sounding) };
}
export interface DraftPosition {
  noteId: string;
  position: FretPosition | null;
  omission: string | null;
}
/** A deterministic greedy proposal. Failure means this search found no assignment, not impossibility. */
export function draftPositions(
  notes: AudioNote[],
  tuning: readonly number[] = STANDARD_TUNING,
  capo = 0,
): DraftPosition[] {
  if (tuning.length !== 6 || !Number.isInteger(capo) || capo < 0 || capo > 12)
    throw new Error('Unsupported draft instrument');
  const active: { end: number; position: FretPosition }[] = [];
  return [...notes]
    .sort((a, b) => a.start - b.start || a.midi - b.midi || a.id.localeCompare(b.id))
    .map((n) => {
      for (let i = active.length - 1; i >= 0; i--)
        if (active[i]!.end <= n.start) active.splice(i, 1);
      const alternatives = findUnisons(n.midi, tuning, capo, 24);
      const available = alternatives
        .filter(
          (p) =>
            !active.some((a) => a.position.string === p.string) &&
            (() => {
              const frets = [p.fret, ...active.map((a) => a.position.fret)].filter((f) => f > 0);
              return !frets.length || Math.max(...frets) - Math.min(...frets) <= 4;
            })(),
        )
        .sort((a, b) => a.fret - b.fret || a.string - b.string);
      const position = available[0] ?? null;
      if (position) active.push({ end: n.end, position });
      return {
        noteId: n.id,
        position,
        omission: position
          ? null
          : !alternatives.length
            ? 'Pitch outside this fretboard.'
            : 'No assignment in this bounded proposal; try another voicing or part.',
      };
    });
}
