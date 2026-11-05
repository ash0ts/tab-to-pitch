import { describe, expect, it } from 'vitest';
import {
  analyzeTriad,
  deriveTriad,
  findUnisons,
  isQuizEligible,
  midiToSpn,
  noteLabel,
  parsePitch,
  soundingAt,
  spelledInterval,
  STANDARD_TUNING,
} from './theory';
import { createExerciseBank, exerciseLoop } from './exercises';
import { buildPracticeEvidence, gradeExercise, practiceMetrics, recordAttempt } from './assessment';
import { reviewDueAt, SCHEDULER_DEFAULTS, selectNextExercise, skillProgress } from './scheduler';
import type { ExerciseDefinition, NoteEvent, ScoreDocument } from './types';

function note(id: string, midi: number, options: Partial<NoteEvent> = {}): NoteEvent {
  return {
    id,
    trackId: 'guitar',
    staffIndex: 0,
    voiceIndex: 0,
    measureIndex: 0,
    beatId: `beat:${id}`,
    onsetTicks: 0,
    durationTicks: 960,
    soundingMidi: midi,
    spelling: midiToSpn(midi),
    position: { string: 6, fret: midi - 40 },
    effects: {},
    eligible: true,
    ...options,
  };
}

function scoreFixture(): ScoreDocument {
  const voicings = [
    [
      [6, 3],
      [5, 2],
      [4, 0],
    ],
    [
      [5, 3],
      [4, 2],
      [3, 0],
    ],
    [
      [4, 0],
      [3, 2],
      [1, 1],
    ],
    [
      [6, 6],
      [5, 5],
      [4, 3],
    ],
  ];
  const notes = voicings.flatMap((voicing, measureIndex) =>
    voicing.flatMap(([string, fret], index) => {
      const midi = STANDARD_TUNING[string! - 1]! + fret!;
      const position = { string: string!, fret: fret! };
      return [
        note(`m${measureIndex}:chord:${index}`, midi, {
          position,
          measureIndex,
          onsetTicks: measureIndex * 3840,
        }),
        note(`m${measureIndex}:melody:${index}`, midi, {
          position,
          measureIndex,
          onsetTicks: measureIndex * 3840 + (index + 1) * 960,
        }),
      ];
    }),
  );
  return {
    id: 'test-original-composition',
    hash: 'fixture',
    title: 'Original test study',
    tracks: [
      { id: 'guitar', index: 0, name: 'Guitar', tuningMidi: [...STANDARD_TUNING], capo: 0, notes },
    ],
    measures: [0, 1, 2, 3].map((index) => ({
      index,
      startTicks: index * 3840,
      durationTicks: 3840,
      tempoBpm: 100,
      meter: [4, 4],
    })),
  };
}

const responseFor = (exercise: ExerciseDefinition): string => {
  if (exercise.answer.type === 'pitch') return midiToSpn(exercise.answer.midi);
  if (exercise.answer.type === 'position')
    return `${exercise.answer.positions[0]!.string}:${exercise.answer.positions[0]!.fret}`;
  if (exercise.answer.type === 'position-pair') {
    const { from, to } = exercise.answer.pairs[0]!;
    return `${from.string}:${from.fret} → ${to.string}:${to.fret}`;
  }
  return exercise.answer.accepted[0]!;
};

describe('concert pitch and physical positions', () => {
  it('preserves enharmonic octave boundaries and rejects missing octaves for SPN parsing', () => {
    expect(parsePitch('Cb4')).toBe(59);
    expect(parsePitch('B#3')).toBe(60);
    expect(parsePitch('E♭3')).toBe(51);
    expect(parsePitch('F##4')).toBe(67);
    expect(parsePitch('C')).toBeNull();
    expect(parsePitch('NaN4')).toBeNull();
  });

  it('keeps valid written spelling while rejecting inconsistent spelling', () => {
    expect(noteLabel(note('flat', 58, { spelling: 'Bb3' }))).toBe('Bb3');
    expect(noteLabel(note('bad', 58, { spelling: 'B3' }))).toBe('A#3');
  });

  it('finds exact-pitch unisons without sorting reentrant strings or losing capo', () => {
    expect(findUnisons(64, STANDARD_TUNING)).toEqual([
      { string: 1, fret: 0 },
      { string: 2, fret: 5 },
      { string: 3, fret: 9 },
      { string: 4, fret: 14 },
      { string: 5, fret: 19 },
      { string: 6, fret: 24 },
    ]);
    expect(findUnisons(64, [64, 48, 67, 55], 2, 12)).toEqual([{ string: 4, fret: 7 }]);
    expect(findUnisons(64.5, STANDARD_TUNING)).toEqual([]);
  });

  it('excludes unsupported technique from graded questions without discarding its source data', () => {
    for (const effects of [
      { bend: [{ offset: 0, semitones: 0.5 }] },
      { harmonic: 'natural' },
      { tieDestination: true },
      { unsupported: ['microtonal'] },
      { slide: true },
    ]) {
      const source = note('effect', 64, { effects });
      expect(isQuizEligible(source)).toBe(false);
      expect(source.effects).toEqual(effects);
    }
  });
});

describe('spelled intervals and conservative triads', () => {
  it('distinguishes augmented fourths from diminished fifths at the same sounding pitch', () => {
    const c = note('c', 60);
    expect(spelledInterval(c, note('sharp', 66, { spelling: 'F#4' }))?.name).toBe(
      'augmented fourth',
    );
    expect(spelledInterval(c, note('flat', 66, { spelling: 'Gb4' }))?.name).toBe(
      'diminished fifth',
    );
    expect(spelledInterval(c, note('unknown', 66, { spelling: null }))).toBeNull();
    expect(spelledInterval(note('d', 62), c)?.name).toBe('major second');
  });

  it('identifies inversions without treating the bass as the root', () => {
    const g = [note('b', 47), note('d', 50), note('g', 55)];
    const triad = analyzeTriad(g)!;
    expect(triad.rootName).toBe('G');
    expect(triad.quality).toBe('major');
    expect(triad.bassRole).toBe('third');
    expect(triad.roles).toEqual({ b: 'third', d: 'fifth', g: 'root' });
    expect(analyzeTriad([...g, note('f', 53)])).toBeNull();
  });

  it('counts a sustained tie origin once when other voices complete a triad', () => {
    const notes = [
      note('g-origin', 55, { durationTicks: 1920 }),
      note('g-continuation', 55, {
        onsetTicks: 960,
        effects: { tieDestination: true },
        eligible: false,
      }),
      note('b', 59, { onsetTicks: 960 }),
      note('d', 62, { onsetTicks: 960 }),
    ];
    expect(analyzeTriad(soundingAt(notes, 959))).toBeNull();
    const active = soundingAt(notes, 960);
    expect(active.map((event) => event.id)).toEqual(['g-origin', 'b', 'd']);
    expect(analyzeTriad(active)).toMatchObject({
      rootName: 'G',
      quality: 'major',
      noteIds: ['g-origin', 'b', 'd'],
    });
    expect(soundingAt(notes, 1920)).toEqual([]);
    expect(notes[1]!.effects.tieDestination).toBe(true);
  });

  it('preserves a flat root and changes only thirds in a derived listening example', () => {
    const source = [note('bb', 58, { spelling: 'Bb3' }), note('d', 62), note('f', 65)];
    expect(analyzeTriad(source)?.rootName).toBe('Bb');
    const before = JSON.stringify(source);
    const derived = deriveTriad(source, 'minor')!;
    expect(derived.pitches.map((pitch) => pitch.midi)).toEqual([58, 61, 65]);
    expect(derived.pitches[1]!.label).toBe('Db4');
    expect(
      derived.pitches.filter((pitch) => pitch.changed).map((pitch) => pitch.sourceNoteId),
    ).toEqual(['d']);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('exercise generation and grading', () => {
  it('does not fabricate adjacent intervals across voices or excluded attacks', () => {
    const score = scoreFixture();
    const first = note('first', 60, { durationTicks: 1920 });
    const next = note('next', 62, { onsetTicks: 960 });
    score.tracks[0]!.notes = [first, { ...next, voiceIndex: 1 }];
    expect(
      createExerciseBank(score, 'guitar').filter((exercise) => exercise.kind === 'interval'),
    ).toEqual([]);
    score.tracks[0]!.notes = [
      first,
      note('bend', 61, { onsetTicks: 480, effects: { bend: [{ offset: 0, semitones: 1 }] } }),
      next,
    ];
    expect(
      createExerciseBank(score, 'guitar').filter((exercise) => exercise.kind === 'interval'),
    ).toEqual([]);
    score.tracks[0]!.notes = [
      first,
      note('chord-a', 64, { onsetTicks: 480 }),
      note('chord-b', 67, { onsetTicks: 480 }),
      next,
    ];
    expect(
      createExerciseBank(score, 'guitar').filter((exercise) => exercise.kind === 'interval'),
    ).toEqual([]);
    score.tracks[0]!.notes = [first, next];
    expect(
      createExerciseBank(score, 'guitar').filter((exercise) => exercise.kind === 'interval'),
    ).toHaveLength(1);
  });

  it('versions identities and distinguishes changes to the location answer range', () => {
    const score = scoreFixture();
    const make = (maxFret: number) =>
      createExerciseBank(score, 'guitar', { maxFret }).find(
        (exercise) => exercise.kind === 'note-location',
      )!;
    const short = make(12),
      full = make(24);
    expect(short.id).toContain(':v3:');
    expect(short.id).not.toBe(full.id);
    expect(make(12).id).toBe(short.id);
    expect(createExerciseBank(score, 'guitar').every((exercise) => exercise.id.length < 128)).toBe(
      true,
    );
  });

  it('generates all four families from supported source notes with compact reproducible IDs', () => {
    const bank = createExerciseBank(scoreFixture(), 'guitar');
    expect(new Set(bank.map((exercise) => exercise.kind))).toEqual(
      new Set(['note-name', 'note-location', 'interval', 'triad-role']),
    );
    expect(new Set(bank.map((exercise) => exercise.id)).size).toBe(bank.length);
    expect(bank.every((exercise) => /^[a-zA-Z0-9:_-]{1,128}$/.test(exercise.id))).toBe(true);
    expect(createExerciseBank(scoreFixture(), 'guitar')).toEqual(bank);
  });

  it('accepts enharmonic pitch classes and optionally requires the correct octave', () => {
    const score = scoreFixture();
    const target = note('flat', 58, { spelling: 'Bb3', position: { string: 1, fret: 0 } });
    score.tracks[0]!.notes = [target];
    const beginner = createExerciseBank(score, 'guitar').find(
      (exercise) => exercise.kind === 'note-name',
    )!;
    expect(gradeExercise(beginner, 'A#').correct).toBe(true);
    expect(gradeExercise(beginner, 'Bb').correct).toBe(true);
    const precise = createExerciseBank(score, 'guitar', { octaveRequired: true }).find(
      (exercise) => exercise.kind === 'note-name',
    )!;
    expect(gradeExercise(precise, 'A#3').correct).toBe(true);
    expect(gradeExercise(precise, 'Bb4').correct).toBe(false);
    expect(gradeExercise(precise, 'Bb').correct).toBe(false);
    expect(beginner.id).not.toBe(precise.id);
  });

  it('accepts every alternative unison and rejects the original position', () => {
    const score = scoreFixture();
    const target = note('e4', 64, { position: { string: 1, fret: 0 } });
    score.tracks[0]!.notes = [target];
    const exercise = createExerciseBank(score, 'guitar').find(
      (candidate) => candidate.kind === 'note-location',
    )!;
    for (const position of findUnisons(64, STANDARD_TUNING).slice(1)) {
      expect(gradeExercise(exercise, `${position.string}:${position.fret}`).correct).toBe(true);
    }
    expect(gradeExercise(exercise, '1:0').correct).toBe(false);
    expect(gradeExercise(exercise, '2:6').correct).toBe(false);
  });

  it('separates note-name locations from exact-pitch grading and display settings', () => {
    const score = scoreFixture();
    score.tracks[0]!.notes = [note('b2', 47, { position: { string: 5, fret: 2 } })];
    const make = (locationMatch: 'pitch-class' | 'exact', showOctaves = false) =>
      createExerciseBank(score, 'guitar', { locationMatch, showOctaves }).find(
        (candidate) => candidate.kind === 'note-location',
      )!;
    const any = make('pitch-class');
    const exact = make('exact');
    expect(gradeExercise(any, '2:0').correct).toBe(true); // B3, an octave above source B2
    expect(gradeExercise(any, '5:14').correct).toBe(true); // same string, another octave
    expect(gradeExercise(exact, '2:0').correct).toBe(false);
    expect(gradeExercise(exact, '6:7').correct).toBe(true); // B2
    expect(gradeExercise(any, '5:2').correct).toBe(false);
    expect(any.id).not.toBe(exact.id);
    expect(make('pitch-class', true).id).toBe(any.id);
    expect(any.choices).toHaveLength(4);
    expect(any.prompt).toContain('B in any octave');
    expect(exact.prompt).toContain('B2 at the same pitch');
    const preciseHistory = [
      recordAttempt(exact, '6:7', { startedAt: 0, answeredAt: 1, mode: 'recall' }),
    ];
    expect(selectNextExercise([any], preciseHistory, 2)?.support).toBe('guided');
  });

  it('does not collapse case-sensitive major and minor interval symbols', () => {
    const bank = createExerciseBank(scoreFixture(), 'guitar');
    const exercise = bank.find(
      (candidate) =>
        candidate.kind === 'interval' &&
        candidate.answer.type === 'text' &&
        candidate.answer.accepted.includes('3M'),
    )!;
    expect(gradeExercise(exercise, '3M').correct).toBe(true);
    expect(gradeExercise(exercise, '3m').correct).toBe(false);
  });

  it('reserves repeated coordinate combinations across all measures', () => {
    const score = scoreFixture();
    const heldout = score.tracks[0]!.notes.find((candidate) => candidate.measureIndex === 3)!;
    const repeated = { ...heldout, id: 'repeat-earlier', measureIndex: 0, onsetTicks: 480 };
    score.tracks[0]!.notes.push(repeated);
    const bank = createExerciseBank(score, 'guitar');
    expect(
      bank
        .filter((exercise) => exercise.noteIds.includes('repeat-earlier'))
        .every((exercise) => exercise.partition === 'heldout'),
    ).toBe(true);
    const practiceKeys = new Set(
      bank
        .filter((exercise) => exercise.partition === 'practice')
        .flatMap((exercise) => exercise.transferKeys ?? []),
    );
    const reserved = `${heldout.soundingMidi}:${heldout.position!.string}:${heldout.position!.fret}`;
    expect(practiceKeys.has(reserved)).toBe(false);
  });

  it('keeps a repeated riff available for practice without inventing a held-out split', () => {
    const score = scoreFixture();
    const phrase = score.tracks[0]!.notes.filter((event) => event.measureIndex === 0);
    score.tracks[0]!.notes = [0, 1, 2, 3].flatMap((measureIndex) =>
      phrase.map((event) => ({
        ...event,
        id: `repeat:${measureIndex}:${event.id}`,
        measureIndex,
        onsetTicks: event.onsetTicks + measureIndex * 3840,
      })),
    );
    const bank = createExerciseBank(score, 'guitar');
    expect(bank.length).toBeGreaterThan(0);
    expect(bank.every((exercise) => exercise.partition === 'practice')).toBe(true);
    expect(selectNextExercise(bank, [], 1000, 'note-name')?.support).toBe('guided');
  });

  it('derives a measure-bounded practice loop from the source score', () => {
    const score = scoreFixture();
    const exercise = createExerciseBank(score, 'guitar').find((candidate) =>
      candidate.noteIds.includes('m1:melody:0'),
    )!;
    expect(exerciseLoop(exercise, score)).toEqual({
      startTick: 3840,
      endTick: 7680,
      tempoBpm: 100,
    });
  });
});

describe('evidence and deterministic scheduling', () => {
  const bank = createExerciseBank(scoreFixture(), 'guitar');
  const practice = bank.filter(
    (exercise) => exercise.kind === 'note-name' && exercise.partition === 'practice',
  );
  const success = (exercise: ExerciseDefinition, answeredAt: number, assisted = false) =>
    recordAttempt(exercise, responseFor(exercise), {
      startedAt: answeredAt - 1000,
      answeredAt,
      assisted,
      mode: 'recall',
    });

  it('separates self reports, reveals, interruptions and assisted answers from unassisted accuracy', () => {
    const exercise = practice[0]!;
    const attempts = [
      success(exercise, 1000),
      success(exercise, 2000, true),
      recordAttempt(exercise, '', { startedAt: 2000, answeredAt: 3000, outcome: 'revealed' }),
      recordAttempt(exercise, '', { startedAt: 3000, answeredAt: 4000, outcome: 'interrupted' }),
      recordAttempt(exercise, 'played it', {
        startedAt: 4000,
        answeredAt: 5000,
        outcome: 'self-reported',
      }),
    ];
    const metrics = practiceMetrics(attempts);
    expect(metrics).toMatchObject({
      graded: 2,
      unassisted: 1,
      unassistedCorrect: 1,
      assistedCorrect: 1,
      revealed: 1,
      interrupted: 1,
      selfReported: 1,
    });
    expect(metrics.unassistedAccuracy).toBe(1);
    expect(practiceMetrics([]).unassistedAccuracy).toBeNull();
    expect(skillProgress(attempts, 'note-name').readyForTransfer).toBe(false);
    expect(buildPracticeEvidence(attempts)[0]).toMatchObject({
      attempts: 3,
      correct: 1,
      assisted: 2,
    });
  });

  it('cannot mark an answer unassisted when a hint was used', () => {
    const attempt = recordAttempt(practice[0]!, responseFor(practice[0]!), {
      startedAt: 0,
      answeredAt: 1000,
      assisted: false,
      hintsUsed: ['show-pitch'],
    });
    expect(attempt.assisted).toBe(true);
    expect(skillProgress([attempt], 'note-name').correctUnassisted).toBe(0);
  });

  it('fades the initial guided answer into hidden recall instead of keeping the learner in guided mode', () => {
    const first = selectNextExercise(bank, [], 1000, 'note-name')!;
    expect(first.support).toBe('guided');
    const guided = success(first.exercise, 2000, true);
    const next = selectNextExercise(bank, [guided], 3000, 'note-name')!;
    expect(next.exercise.id).toBe(first.exercise.id);
    expect(next.mode).toBe('recall');
    expect(next.support).toBe('hidden');
  });

  it('restores guided support after a wrong answer or reveal, then fades after a guided success', () => {
    for (const outcome of ['incorrect', 'revealed'] as const) {
      const exercise = practice[0]!;
      const failed = recordAttempt(exercise, 'wrong', {
        startedAt: 1000,
        answeredAt: 2000,
        mode: 'recall',
        ...(outcome === 'revealed' ? { outcome: 'revealed' as const } : {}),
      });
      const guided = selectNextExercise(bank, [failed], 3000, 'note-name')!;
      expect(guided.exercise.id).toBe(exercise.id);
      expect(guided.mode).toBe('learn');
      expect(guided.support).toBe('guided');
      const learned = recordAttempt(exercise, responseFor(exercise), {
        startedAt: 3000,
        answeredAt: 4000,
        mode: 'learn',
        assisted: true,
      });
      const recall = selectNextExercise(bank, [failed, learned], 5000, 'note-name')!;
      expect(recall.exercise.id).toBe(exercise.id);
      expect(recall.support).toBe('hidden');
      expect(skillProgress([failed, learned], 'note-name').readyForTransfer).toBe(false);
    }
  });

  it('fades a restored held-out question into recall without calling it fresh transfer again', () => {
    const exercise = bank.find(
      (item) => item.kind === 'note-name' && item.partition === 'heldout',
    )!;
    const revealed = recordAttempt(exercise, '', {
      startedAt: 1000,
      answeredAt: 2000,
      mode: 'transfer',
      outcome: 'revealed',
    });
    expect(selectNextExercise(bank, [revealed], 3000, 'note-name')?.support).toBe('guided');
    const learned = recordAttempt(exercise, responseFor(exercise), {
      startedAt: 3000,
      answeredAt: 4000,
      mode: 'learn',
      assisted: true,
    });
    const retry = selectNextExercise(bank, [revealed, learned], 5000, 'note-name')!;
    expect(retry.exercise.id).toBe(exercise.id);
    expect(retry).toMatchObject({ mode: 'recall', support: 'hidden' });
  });

  it('offers fresh held-out coordinates only after explicit unassisted practice success', () => {
    const attempts = practice
      .slice(0, 3)
      .map((exercise, index) => success(exercise, 1000 + index * 1000));
    expect(skillProgress(attempts, 'note-name').readyForTransfer).toBe(true);
    const selection = selectNextExercise(bank, attempts, 5000, 'note-name')!;
    expect(selection.mode).toBe('transfer');
    expect(selection.exercise.partition).toBe('heldout');
    const reveal = recordAttempt(selection.exercise, '', {
      startedAt: 5000,
      answeredAt: 6000,
      outcome: 'revealed',
      mode: 'transfer',
    });
    const next = selectNextExercise(bank, [...attempts, reveal], 7000, 'note-name')!;
    if (next.mode === 'transfer') {
      expect(
        next.exercise.transferKeys!.some((key) => selection.exercise.transferKeys!.includes(key)),
      ).toBe(false);
    }
    expect(skillProgress([...attempts, reveal], 'note-name').transferPassed).toBe(false);
    const afterReveal = recordAttempt(selection.exercise, responseFor(selection.exercise), {
      startedAt: 7000,
      answeredAt: 8000,
      mode: 'transfer',
    });
    expect(skillProgress([...attempts, reveal, afterReveal], 'note-name').transferPassed).toBe(
      false,
    );
  });

  it('distinguishes same-session recall from actual delayed review', () => {
    const attempt = success(practice[0]!, 2000);
    expect(selectNextExercise(bank, [attempt], 3000, 'note-name')?.mode).not.toBe('delayed');
    const later = selectNextExercise(
      bank,
      [attempt],
      2000 + SCHEDULER_DEFAULTS.recallDelayMs,
      'note-name',
    )!;
    expect(later.mode).toBe('delayed');
    expect(later.exercise.id).toBe(practice[0]!.id);
  });

  it('validates summary check counters instead of trusting imported mode labels', () => {
    const exercise = practice[0]!;
    const first = success(exercise, 2000);
    const premature = recordAttempt(exercise, responseFor(exercise), {
      startedAt: 3000,
      answeredAt: 4000,
      mode: 'delayed',
    });
    expect(practiceMetrics([first, premature]).delayedAttempts).toBe(0);
    const due = reviewDueAt(exercise.id, [first, premature])!;
    const actual = recordAttempt(exercise, responseFor(exercise), {
      startedAt: due,
      answeredAt: due + 1000,
      mode: 'delayed',
    });
    expect(practiceMetrics([first, premature, actual])).toMatchObject({
      delayedAttempts: 1,
      delayedCorrect: 1,
    });

    const heldout = bank.find((item) => item.kind === 'note-name' && item.partition === 'heldout')!;
    const wrong = recordAttempt(heldout, 'wrong', {
      startedAt: 1000,
      answeredAt: 2000,
      mode: 'transfer',
    });
    const retry = recordAttempt(heldout, responseFor(heldout), {
      startedAt: 3000,
      answeredAt: 4000,
      mode: 'transfer',
    });
    expect(practiceMetrics([wrong, retry])).toMatchObject({
      transferAttempts: 1,
      transferCorrect: 0,
    });
    const reveal = recordAttempt(heldout, '', {
      startedAt: 0,
      answeredAt: 500,
      outcome: 'revealed',
    });
    expect(practiceMetrics([reveal, retry])).toMatchObject({
      transferAttempts: 0,
      transferCorrect: 0,
    });
  });

  it('preserves exposure across exercise bank variants and overlapping presentations', () => {
    const heldout = bank.find((item) => item.kind === 'note-name' && item.partition === 'heldout')!;
    const previousVariant = { ...heldout, id: `${heldout.id}:old`, partition: 'practice' as const };
    const priorExposure = success(previousVariant, 1000, true);
    const attempt = recordAttempt(heldout, responseFor(heldout), {
      startedAt: 2000,
      answeredAt: 3000,
      mode: 'transfer',
    });
    expect(practiceMetrics([priorExposure, attempt]).transferAttempts).toBe(0);
    expect(skillProgress([attempt], 'note-name', [priorExposure, attempt]).transferPassed).toBe(
      false,
    );
    const practiced = practice.slice(0, 3).map((item, index) => success(item, 4000 + index * 1000));
    const selected = selectNextExercise(bank, [priorExposure, ...practiced], 8000, 'note-name')!;
    expect(selected.exercise.transferKeys?.some((key) => heldout.transferKeys?.includes(key))).toBe(
      false,
    );
    const overlapping = recordAttempt(previousVariant, '', {
      startedAt: 500,
      answeredAt: 4000,
      outcome: 'interrupted',
    });
    expect(practiceMetrics([attempt, overlapping]).transferAttempts).toBe(0);
  });

  it('does not treat self-reported playing as exposure to a held-out question', () => {
    const heldout = bank.find((item) => item.kind === 'note-name' && item.partition === 'heldout')!;
    const selfReport = recordAttempt(heldout, 'played it', {
      startedAt: 0,
      answeredAt: 0,
      outcome: 'self-reported',
    });
    const attempt = recordAttempt(heldout, responseFor(heldout), {
      startedAt: 2000,
      answeredAt: 3000,
      mode: 'transfer',
    });
    expect(practiceMetrics([selfReport, attempt])).toMatchObject({
      transferAttempts: 1,
      transferCorrect: 1,
      selfReported: 1,
    });
    const practiced = practice.slice(0, 3).map((item, index) => success(item, 4000 + index * 1000));
    expect(
      selectNextExercise(bank, [selfReport, ...practiced], 8000, 'note-name')?.exercise.id,
    ).toBe(heldout.id);
  });

  it('does not promote repeated hinted successes or one memorized source note', () => {
    const hints = [1000, 2000, 3000].map((time) => success(practice[0]!, time, true));
    expect(skillProgress(hints, 'note-name').readyForTransfer).toBe(false);
    const repeated = [1000, 2000, 3000].map((time) => success(practice[0]!, time));
    expect(skillProgress(repeated, 'note-name').readyForTransfer).toBe(false);
  });

  it('requires different stimulus variants rather than counting each member of one repeated chord', () => {
    for (const kind of ['interval', 'triad-role'] as const) {
      const exercise = bank.find((item) => item.kind === kind && item.partition === 'practice')!;
      const repeated = [1000, 2000, 3000].map((time) => success(exercise, time));
      expect(exercise.transferKeys!.length).toBeGreaterThan(1);
      expect(skillProgress(repeated, kind)).toMatchObject({
        distinctVariants: 1,
        readyForTransfer: false,
      });
      const other = bank.find(
        (item) =>
          item.kind === kind &&
          item.partition === 'practice' &&
          JSON.stringify(item.transferKeys) !== JSON.stringify(exercise.transferKeys),
      )!;
      expect(skillProgress([...repeated, success(other, 4000)], kind).readyForTransfer).toBe(true);
    }
  });

  it('advances actual delayed success through one, three and seven days', () => {
    const exercise = practice[0]!;
    const day = SCHEDULER_DEFAULTS.recallDelayMs;
    const first = success(exercise, 2000);
    expect(reviewDueAt(exercise.id, [first])).toBe(2000 + day);
    const second = recordAttempt(exercise, responseFor(exercise), {
      startedAt: 2000 + day,
      answeredAt: 3000 + day,
      mode: 'delayed',
    });
    expect(reviewDueAt(exercise.id, [first, second])).toBe(3000 + 4 * day);
    const third = recordAttempt(exercise, responseFor(exercise), {
      startedAt: 3000 + 4 * day,
      answeredAt: 4000 + 4 * day,
      mode: 'delayed',
    });
    expect(reviewDueAt(exercise.id, [first, second, third])).toBe(4000 + 11 * day);
    expect(skillProgress([first, second, third], 'note-name').delayedPassed).toBe(true);
    const premature = recordAttempt(exercise, responseFor(exercise), {
      startedAt: 3000,
      answeredAt: 4000,
      mode: 'delayed',
    });
    expect(skillProgress([first, premature], 'note-name').delayedPassed).toBe(false);
  });

  it('resets a practice streak and review schedule after a wrong answer or reveal', () => {
    const successes = practice
      .slice(0, 3)
      .map((exercise, index) => success(exercise, 1000 + index * 1000));
    const exercise = practice[0]!;
    const wrong = recordAttempt(exercise, 'wrong', {
      startedAt: 3500,
      answeredAt: 4000,
      mode: 'recall',
    });
    expect(skillProgress([...successes, wrong], 'note-name').readyForTransfer).toBe(false);
    expect(reviewDueAt(exercise.id, [...successes, wrong])).toBeNull();
    const newSuccess = success(exercise, 5000);
    expect(reviewDueAt(exercise.id, [...successes, wrong, newSuccess])).toBe(
      5000 + SCHEDULER_DEFAULTS.recallDelayMs,
    );
    const reveal = recordAttempt(exercise, '', {
      startedAt: 5500,
      answeredAt: 6000,
      outcome: 'revealed',
    });
    expect(
      skillProgress([...successes, wrong, newSuccess, reveal], 'note-name').practiceCorrectStreak,
    ).toBe(0);
  });
});
