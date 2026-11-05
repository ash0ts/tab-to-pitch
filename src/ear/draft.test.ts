import { it, expect } from 'vitest';
import { draftPositions, hypothesisHarmony } from './draft';
import type { AudioNote } from '../shared/audio';
const note = (id: string, midi: number, start = 0, end = 1): AudioNote => ({
  id,
  midi,
  start,
  end,
  family: 'muscriptor',
  instrument: 'guitar',
  confidence: null,
  authority: 'model-hypothesis',
});
it('interprets overlap and preserves competing harmonic readings', () => {
  const notes = [
    note('a', 60, 0, 2),
    note('b', 64, 1, 3),
    note('c', 67, 1, 3),
    note('d', 69, 1, 3),
  ];
  expect(hypothesisHarmony(notes, 0.5).status).toBe('unavailable');
  const overlap = hypothesisHarmony(notes, 1.5);
  expect(overlap.status).toBe('ambiguous');
  expect(overlap.interpretations.map((i) => i.chord.symbol)).toEqual(
    expect.arrayContaining(['C6', 'Am7']),
  );
  expect(overlap.authority).toBe('model-hypothesis');
});
it('keeps capo and reentrant string order, with no duplicate simultaneous string', () => {
  const tuning = [64, 59, 55, 50, 45, 52],
    notes = [note('a', 54), note('b', 66), note('c', 61)];
  const positions = draftPositions(notes, tuning, 2);
  const used = positions.flatMap((p) => (p.position ? [p.position.string] : []));
  expect(new Set(used).size).toBe(used.length);
  for (const p of positions)
    if (p.position)
      expect(tuning[p.position.string - 1]! + 2 + p.position.fret).toBe(
        notes.find((n) => n.id === p.noteId)!.midi,
      );
});
it('reports every unassigned note and does not alter pitches or timing', () => {
  const notes = Array.from({ length: 7 }, (_, i) => note('n' + i, 64));
  notes.push(note('outside', 10));
  const before = JSON.stringify(notes),
    result = draftPositions(notes);
  expect(result).toHaveLength(8);
  expect(result.filter((n) => n.omission).length).toBeGreaterThan(0);
  expect(result.find((n) => n.noteId === 'outside')?.omission).toContain('outside');
  expect(JSON.stringify(notes)).toBe(before);
});
