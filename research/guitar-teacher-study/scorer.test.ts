import { expect, it } from 'vitest';
import { cases, passages } from './cases.js';
import { criticCases } from './critic-cases.js';
import { score, checkVariation, validPositions } from './scorer.js';
import { createTeacherToolRuntime, resolveTeacherAction } from '../../src/engine/teacher.js';

it('keeps performers, recordings and progression families disjoint in the new study', () => {
  const dev = passages.filter((p) => p.split === 'development'),
    test = passages.filter((p) => p.split === 'evaluation');
  expect(dev).toHaveLength(6);
  expect(test).toHaveLength(36);
  for (const key of ['recording', 'performer', 'family'] as const)
    expect(dev.some((d) => test.some((t) => t[key] === d[key]))).toBe(false);
  expect(cases('evaluation', 'fixture')).toHaveLength(72);
  expect(criticCases('evaluation')).toHaveLength(48);
  const correct = criticCases('evaluation').filter((c) => c.kind === 'correct');
  expect(correct.find((c) => c.id === 'F#-maj7-correct')!.prose).toContain('A#');
  expect(correct.find((c) => c.id === 'Ab-m7-correct')!.prose).toContain('Cb');
});
it('checks a requested role using independent pitch arithmetic and catches wrong targets or duplicate positions', () => {
  const task = cases('development', 'fixture')[0]!;
  const action = {
    type: 'highlight',
    spanIndex: task.passage.selected,
    degree: task.passage.tone.degree,
  };
  const positions = validPositions(task).map(({ string, fret }) => ({ string, fret }));
  const row = {
    arm: 'current',
    sourceUnchanged: true,
    output: { source: 'forge', actions: [action], claims: [] },
    resolved: [{ positions }],
  };
  expect(score(task, row).actorDelivered).toBe(true);
  const wrong = structuredClone(row);
  wrong.resolved[0]!.positions[0]!.fret++;
  expect(score(task, wrong).actorDelivered).toBe(false);
  const duplicate = structuredClone(row);
  duplicate.resolved[0]!.positions[1] = duplicate.resolved[0]!.positions[0]!;
  expect(score(task, duplicate).actorDelivered).toBe(false);
  const fallback = structuredClone(row);
  fallback.output.source = 'local';
  expect(score(task, fallback).requestedActionDelivered).toBe(true);
  expect(score(task, fallback).actorDelivered).toBe(false);
  expect(score(task, { ...row, sourceUnchanged: false }).requestedActionDelivered).toBe(false);
});
it('accepts every returned development alternative and rejects independent mutations to actual musical artifacts', () => {
  for (const task of cases('development', 'fixture').filter((t) => t.kind === 'move')) {
    const result = createTeacherToolRuntime(task.request).execute({
      name: 'explore_voicings',
      args: {
        intent: {
          action: 'propose',
          reason: 'requested',
          operation: 'move',
          constraints: task.request.context.constraints,
          targetQuality: null,
          substituteSymbol: null,
        },
      },
    });
    expect(result.actions.length).toBeGreaterThan(0);
    for (const action of result.actions) {
      const variation = resolveTeacherAction(task.request, action)!.variation!;
      expect(checkVariation(task, variation)).toEqual({ valid: true, reasons: [] });
      for (const mutate of [
        (v: any) => v.events[0].voicing.notes[0].midi++,
        (v: any) => (v.events[0].voicing.notes[0].position.fret = 24),
        (v: any) => v.events[0].startTick++,
        (v: any) => v.events[0].voicing.notes.pop(),
        (v: any) => (v.events[0].voicing.chord.symbol = 'unrelated'),
        (v: any) => (v.events[0].voicing.notes[0].degree = 'b2'),
        (v: any) =>
          (v.events[0].voicing.notes[0].position.string =
            v.events[0].voicing.notes[1].position.string),
      ]) {
        const wrong = structuredClone(variation);
        mutate(wrong);
        expect(checkVariation(task, wrong).valid).toBe(false);
      }
    }
  }
});
