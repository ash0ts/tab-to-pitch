import {
  teacherTurnSchema,
  type TeacherRequest,
  type TeacherTurn,
} from '../../src/shared/teacher.js';
import { validateTeacherTurn } from '../../src/engine/teacher.js';
import type { JudgeResult } from './judge.js';

export function scoreStructural(
  request: TeacherRequest,
  output: unknown,
  sourceUnchanged: boolean,
  calls = 0,
  tools = 0,
) {
  const parsed = teacherTurnSchema.safeParse(output);
  const response = parsed.success ? parsed.data : null;
  const valid = !!response && !!validateTeacherTurn(response, request);
  return {
    schemaValid: !!response,
    contextMatches:
      !!response &&
      response.lessonId === request.lessonId &&
      response.turnId === request.turnId &&
      response.contextVersion === request.contextVersion,
    musicalActionsValid: valid,
    sourceUnchanged,
    boundedCalls: calls <= 5 && tools <= 8,
    noGradeMutation:
      !!response &&
      response.actions.every((action) =>
        ['highlight', 'preview', 'question', 'audition'].includes(action.type),
      ),
    structuralValid: valid && sourceUnchanged && calls <= 5 && tools <= 8,
  };
}
export interface TeacherRow {
  id: string;
  taskId: string;
  contextId: string;
  suite: 'development' | 'qualification' | 'fixed-history' | 'boundary' | 'episode';
  arm: string;
  trial: number;
  turn: number;
  request: TeacherRequest;
  output: TeacherTurn | null;
  rawActor?: unknown;
  tools: unknown[];
  runtimeReview?: unknown;
  scores: ReturnType<typeof scoreStructural>;
  elapsedMs: number;
  providerSucceeded: boolean | null;
  failure?: string;
  traceId?: string;
  judges: {
    model: string;
    pass: number;
    qualified: boolean;
    result: JudgeResult | null;
    failure?: string;
    traceId?: string;
  }[];
}
export function judgedAcceptable(row: TeacherRow): boolean | null {
  const reviews = row.judges.filter((j) => j.qualified);
  if (reviews.length !== 2 || reviews.some((j) => !j.result)) return null;
  return (
    row.scores.structuralValid &&
    row.providerSucceeded !== false &&
    reviews.every(
      (j) =>
        j.result!.overall === 'acceptable' &&
        !j.result!.answerLeakage &&
        !j.result!.unsupportedPerformanceClaim &&
        !j.result!.claims.some((c) => c.critical && c.verdict !== 'supported'),
    )
  );
}
export function summarizeRows(rows: TeacherRow[]) {
  return [...new Set(rows.filter((r) => r.suite !== 'qualification').map((r) => r.arm))].map(
    (arm) => {
      const subset = rows.filter((r) => r.arm === arm && r.suite !== 'qualification');
      return {
        arm,
        rows: subset.length,
        contexts: new Set(subset.map((r) => r.contextId)).size,
        providerSucceeded: subset.filter((r) => r.providerSucceeded === true).length,
        structuralViolations: subset.filter((r) => !r.scores.structuralValid).length,
        unqualifiedJudgments: subset.filter((r) => judgedAcceptable(r) === null).length,
        suites: Object.fromEntries(
          ['fixed-history', 'boundary', 'episode'].map((suite) => {
            const items = subset.filter((r) => r.suite === suite),
              known = items.filter((r) => judgedAcceptable(r) !== null);
            const latency = items.map((r) => r.elapsedMs).sort((a, b) => a - b);
            return [
              suite,
              {
                observedTurns: items.length,
                judgedTurns: known.length,
                acceptable: known.filter((r) => judgedAcceptable(r)).length,
                availableAcceptableRate: known.length
                  ? known.filter((r) => judgedAcceptable(r)).length / known.length
                  : null,
                p50ms: latency[Math.floor(latency.length * 0.5)] ?? null,
                p95ms: latency[Math.floor(latency.length * 0.95)] ?? null,
              },
            ];
          }),
        ),
        // Full expected denominator is independent of model qualification and run coverage.
        planned:
          arm === 'authored-local'
            ? { fixedHistory: 96, boundary: 24, episodes: 24, maxEpisodeTurns: 144 }
            : arm.includes('history-withheld')
              ? { fixedHistory: 192, boundary: 0, episodes: 0, maxEpisodeTurns: 0 }
              : { fixedHistory: 192, boundary: 48, episodes: 48, maxEpisodeTurns: 288 },
        episodes: [
          ...new Set(
            subset.filter((r) => r.suite === 'episode').map((r) => `${r.taskId}:${r.trial}`),
          ),
        ].map((id) => {
          const turns = subset.filter(
            (r) => `${r.taskId}:${r.trial}` === id && r.suite === 'episode',
          );
          return {
            id,
            turns: turns.length,
            complete: turns.length === 6,
            acceptable: turns.some((r) => judgedAcceptable(r) === null)
              ? null
              : turns.length === 6 && turns.every((r) => judgedAcceptable(r) === true),
          };
        }),
      };
    },
  );
}
