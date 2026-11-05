import { makeHomeworkTask, solution, suggestedTasks } from './homework';
import { pc, type CagedFamily, type NeckRegion } from './caged';
import type { HomeworkKind, HomeworkObservation, HomeworkTask } from '../shared/homework';

function coverageKey(task: HomeworkTask): string {
  const region = `${task.region.minFret}-${task.region.maxFret}`;
  if (task.kind === 'locate') return `locate:${pc(task.pitch)}:${task.string}:${region}`;
  if (task.kind === 'name')
    return `name:${task.sourcePosition?.string}:${task.sourcePosition?.fret}`;
  return `${task.kind}:${task.symbol}:${task.family}:${region}`;
}

export function planHomeworkTasks(input: {
  minutes: 5 | 15 | 30;
  region: NeckRegion;
  symbol: string;
  symbols: string[];
  family: CagedFamily;
  tuning: readonly number[];
  capo: number;
  kind?: HomeworkKind;
  exact: boolean;
  history: HomeworkObservation[];
  definitions: HomeworkTask[];
  now: number;
}): HomeworkTask[] {
  const { history, definitions, region, tuning, capo } = input;
  const known = new Map(definitions.map((task) => [task.id, task]));
  const counts = new Map<string, number>();
  for (const observation of history) {
    const definition = known.get(observation.taskId);
    if (definition && observation.kind === 'answer' && observation.firstResponse) {
      const key = coverageKey(definition);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const kinds = input.kind ? [input.kind] : suggestedTasks(input.minutes, history);
  const tasks = kinds.flatMap((kind) => {
    const notes = kind === 'locate' || kind === 'name';
    const symbols =
      notes && !input.kind ? [...new Set([input.symbol, ...input.symbols])] : [input.symbol];
    const families: CagedFamily[] =
      !input.kind && ['roots', 'complete', 'neighbor'].includes(kind)
        ? [...new Set<CagedFamily>([input.family, 'E', 'A', 'D', 'C', 'G'])]
        : [input.family];
    const candidates: HomeworkTask[] = [];
    for (const symbol of symbols)
      for (const family of families) {
        for (
          let variant = 0;
          variant <
          (kind === 'name'
            ? (region.maxFret - region.minFret + 1) * tuning.length
            : notes
              ? 18
              : 1);
          variant++
        ) {
          const task = makeHomeworkTask(
            kind,
            symbol,
            family,
            region,
            tuning,
            capo,
            variant,
            input.exact && notes,
          );
          if (
            task &&
            solution(task).length &&
            !candidates.some((candidate) => coverageKey(candidate) === coverageKey(task))
          )
            candidates.push(task);
        }
      }
    // Attempt counts choose missing coverage; they are not mastery estimates.
    candidates.sort(
      (a, b) => (counts.get(coverageKey(a)) ?? 0) - (counts.get(coverageKey(b)) ?? 0),
    );
    return candidates.slice(0, 1);
  });
  if (!input.kind) {
    const due = definitions
      .flatMap((task) => {
        if (
          task.symbol !== input.symbol ||
          task.region.minFret !== region.minFret ||
          task.region.maxFret !== region.maxFret ||
          task.capo !== capo ||
          task.tuning.join(',') !== tuning.join(',')
        )
          return [];
        const attempts = history
          .filter((e) => e.taskId === task.id && e.kind === 'answer' && e.firstResponse)
          .sort((a, b) => a.at - b.at);
        const last = attempts.at(-1);
        if (!last) return [];
        const successes = attempts.filter((e) => e.correct && !e.assisted).length;
        const days =
          last.correct && !last.assisted ? (successes >= 3 ? 7 : successes >= 2 ? 3 : 1) : 1;
        const dueAt = last.at + days * 86400000;
        return dueAt <= input.now ? [{ task, dueAt }] : [];
      })
      .sort((a, b) => a.dueAt - b.dueAt)[0];
    if (due) return [due.task, ...tasks.filter((task) => task.id !== due.task.id)];
  }
  return tasks;
}
