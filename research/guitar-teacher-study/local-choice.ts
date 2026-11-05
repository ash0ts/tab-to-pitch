/** Development-motivated diagnostic, separate from the frozen hosted comparison. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { cases } from './cases.js';
import { localTeacher, resolveTeacherAction } from '../../src/engine/teacher.js';
import { score } from './scorer.js';
const directory = resolve(process.argv[2]!);
await mkdir(directory, { recursive: false });
const source = await readFile(new URL(import.meta.url));
await writeFile(join(directory, 'source.ts'), source, { flag: 'wx' });
const tasks = cases('evaluation', 'local-choice-diagnostic-v1');
const variants = ['original', 'no-quiz', 'do-not-quiz'] as const;
const requests = tasks.flatMap((task) =>
  variants.map((variant) => {
    const request = structuredClone(task.request);
    if (variant !== 'original')
      request.request =
        request.request.replace('not a quiz', 'no quiz').replace('not take a quiz', 'no quiz') +
        (variant === 'do-not-quiz' ? ' Please do not quiz me.' : '');
    return { task, variant, request };
  }),
);
await writeFile(
  join(directory, 'manifest.json'),
  JSON.stringify(
    {
      protocol: 'local-choice-diagnostic-v1',
      hypothesis:
        'Semantically equivalent refusals of a quiz should not change whether the local teacher proposes one.',
      scope:
        'Post-development deterministic diagnostic; no held-out efficacy claim. Reuses the hosted comparison cohort.',
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      variants,
      requests,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
const rows = requests.map(({ task, variant, request }) => {
  const before = JSON.stringify(request),
    output = localTeacher(request);
  const row = {
    arm: 'local',
    output,
    resolved: output.actions.map((a) => resolveTeacherAction(request, a)),
    sourceUnchanged: before === JSON.stringify(request),
    tools: [],
  };
  return {
    id: task.id,
    kind: task.kind,
    variant,
    request: request.request,
    output,
    scores: score({ ...task, request }, row),
  };
});
const summary = Object.fromEntries(
  variants.map((variant) => {
    const selected = rows.filter((r) => r.variant === variant);
    return [
      variant,
      {
        n: selected.length,
        unrequestedQuiz: selected.filter((r) => !r.scores.noUnrequestedQuiz).length,
        delivered: selected.filter((r) => r.scores.requestedActionDelivered).length,
        byTask: Object.fromEntries(
          ['role', 'move'].map((kind) => {
            const s = selected.filter((r) => r.kind === kind);
            return [
              kind,
              { n: s.length, delivered: s.filter((r) => r.scores.requestedActionDelivered).length },
            ];
          }),
        ),
      },
    ];
  }),
);
await writeFile(
  join(directory, 'results.json'),
  JSON.stringify({ protocol: 'local-choice-diagnostic-v1', summary, rows }, null, 2),
);
console.info(JSON.stringify(summary, null, 2));
