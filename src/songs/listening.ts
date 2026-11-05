import { z } from 'zod';
import { defineChord, parseChordSymbol, romanNumeral, scaleTones } from '../engine/harmony.js';
import { passageSchema, passageReady, RECORDINGS, type Passage } from './catalog.js';

export const LISTENING_VERSION = 'listening-v1';
export const difficultySchema = z.enum(['guided', 'recall', 'transfer']);
export type ListeningDifficulty = z.infer<typeof difficultySchema>;
export const listeningExerciseSchema = z
  .object({
    id: z.string().max(160),
    version: z.literal(LISTENING_VERSION),
    passage: passageSchema,
    source: z.enum(['recording', 'synthesized']),
    difficulty: difficultySchema,
    slots: z.array(z.number().int().min(0).max(7)).min(1).max(8),
    choices: z.array(z.string().max(24)).min(2).max(24),
  })
  .strict();
export type ListeningExercise = z.infer<typeof listeningExerciseSchema>;
export const listeningGradeSchema = z
  .object({
    correct: z.boolean(),
    root: z.array(z.boolean()),
    quality: z.array(z.boolean()),
    sequence: z.boolean(),
    feedback: z.array(z.string().max(400)),
  })
  .strict();
export const listeningAttemptSchema = z
  .object({
    id: z.string().uuid(),
    episodeId: z.string().uuid().optional(),
    responseIndex: z.number().int().nonnegative().optional(),
    exerciseId: z.string().max(160),
    at: z.number().nonnegative(),
    response: z.array(z.string().max(24)).max(8),
    outcome: z.enum(['answered', 'revealed', 'interrupted']),
    assisted: z.boolean(),
    replayCount: z.number().int().nonnegative(),
    responseMs: z.number().nonnegative(),
    familiar: z.boolean(),
    source: z.enum(['recording', 'synthesized']),
    grade: listeningGradeSchema.nullable(),
  })
  .strict();
export type ListeningAttempt = z.infer<typeof listeningAttemptSchema>;
export function createListeningExercise(
  passage: Passage,
  difficulty: ListeningDifficulty,
  source: 'recording' | 'synthesized' = 'synthesized',
  variant = 0,
): ListeningExercise {
  if (!passageReady(passage)) throw new Error('This passage is not reviewed for grading.');
  if (
    source === 'recording' &&
    RECORDINGS.find((r) => r.id === passage.recordingId)?.provider !== 'youtube'
  )
    throw new Error('This passage has no external recording.');
  const slots =
    difficulty === 'guided'
      ? [Math.abs(variant) % passage.chords.length]
      : passage.chords.map((_, i) => i);
  const tones = scaleTones({ tonic: passage.tonic, mode: 'ionian' });
  const selected = difficulty === 'guided' ? slots.map((i) => passage.chords[i]!) : passage.chords;
  const choices = new Set(selected.flatMap((c) => [c.symbol, ...c.alternatives]));
  for (const c of selected) {
    const chord = parseChordSymbol(c.symbol)!;
    choices.add(
      defineChord(
        chord.rootName,
        chord.quality === 'minor' || chord.quality === 'm7' ? 'major' : 'minor',
      )!.symbol,
    );
  }
  if (difficulty === 'guided')
    for (const c of passage.chords) {
      if (choices.size >= 4) break;
      choices.add(c.symbol);
    }
  if (difficulty !== 'guided')
    tones.forEach((t, i) =>
      choices.add(
        defineChord(t.noteName, i === 6 ? 'diminished' : [1, 2, 5].includes(i) ? 'minor' : 'major')!
          .symbol,
      ),
    );
  return listeningExerciseSchema.parse({
    id: `${LISTENING_VERSION}:${passage.id}:${source}:${difficulty}:${variant}`,
    version: LISTENING_VERSION,
    passage,
    source,
    difficulty,
    slots,
    choices: [...choices].sort(),
  });
}
function same(a: string, b: string, part: 'root' | 'quality' | 'both') {
  const left = parseChordSymbol(a),
    right = parseChordSymbol(b);
  return (
    !!left &&
    !!right &&
    (part === 'quality' || left.rootPitchClass === right.rootPitchClass) &&
    (part === 'root' || left.quality === right.quality)
  );
}
export function gradeListening(exercise: ListeningExercise, answers: string[]) {
  const root: boolean[] = [],
    quality: boolean[] = [],
    feedback: string[] = [];
  const accepted = exercise.slots.map((slot) => {
    const chord = exercise.passage.chords[slot]!;
    return [chord.symbol, ...chord.alternatives];
  });
  accepted.forEach((expected, i) => {
    const answer = answers[i] ?? '';
    root.push(expected.some((c) => same(answer, c, 'root')));
    quality.push(expected.some((c) => same(answer, c, 'quality')));
    if (!expected.some((c) => same(answer, c, 'both'))) {
      const reason =
        root[i] && quality[i]
          ? 'The root and quality belong to different accepted interpretations; choose a supported pair.'
          : root[i]
            ? 'The root matches; compare the chord quality.'
            : quality[i]
              ? 'The quality matches; listen for the root movement.'
              : 'Compare the root movement and chord quality separately.';
      feedback.push(
        `Change ${exercise.slots[i]! + 1}: ${reason}`,
      );
    }
  });
  // Count reordered chord sets separately from root and quality errors.
  // A bitmask match handles overlapping alternatives without consuming the wrong one greedily.
  let assignments = new Set([0]);
  for (const values of accepted) {
    const next = new Set<number>();
    for (const mask of assignments)
      answers.forEach((answer, i) => {
        if (!(mask & (1 << i)) && values.some((c) => same(answer, c, 'both')))
          next.add(mask | (1 << i));
      });
    assignments = next;
  }
  const sameSet = answers.length === accepted.length && assignments.has((1 << answers.length) - 1);
  const correct =
    answers.length === accepted.length &&
    accepted.every((values, i) => values.some((c) => same(answers[i]!, c, 'both')));
  if (!correct && sameSet)
    feedback.unshift(
      'You chose the chord set in a different order. Replay the change before placing each chord.',
    );
  if (correct)
    feedback.push(
      'The roots, qualities, and order match this passage. Try the progression in another neck region.',
    );
  return { correct, root, quality, sequence: correct, feedback };
}
export function passageNumerals(p: Passage) {
  return p.chords.map((c) =>
    romanNumeral(parseChordSymbol(c.symbol)!, { tonic: p.tonic, mode: 'ionian' }),
  );
}
