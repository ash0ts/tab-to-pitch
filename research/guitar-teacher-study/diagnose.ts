/** Exploratory failure attribution after execution; never changes frozen primary scores. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { decodeTeacherAction } from '../../server/teacher-transport.js';
import { teacherActorStepSchema } from '../../src/shared/teacher.js';
import { validateTeacherTurn } from '../../src/engine/teacher.js';
import { hasProseCoordinates } from '../../src/engine/teacher-prose.js';
const root = resolve(process.argv[2]!);
const c = JSON.parse(await readFile(join(root, 'campaign.json'), 'utf8'));
const rows = [];
for (const q of c.requests.filter((q: any) => q.kind === 'actor')) {
  const r = c.rows.find((r: any) => r.id === q.identity);
  if (!r) continue;
  let reason = 'tool-request',
    message: string | undefined;
  try {
    const raw = JSON.parse(await readFile(join(root, `response-${q.sequence}.json`), 'utf8'));
    const decoded = decodeTeacherAction(raw, 'teacher_step');
    // Named tools are normalized by the production actor loop, not the final schema.
    if ((decoded.args as { kind?: string })?.kind !== 'tools') {
      const parsed = teacherActorStepSchema.safeParse(decoded.args);
      if (!parsed.success) reason = 'actor-step-schema';
      else if (parsed.data.kind === 'final') {
        const { kind, ...final } = parsed.data;
        message = final.message;
        const candidate = {
          ...r.output,
          ...final,
          source: 'forge',
          versions: { ...r.output.versions, model: 'openai/gpt-oss-20b' },
          review: { status: 'passed', reasons: [] },
        };
        delete candidate.fallbackReason;
        reason = hasProseCoordinates(final.message)
          ? 'coordinate-prose-guard'
          : validateTeacherTurn(candidate, r.request)
            ? 'deterministic-validation-passes'
            : 'other-deterministic-rejection';
      }
    }
  } catch (error) {
    reason = 'decode-or-provider-failure';
  }
  rows.push({
    identity: r.id,
    arm: r.arm,
    taskId: r.taskId,
    sequence: q.sequence,
    reason,
    message,
  });
}
const counts: Record<string, Record<string, number>> = {};
for (const r of rows) {
  const group = (counts[r.arm] ??= {});
  group[r.reason] = (group[r.reason] ?? 0) + 1;
}
const report = {
  scope:
    'Exploratory per-model-call diagnosis. Not mutually exclusive per turn; does not replace frozen primary scores or qualify prose.',
  counts,
  rows,
};
await writeFile(join(root, 'diagnosis.json'), JSON.stringify(report, null, 2) + '\n');
console.info(JSON.stringify(counts, null, 2));
