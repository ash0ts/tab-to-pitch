import { z } from 'zod';
import type { AttemptRecord } from '../engine/types';
export const STAGE_POLICY = 'practice-stage-v1';
export const activityIdSchema = z.enum([
  'timeline',
  'homework',
  'listening',
  'progression',
  'knowledge',
  'musicianship',
  'notation',
  'live',
  'ear-lab',
]);
export const practiceSetSchema = z.object({
  version: z.literal(1),
  goal: z.string().max(500),
  workload: z.union([z.literal(5), z.literal(15), z.literal(30)]),
  activities: z.array(activityIdSchema).min(1).max(12),
  bookmark: z
    .object({
      activity: activityIdSchema,
      sourceHash: z.string().max(200),
      track: z.number().int().nonnegative(),
      firstBar: z.number().int().nonnegative(),
      lastBar: z.number().int().nonnegative(),
      speed: z.number().min(0.25).max(1.5),
      at: z.number(),
      next: z.string().max(500),
    })
    .nullable(),
  bandmate: z.boolean(),
  staticStage: z.boolean(),
  weeklyIntention: z.string().max(300),
  reflection: z.string().max(1000),
  visits: z
    .array(
      z.object({
        at: z.number(),
        activity: activityIdSchema,
        kind: z.enum(['started', 'saved', 'resumed', 'completed']),
      }),
    )
    .max(1000),
});
export type PracticeSet = z.infer<typeof practiceSetSchema>;
export const defaultPracticeSet = (): PracticeSet => ({
  version: 1,
  goal: 'Connect what I hear to the neck',
  workload: 15,
  activities: ['homework', 'knowledge', 'progression'],
  bookmark: null,
  bandmate: true,
  staticStage: false,
  weeklyIntention: '',
  reflection: '',
  visits: [],
});
export interface StageRun {
  id: string;
  mode: 'rehearsal' | 'challenge';
  policy: typeof STAGE_POLICY;
  sourceId: string;
  taskVersion: string;
  input: 'screen';
  tempo: number;
  support: 'hidden';
  startedAt: number;
  capability: { qualified: true; timingQualified: false };
  targetExerciseIds: string[];
  attemptIds: string[];
  assisted: boolean;
  endedAt?: number;
}
export function scoreRun(run: StageRun, history: readonly AttemptRecord[]) {
  const byId = new Map(history.map((a) => [a.id, a]));
  const episodes = new Set<string>();
  const targets = new Set<string>();
  let points = 0,
    combo = 0,
    bestCombo = 0,
    correct = 0,
    incorrect = 0,
    unassessed = 0,
    assisted = run.assisted;
  for (const id of new Set(run.attemptIds)) {
    const a = byId.get(id);
    if (
      !a ||
      !run.targetExerciseIds.includes(a.exerciseId) ||
      a.scoreId !== run.sourceId ||
      a.startedAt < run.startedAt ||
      (run.endedAt !== undefined && a.answeredAt > run.endedAt)
    ) {
      unassessed++;
      continue;
    }
    const episode = a.episodeId ?? a.id;
    if (a.assisted || a.hintsUsed.length) assisted = true;
    if (episodes.has(episode) || targets.has(a.exerciseId) || (a.responseIndex ?? 0) > 0) continue;
    episodes.add(episode);
    targets.add(a.exerciseId);
    if (a.evidence !== 'answer' || !['correct', 'incorrect'].includes(a.outcome)) {
      unassessed++;
      continue;
    }
    if (a.outcome === 'correct') {
      correct++;
      points += 100;
      combo++;
      bestCombo = Math.max(combo, bestCombo);
    } else {
      incorrect++;
      combo = 0;
    }
  }
  return {
    points,
    combo,
    bestCombo,
    correct,
    incorrect,
    unassessed,
    assisted,
    ranked:
      run.mode === 'challenge' &&
      !assisted &&
      unassessed === 0 &&
      correct + incorrect === run.targetExerciseIds.length &&
      correct + incorrect > 0,
  };
}
export function personalBestKey(run: StageRun) {
  return JSON.stringify([
    run.policy,
    run.sourceId,
    run.taskVersion,
    run.input,
    run.tempo,
    run.support,
    run.targetExerciseIds,
  ]);
}
export const stageRunSchema = z.object({
  id: z.string().max(100),
  mode: z.enum(['rehearsal', 'challenge']),
  policy: z.literal(STAGE_POLICY),
  sourceId: z.string().max(200),
  taskVersion: z.string().max(100),
  input: z.literal('screen'),
  tempo: z.number().min(0.25).max(1.5),
  support: z.literal('hidden'),
  startedAt: z.number(),
  capability: z.object({ qualified: z.literal(true), timingQualified: z.literal(false) }),
  targetExerciseIds: z.array(z.string().max(200)).min(1).max(5),
  attemptIds: z.array(z.string().max(200)).max(2000),
  assisted: z.boolean(),
  endedAt: z.number().optional(),
});
