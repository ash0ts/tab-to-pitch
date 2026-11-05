import { SKILL_ORDER } from './exercises';
import type { AttemptRecord, ExerciseDefinition, ExerciseKind, ExerciseSelection } from './types';

/** Product defaults, not a validated learning model. All gates use explicit answers. */
export const SCHEDULER_DEFAULTS = {
  recallDelayMs: 24 * 60 * 60 * 1000,
  reviewIntervalsDays: [1, 3, 7] as readonly number[],
  successesForTransfer: 3,
  distinctVariantsForTransfer: 2,
} as const;

export interface SkillProgress {
  skillId: ExerciseKind;
  correctUnassisted: number;
  distinctVariants: number;
  practiceCorrectStreak: number;
  readyForTransfer: boolean;
  transferPassed: boolean;
  delayedPassed: boolean;
}

export const isUnassistedAnswer = (attempt: AttemptRecord): boolean =>
  (attempt.outcome === 'correct' || attempt.outcome === 'incorrect') &&
  !attempt.assisted &&
  attempt.hintsUsed.length === 0 &&
  attempt.evidence === 'answer';

const exposureKeys = (
  record: Pick<AttemptRecord, 'transferKeys' | 'noteIds' | 'scoreId' | 'trackId'>,
): string[] =>
  record.transferKeys?.length
    ? record.transferKeys
    : record.noteIds.map((id) => `${record.scoreId}:${record.trackId}:${id}`);

interface ReviewState {
  due: number | null;
  delayedSuccesses: number;
}

function advanceReview(state: ReviewState, attempt: AttemptRecord): void {
  if (
    attempt.outcome !== 'correct' &&
    attempt.outcome !== 'incorrect' &&
    attempt.outcome !== 'revealed'
  )
    return;
  if (attempt.outcome !== 'correct' || !isUnassistedAnswer(attempt)) {
    state.delayedSuccesses = 0;
    state.due = null;
    return;
  }
  if (attempt.mode === 'delayed' && state.due !== null && attempt.startedAt >= state.due)
    state.delayedSuccesses++;
  const days =
    SCHEDULER_DEFAULTS.reviewIntervalsDays[
      Math.min(state.delayedSuccesses, SCHEDULER_DEFAULTS.reviewIntervalsDays.length - 1)
    ]!;
  state.due = attempt.answeredAt + days * SCHEDULER_DEFAULTS.recallDelayMs;
}

/** Validate check labels against evidence available when each question started. */
export function assessmentChecks(attempts: readonly AttemptRecord[]): {
  delayed: AttemptRecord[];
  transfer: AttemptRecord[];
} {
  const starts = attempts
    .filter((attempt) => attempt.evidence === 'answer')
    .sort(
      (a, b) =>
        a.startedAt - b.startedAt || a.answeredAt - b.answeredAt || a.id.localeCompare(b.id),
    );
  const completions = [...attempts].sort(
    (a, b) => a.answeredAt - b.answeredAt || a.startedAt - b.startedAt || a.id.localeCompare(b.id),
  );
  const review = new Map<string, ReviewState>();
  const exposed = new Set<string>();
  const delayed: AttemptRecord[] = [];
  const transfer: AttemptRecord[] = [];
  let cursor = 0;
  for (const attempt of starts) {
    while (cursor < completions.length && completions[cursor]!.answeredAt < attempt.startedAt) {
      const completed = completions[cursor++]!;
      const state = review.get(completed.exerciseId) ?? { due: null, delayedSuccesses: 0 };
      advanceReview(state, completed);
      review.set(completed.exerciseId, state);
    }
    const keys = exposureKeys(attempt);
    if (isUnassistedAnswer(attempt)) {
      const due = review.get(attempt.exerciseId)?.due;
      if (
        attempt.mode === 'delayed' &&
        attempt.partition === 'practice' &&
        due != null &&
        attempt.startedAt >= due
      )
        delayed.push(attempt);
      if (
        attempt.mode === 'transfer' &&
        attempt.partition === 'heldout' &&
        keys.length > 0 &&
        !keys.some((key) => exposed.has(key))
      )
        transfer.push(attempt);
    }
    for (const key of keys) exposed.add(key);
  }
  return { delayed, transfer };
}

export function skillProgress(
  attempts: readonly AttemptRecord[],
  skillId: ExerciseKind,
  allAttempts: readonly AttemptRecord[] = attempts,
): SkillProgress {
  const correct = attempts.filter(
    (attempt) =>
      attempt.skillId === skillId && attempt.outcome === 'correct' && isUnassistedAnswer(attempt),
  );
  const ordered = attempts
    .filter((attempt) => attempt.skillId === skillId)
    .sort((a, b) => a.answeredAt - b.answeredAt);
  let practiceStreak: AttemptRecord[] = [];
  for (const attempt of ordered) {
    if (attempt.outcome === 'incorrect' || attempt.outcome === 'revealed') practiceStreak = [];
    if (
      attempt.partition === 'practice' &&
      attempt.outcome === 'correct' &&
      isUnassistedAnswer(attempt)
    )
      practiceStreak.push(attempt);
  }
  const distinctVariants = new Set(
    practiceStreak.map((attempt) => JSON.stringify([...exposureKeys(attempt)].sort())),
  ).size;
  const relevantIds = new Set(attempts.map((attempt) => attempt.id));
  const checks = assessmentChecks(allAttempts);
  const passed = (attempt: AttemptRecord) =>
    relevantIds.has(attempt.id) && attempt.skillId === skillId && attempt.outcome === 'correct';
  const transferPassed = checks.transfer.some(passed);
  const delayedPassed = checks.delayed.some(passed);
  return {
    skillId,
    correctUnassisted: correct.length,
    distinctVariants,
    practiceCorrectStreak: practiceStreak.length,
    readyForTransfer:
      practiceStreak.length >= SCHEDULER_DEFAULTS.successesForTransfer &&
      distinctVariants >= SCHEDULER_DEFAULTS.distinctVariantsForTransfer,
    transferPassed,
    delayedPassed,
  };
}

export function reviewDueAt(exerciseId: string, attempts: readonly AttemptRecord[]): number | null {
  const history = attempts
    .filter(
      (attempt) =>
        attempt.exerciseId === exerciseId &&
        (attempt.outcome === 'correct' ||
          attempt.outcome === 'incorrect' ||
          attempt.outcome === 'revealed'),
    )
    .sort((a, b) => a.answeredAt - b.answeredAt);
  const state: ReviewState = { due: null, delayedSuccesses: 0 };
  for (const attempt of history) advanceReview(state, attempt);
  return state.due;
}

export function selectNextExercise(
  bank: readonly ExerciseDefinition[],
  attempts: readonly AttemptRecord[],
  now: number,
  preferredSkill?: ExerciseKind,
): ExerciseSelection | null {
  if (bank.length === 0) return null;
  const ids = new Set(bank.map((exercise) => exercise.id));
  const relevant = attempts.filter((attempt) => ids.has(attempt.exerciseId));
  const latest = new Map<string, AttemptRecord>();
  for (const attempt of relevant) {
    if (attempt.outcome === 'interrupted' || attempt.outcome === 'self-reported') continue;
    if (
      !latest.has(attempt.exerciseId) ||
      latest.get(attempt.exerciseId)!.answeredAt <= attempt.answeredAt
    )
      latest.set(attempt.exerciseId, attempt);
  }
  const eligible = preferredSkill
    ? bank.filter((exercise) => exercise.skillId === preferredSkill)
    : [...bank];
  if (eligible.length === 0) return null;
  const eligibleIds = new Set(eligible.map((exercise) => exercise.id));
  const mostRecent = relevant
    .filter(
      (attempt) =>
        eligibleIds.has(attempt.exerciseId) &&
        attempt.outcome !== 'interrupted' &&
        attempt.outcome !== 'self-reported',
    )
    .sort((a, b) => b.answeredAt - a.answeredAt)[0];
  if (mostRecent && (mostRecent.outcome === 'incorrect' || mostRecent.outcome === 'revealed')) {
    const retry = eligible.find((exercise) => exercise.id === mostRecent.exerciseId)!;
    return {
      exercise: retry,
      mode: 'learn',
      support: 'guided',
      reason: 'Review this idea with its clues restored, then try it again without them.',
    };
  }

  const due = eligible
    .filter((exercise) => {
      const dueAt = reviewDueAt(exercise.id, relevant);
      return exercise.partition === 'practice' && dueAt !== null && now >= dueAt;
    })
    .sort((a, b) => reviewDueAt(a.id, relevant)! - reviewDueAt(b.id, relevant)!);
  if (due[0])
    return {
      exercise: due[0],
      mode: 'delayed',
      support: 'hidden',
      reason: 'This item is due for a spaced review. Check what you retained without hints.',
    };

  const skills = preferredSkill
    ? [preferredSkill]
    : SKILL_ORDER.filter((skill) => eligible.some((exercise) => exercise.skillId === skill));
  for (const skill of skills) {
    const progress = skillProgress(relevant, skill, attempts);
    if (progress.readyForTransfer && !progress.transferPassed) {
      // A held-out item is used only once as transfer evidence, even after a reveal.
      const exposedKeys = new Set(
        attempts.filter((attempt) => attempt.evidence === 'answer').flatMap(exposureKeys),
      );
      const transfer = eligible.find(
        (exercise) =>
          exercise.skillId === skill &&
          exercise.partition === 'heldout' &&
          !exposureKeys(exercise).some((key) => exposedKeys.has(key)),
      );
      if (transfer)
        return {
          exercise: transfer,
          mode: 'transfer',
          support: 'hidden',
          reason: 'Try a question held back from the scheduled practice set, without hints.',
        };
    }
    if (progress.transferPassed && !preferredSkill) continue;
    const practice = eligible.filter(
      (exercise) => exercise.skillId === skill && exercise.partition === 'practice',
    );
    const taught = eligible
      .filter((exercise) => exercise.skillId === skill)
      .filter((exercise) => {
        const last = latest.get(exercise.id);
        return last?.outcome === 'correct' && last.assisted;
      })
      .sort((a, b) => latest.get(b.id)!.answeredAt - latest.get(a.id)!.answeredAt)[0];
    if (taught)
      return {
        exercise: taught,
        mode: 'recall',
        support: 'hidden',
        reason:
          'Try the idea again with its labels hidden. The earlier guided answer does not count as recall.',
      };
    const hasInstruction = relevant.some(
      (attempt) =>
        attempt.skillId === skill &&
        attempt.outcome !== 'interrupted' &&
        attempt.outcome !== 'self-reported',
    );
    const unseen = practice.find((exercise) => !latest.has(exercise.id));
    if (unseen)
      return {
        exercise: unseen,
        mode: hasInstruction ? 'recall' : 'learn',
        support: hasInstruction ? 'hidden' : 'guided',
        reason: hasInstruction
          ? 'Apply the same idea to another note.'
          : 'Start with the selected notes. Hints are available and recorded separately.',
      };
    if (practice.length > 0) {
      const retry = [...practice].sort((a, b) => {
        const left = latest.get(a.id)!;
        const right = latest.get(b.id)!;
        const leftNeedsWork = left.outcome !== 'correct' || left.assisted;
        const rightNeedsWork = right.outcome !== 'correct' || right.assisted;
        return Number(rightNeedsWork) - Number(leftNeedsWork) || left.answeredAt - right.answeredAt;
      })[0]!;
      const needsGuidance =
        latest.get(retry.id)?.outcome === 'incorrect' ||
        latest.get(retry.id)?.outcome === 'revealed';
      return needsGuidance
        ? {
            exercise: retry,
            mode: 'learn',
            support: 'guided',
            reason: 'Review this idea with its clues restored, then try it again without them.',
          }
        : {
            exercise: retry,
            mode: 'recall',
            support: 'hidden',
            reason:
              'Revisit this idea without its earlier hints. Immediate practice is not delayed recall.',
          };
    }
  }
  const fallback = eligible.find((exercise) => exercise.partition === 'practice');
  return fallback
    ? {
        exercise: fallback,
        mode: 'recall',
        support: 'hidden',
        reason: 'Review a previously practiced idea.',
      }
    : null;
}
