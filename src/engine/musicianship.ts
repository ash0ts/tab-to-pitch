import {
  activityKindSchema,
  practiceResponseSchema,
  type ActivityKind,
  type PracticeResponse,
  type SupportKind,
} from '../shared/practice';

export interface TimedStudy {
  id: string;
  label: string;
  cells: (number | null)[];
  beatsPerBar: 4;
  tempo: number;
  articulation: 'normal' | 'staccato';
  dynamics: 'mp' | 'f';
  texture: 'chords' | 'melody';
}
export interface MusicianshipTask {
  id: string;
  version: 'musicianship-v1';
  kind: ActivityKind;
  variant: number;
  title: string;
  prompt: string;
  skill: string;
  stimulus: TimedStudy;
  comparison: TimedStudy;
  allowedPitches: number[];
  destination: number;
  difference: 'articulation' | 'dynamics';
}
// Original two-bar studies. Eight eighth-note slots per bar; null is a rest, never an unknown note.
const rhythms = [
  [55, null, 55, 55, null, 55, null, null, 60, null, 60, null, 60, null, null, null],
  [55, 55, null, 55, null, null, 55, null, 60, null, null, 60, null, 60, null, null],
  [55, null, null, 55, 55, null, 55, null, 60, 60, null, null, 60, null, 60, null],
  [55, null, 55, null, 55, 55, null, null, 60, null, 60, 60, null, null, 60, null],
] as const;
export function musicianshipTask(kind: ActivityKind, variant = 0): MusicianshipTask {
  activityKindSchema.parse(kind);
  if (!Number.isInteger(variant) || variant < 0 || variant > 3)
    throw new Error('Unknown original study.');
  const id = `musicianship-v1:${kind}:${variant}`;
  const base: TimedStudy = {
    id,
    label: 'Original G7 → Cmaj7 study · synthesis',
    cells: [...rhythms[variant]!],
    beatsPerBar: 4,
    tempo: 84,
    articulation: 'normal',
    dynamics: 'mp',
    texture: kind === 'rhythm' ? 'chords' : 'melody',
  };
  const difference = variant % 2 ? 'dynamics' : 'articulation';
  const stimulus =
    kind === 'rhythm'
      ? base
      : {
          ...base,
          cells: [
            [55, null, 59, null, 53, null, 50, null, 52, null, 55, null, 59, null, 60, null],
            [50, 53, null, 55, null, 59, null, null, 60, null, 59, 55, null, 52, null, null],
            [50, null, 53, null, 55, 59, null, null, 60, null, 59, null, 55, 52, null, null],
            [55, 53, null, null, 50, null, 59, null, 52, 55, null, 59, null, 60, null, null],
          ][variant]!,
        };
  return {
    id,
    version: 'musicianship-v1',
    kind,
    variant,
    title:
      kind === 'rhythm'
        ? 'Place the chord changes in time'
        : kind === 'phrase'
          ? 'Make a two-bar response'
          : 'Choose how the phrase speaks',
    prompt:
      kind === 'rhythm'
        ? 'Listen, then place the attacks and rests. Each square is half a beat; the chord changes at bar 2.'
        : kind === 'phrase'
          ? 'Build two bars using the supplied notes. Include a rest, use at least three notes, and end your last sounding note on E over Cmaj7. Any construction meeting these constraints is valid.'
          : 'Hear versions A and B. Which factual feature changes? Then describe the intention you would choose. Your preference is not graded.',
    skill:
      kind === 'rhythm'
        ? 'harmonic-timing'
        : kind === 'phrase'
          ? 'phrase-with-destination'
          : 'expressive-distinction',
    stimulus,
    comparison: {
      ...stimulus,
      id: `${id}:comparison`,
      label: 'Original comparison · synthesis',
      ...(difference === 'dynamics'
        ? { dynamics: 'f' as const }
        : { articulation: 'staccato' as const }),
    },
    allowedPitches: [50, 52, 53, 55, 59, 60],
    destination: 52,
    difference,
  };
}

export function gradeMusicianship(
  task: MusicianshipTask,
  raw: unknown,
): { correct: boolean; feedback: string; response: PracticeResponse } {
  const parsed = practiceResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Use the supplied answer controls.');
  const response = parsed.data;
  if (task.kind === 'expression') {
    const correct = response.difference === task.difference;
    return {
      correct,
      response,
      feedback: correct
        ? 'That describes the audible difference. Your intention is saved as reflection, not a right or wrong artistic choice.'
        : 'That feature stays the same in this pair. Compare the note lengths and loudness, then try again.',
    };
  }
  const cells = response.cells;
  if (!cells || cells.length !== 16)
    return {
      correct: false,
      response,
      feedback: 'Complete a two-bar grid of sixteen half-beat slots.',
    };
  if (task.kind === 'rhythm') {
    if (cells.some((pitch, index) => pitch !== null && pitch !== (index < 8 ? 55 : 60)))
      return {
        correct: false,
        response,
        feedback: 'Use the supplied chord attack or a rest in each slot.',
      };
    const first = cells.findIndex((value, index) => value !== task.stimulus.cells[index]);
    return {
      correct: first === -1,
      response,
      feedback:
        first === -1
          ? 'The attacks and rests match this study. This checks a symbolic response; it does not assess playing in time.'
          : `The pattern differs in bar ${first < 8 ? 1 : 2}. Replay that bar and compare where you placed attacks and rests.`,
    };
  }
  if (cells.some((pitch) => pitch !== null && !task.allowedPitches.includes(pitch)))
    return {
      correct: false,
      response,
      feedback: 'One pitch is outside the supplied note palette.',
    };
  const sounded = cells.filter((pitch): pitch is number => pitch !== null);
  const failures = [
    sounded.length < 3 && 'use at least three sounding notes',
    !cells.includes(null) && 'leave at least one rest',
    (sounded.at(-1) !== task.destination || cells.slice(8).every((pitch) => pitch === null)) &&
      'finish your last sounding note on E in bar 2',
  ].filter(Boolean);
  return {
    correct: failures.length === 0,
    response,
    feedback: failures.length
      ? `Revise your response: ${failures.join('; ')}.`
      : 'Your response meets all three constraints. Listen and decide whether it says what you intended. There is no single preferred phrase.',
  };
}

export function supportText(task: MusicianshipTask, level: SupportKind): string {
  if (level === 'cue')
    return task.kind === 'rhythm'
      ? 'Count “one and two and three and four and.” Attend to one bar at a time.'
      : task.kind === 'phrase'
        ? 'Choose the destination first, then leave room to breathe before it.'
        : 'Attend to one feature at a time: how long each note lasts, then how loud it is.';
  if (level === 'comparison')
    return task.kind === 'rhythm'
      ? 'Replay the original and then your grid. Listen for the first place they differ.'
      : task.kind === 'phrase'
        ? 'Audition your current phrase. Does its final sounding note arrive after the chord change?'
        : 'Alternate versions A and B. Pitch and attack times are held constant.';
  if (level === 'worked-example')
    return task.kind === 'rhythm'
      ? 'A separate example: an attack on each numbered beat leaves every “and” empty. It is a demonstration, not this answer.'
      : task.kind === 'phrase'
        ? 'One possible response is G, rest, F, rest | E, rest, rest, rest. Change its rhythm or add a note while preserving the stated constraints.'
        : 'Short detached notes and connected notes use articulation differently; loud and soft versions differ in dynamics.';
  return task.kind === 'rhythm'
    ? task.stimulus.cells
        .map((p, i) => `${i === 8 ? '| ' : ''}${p === null ? 'rest' : 'attack'}`)
        .join(' · ')
    : task.kind === 'phrase'
      ? 'There are many valid responses. Use at least three supplied notes, leave a rest, and make the final sounding note E in bar 2.'
      : `The difference is ${task.difference}. The pitches and attack times are the same.`;
}

export function workedStudy(task: MusicianshipTask): TimedStudy {
  return {
    ...task.stimulus,
    id: `${task.id}:worked`,
    label: 'Worked demonstration · synthesis',
    cells:
      task.kind === 'rhythm'
        ? [55, null, 55, null, 55, null, 55, null, 60, null, 60, null, 60, null, 60, null]
        : [
            55,
            null,
            null,
            null,
            53,
            null,
            null,
            null,
            52,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ],
  };
}

export function responseStudy(task: MusicianshipTask, response: PracticeResponse): TimedStudy {
  const parsed = practiceResponseSchema.parse(response);
  if (
    !parsed.cells ||
    parsed.cells.length !== 16 ||
    parsed.cells.some((p) => p !== null && !task.allowedPitches.includes(p))
  )
    throw new Error('The phrase cannot be auditioned with these notes.');
  return {
    ...task.stimulus,
    id: `${task.id}:learner`,
    label: 'Your proposed response · synthesis',
    cells: parsed.cells,
  };
}

/** Identity of an audible stimulus, independent of its activity or record ID. */
export function studySoundKey(study: TimedStudy): string {
  return `study-sound:${study.texture}:${study.tempo}:${study.articulation}:${study.dynamics}:${study.cells.map((p) => p ?? 'r').join(',')}`;
}
export function isReservedStudy(task: MusicianshipTask, exposed: ReadonlySet<string>): boolean {
  return (
    !exposed.has(task.id) &&
    ![task.stimulus, task.comparison].some((study) => exposed.has(studySoundKey(study)))
  );
}
