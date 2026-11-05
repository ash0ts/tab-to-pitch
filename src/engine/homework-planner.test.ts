import { it, expect } from 'vitest';
import { planHomeworkTasks } from './homework-planner';
import { makeHomeworkTask } from './homework';
import { STANDARD_TUNING } from './caged';
import type { HomeworkObservation, HomeworkTask } from '../shared/homework';
const base = {
  minutes: 30 as const,
  region: { minFret: 0, maxFret: 5 },
  symbol: 'C',
  symbols: ['C', 'F', 'G', 'C'],
  family: 'A' as const,
  tuning: STANDARD_TUNING,
  capo: 0,
  exact: false,
  history: [],
  definitions: [],
  now: 10 * 86400000,
};
function response(task: HomeworkTask, at: number, correct = true): HomeworkObservation {
  return {
    kind: 'answer',
    taskId: task.id,
    at,
    correct,
    assisted: false,
    firstResponse: true,
    skill: task.kind,
    exposure: 'exposed',
  };
}
it('uses uncovered strings, notes and family maps instead of a new ID for the same question', () => {
  const first = planHomeworkTasks({ ...base, kind: 'locate' })[0]!;
  const next = planHomeworkTasks({
    ...base,
    kind: 'locate',
    definitions: [first],
    history: [response(first, base.now)],
  })[0]!;
  expect(next.string).not.toBe(first.string);
  const cLocations = Array.from(
    { length: 6 },
    (_, variant) => makeHomeworkTask('locate', 'C', 'A', base.region, STANDARD_TUNING, 0, variant)!,
  );
  const varied = planHomeworkTasks({
    ...base,
    definitions: cLocations,
    history: cLocations.map((task) => response(task, base.now)),
  });
  expect(varied.find((task) => task.kind === 'locate')!.symbol).toBe('F');
  const roots = makeHomeworkTask('roots', 'C', 'A', base.region, STANDARD_TUNING, 0)!;
  expect(
    planHomeworkTasks({ ...base, definitions: [roots], history: [response(roots, base.now)] }).find(
      (task) => task.kind === 'roots',
    )!.family,
  ).not.toBe('A');
});
it('finds a due question in immutable history after its assignment was replaced', () => {
  const old = makeHomeworkTask('name', 'C', 'A', base.region, STANDARD_TUNING, 0)!;
  expect(
    planHomeworkTasks({ ...base, definitions: [old], history: [response(old, 1)] })[0]!.id,
  ).toBe(old.id);
  const recent = response(old, base.now - 2 * 86400000);
  const previous = response(old, base.now - 5 * 86400000);
  const tasks = planHomeworkTasks({ ...base, definitions: [old], history: [previous, recent] });
  expect(tasks[0]!.id).not.toBe(old.id); // The second independent success is due in three days.
});
