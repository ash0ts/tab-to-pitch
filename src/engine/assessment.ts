import { midiToSpn, parsePitch, parsePitchClass, pitchClass } from './theory';
import { SKILL_ORDER } from './exercises';
import { assessmentChecks, isUnassistedAnswer } from './scheduler';
import type {
  AttemptOutcome,
  AttemptRecord,
  ExerciseDefinition,
  ExerciseKind,
  GradeResult,
  PracticeMode,
} from './types';

const normalizeText = (value: string): string =>
  value.trim().toLowerCase().replaceAll('-', ' ').replace(/\s+/g, ' ');

export function answerLabel(exercise: ExerciseDefinition): string {
  const answer = exercise.answer;
  if (answer.type === 'position-pair')
    return answer.pairs
      .map(({ from, to }) => `${from.string}:${from.fret} → ${to.string}:${to.fret}`)
      .join(' or ');
  if (answer.type === 'pitch')
    return answer.octaveRequired === false
      ? midiToSpn(answer.midi).replace(/-?\d+$/, '')
      : midiToSpn(answer.midi);
  if (answer.type === 'position')
    return answer.positions
      .map((position) => `string ${position.string}, fret ${position.fret}`)
      .join(' or ');
  return answer.accepted[0] ?? '';
}

export function gradeExercise(exercise: ExerciseDefinition, response: string): GradeResult {
  const answer = exercise.answer;
  let correct = false;
  if (answer.type === 'pitch') {
    const parsedMidi = parsePitch(response);
    correct =
      answer.octaveRequired === false
        ? (parsedMidi === null ? parsePitchClass(response) : pitchClass(parsedMidi)) ===
          pitchClass(answer.midi)
        : parsedMidi === answer.midi;
  } else if (answer.type === 'position') {
    const match = response.trim().match(/^(?:string\s*)?(\d+)\s*[:,/]\s*(?:fret\s*)?(\d+)$/i);
    if (match) {
      correct = answer.positions.some(
        (position) => position.string === Number(match[1]) && position.fret === Number(match[2]),
      );
    } else if (
      /^\d+$/.test(response.trim()) &&
      new Set(answer.positions.map((position) => position.string)).size === 1
    ) {
      correct = answer.positions.some((position) => position.fret === Number(response.trim()));
    }
  } else if (answer.type === 'position-pair') {
    const match = response
      .trim()
      .match(/^(\d+)\s*[:,/]\s*(\d+)\s*(?:->|>|→|to)\s*(\d+)\s*[:,/]\s*(\d+)$/i);
    correct =
      !!match &&
      answer.pairs.some(
        ({ from, to }) =>
          from.string === Number(match[1]) &&
          from.fret === Number(match[2]) &&
          to.string === Number(match[3]) &&
          to.fret === Number(match[4]),
      );
  } else {
    correct = answer.accepted.some((expected) => {
      // Interval symbols are case-sensitive: 3M and 3m are different answers.
      if (/^-?\d+[PMmAd]+$/.test(expected)) return response.trim() === expected;
      return normalizeText(response) === normalizeText(expected);
    });
  }
  return {
    correct,
    feedback: correct
      ? `Correct. ${exercise.explanation}`
      : `The answer is ${answerLabel(exercise)}. ${exercise.explanation}`,
  };
}

export interface RecordAttemptOptions {
  startedAt: number;
  answeredAt: number;
  mode?: PracticeMode;
  assisted?: boolean;
  hintsUsed?: string[];
  outcome?: Exclude<AttemptOutcome, 'correct' | 'incorrect'>;
  id?: string;
}

export function recordAttempt(
  exercise: ExerciseDefinition,
  response: string,
  options: RecordAttemptOptions,
): AttemptRecord {
  if (
    !Number.isFinite(options.startedAt) ||
    !Number.isFinite(options.answeredAt) ||
    options.answeredAt < options.startedAt
  ) {
    throw new Error('Attempt timestamps must be finite and ordered.');
  }
  const hintsUsed = [...new Set(options.hintsUsed ?? [])];
  const outcome =
    options.outcome ?? (gradeExercise(exercise, response).correct ? 'correct' : 'incorrect');
  return {
    id: options.id ?? `${exercise.id}:attempt:${options.answeredAt}`,
    exerciseId: exercise.id,
    scoreId: exercise.scoreId,
    trackId: exercise.trackId,
    skillId: exercise.skillId,
    kind: exercise.kind,
    noteIds: [...exercise.noteIds],
    response,
    outcome,
    assisted: options.assisted === true || hintsUsed.length > 0 || outcome === 'revealed',
    hintsUsed,
    startedAt: options.startedAt,
    answeredAt: options.answeredAt,
    responseMs: options.answeredAt - options.startedAt,
    mode: options.mode ?? 'learn',
    partition: exercise.partition,
    evidence: outcome === 'self-reported' ? 'self-report' : 'answer',
    transferKeys: [...(exercise.transferKeys ?? [])],
  };
}

export interface PracticeMetrics {
  graded: number;
  unassisted: number;
  unassistedCorrect: number;
  assisted: number;
  assistedCorrect: number;
  unassistedAccuracy: number | null;
  revealed: number;
  interrupted: number;
  selfReported: number;
  delayedAttempts: number;
  delayedCorrect: number;
  transferAttempts: number;
  transferCorrect: number;
  medianResponseMs: number | null;
}

export function practiceMetrics(attempts: readonly AttemptRecord[]): PracticeMetrics {
  const graded = attempts.filter(
    (attempt) => attempt.outcome === 'correct' || attempt.outcome === 'incorrect',
  );
  const unassisted = graded.filter(isUnassistedAnswer);
  const { delayed, transfer } = assessmentChecks(attempts);
  const durations = unassisted.map((attempt) => attempt.responseMs).sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  const unassistedCorrect = unassisted.filter((attempt) => attempt.outcome === 'correct').length;
  return {
    graded: graded.length,
    unassisted: unassisted.length,
    unassistedCorrect,
    assisted: graded.filter((attempt) => attempt.assisted).length,
    assistedCorrect: graded.filter((attempt) => attempt.assisted && attempt.outcome === 'correct')
      .length,
    unassistedAccuracy: unassisted.length ? unassistedCorrect / unassisted.length : null,
    revealed: attempts.filter((attempt) => attempt.outcome === 'revealed').length,
    interrupted: attempts.filter((attempt) => attempt.outcome === 'interrupted').length,
    selfReported: attempts.filter((attempt) => attempt.outcome === 'self-reported').length,
    delayedAttempts: delayed.length,
    delayedCorrect: delayed.filter((attempt) => attempt.outcome === 'correct').length,
    transferAttempts: transfer.length,
    transferCorrect: transfer.filter((attempt) => attempt.outcome === 'correct').length,
    medianResponseMs:
      durations.length === 0
        ? null
        : durations.length % 2
          ? durations[middle]!
          : (durations[middle - 1]! + durations[middle]!) / 2,
  };
}

export function buildPracticeEvidence(attempts: readonly AttemptRecord[]): {
  id: string;
  skillId: ExerciseKind;
  attempts: number;
  correct: number;
  assisted: number;
}[] {
  return SKILL_ORDER.map((skillId) => {
    const metrics = practiceMetrics(attempts.filter((attempt) => attempt.skillId === skillId));
    return {
      id: `skill:${skillId}`,
      skillId,
      attempts: metrics.graded + metrics.revealed,
      correct: metrics.unassistedCorrect,
      assisted: metrics.assisted + metrics.revealed,
    };
  });
}
