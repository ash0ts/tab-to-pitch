import { describe, it, expect } from 'vitest';
import {
  musicianshipTask,
  gradeMusicianship,
  supportText,
  studySoundKey,
  isReservedStudy,
} from '../src/engine/musicianship';
import { buildPracticeScore } from '../src/player/practice-study';
import { adaptScore } from '../src/engine/adapter';
import { emptyPractice, practiceStateSchema } from '../src/shared/practice';
import { lessonSessionSchema } from '../src/lesson-storage';
import {
  localTeacher,
  resolveTeacherAction,
  validateTeacherTurn,
  createTeacherToolRuntime,
} from '../src/engine/teacher';
import { teacherRequestSchema } from '../src/shared/teacher';
import { DEFAULT_ARRANGEMENT_CONSTRAINTS } from '../src/shared/arrangements';
function teacherFixture() {
  return teacherRequestSchema.parse({
    schemaVersion: 'teacher-v3',
    requestId: crypto.randomUUID(),
    lessonId: crypto.randomUUID(),
    turnId: crypto.randomUUID(),
    contextVersion: 'independent-study',
    request: 'Help me build a phrase.',
    context: {
      objective: 'connections',
      music: {
        tuning: [64, 59, 55, 50, 45, 40],
        capo: 0,
        key: { tonic: 'C', mode: 'ionian' },
        selectedSpan: 0,
        spans: [
          { symbol: 'G7', confirmed: true, startTick: 0, endTick: 3840, melody: [] },
          { symbol: 'Cmaj7', confirmed: true, startTick: 3840, endTick: 7680, melody: [] },
        ],
      },
      constraints: DEFAULT_ARRANGEMENT_CONSTRAINTS,
      bass: [],
      evidence: [],
      history: [],
      exposures: [],
      activeQuestion: null,
      practice: {
        capability: 'teaching-practice-v1',
        goal: null,
        strategy: null,
        reflection: null,
        active: null,
        evidence: [],
        reserved: ['musicianship-v1:phrase:0'],
      },
    },
  });
}

describe('original musicianship studies', () => {
  it('checks attacks and rests, including half beats, without disclosing an answer on error', () => {
    const task = musicianshipTask('rhythm');
    expect(
      gradeMusicianship(task, {
        cells: [55, null, 55, 55, null, 55, null, null, 60, null, 60, null, 60, null, null, null],
      }).correct,
    ).toBe(true);
    const shifted = [...task.stimulus.cells];
    shifted[0] = null;
    shifted[1] = 55;
    const result = gradeMusicianship(task, { cells: shifted });
    expect(result.correct).toBe(false);
    expect(result.feedback).toContain('bar 1');
    expect(result.feedback).not.toContain('beat 1');
  });
  it('accepts different valid phrases and rejects each independently stated violation', () => {
    const task = musicianshipTask('phrase');
    for (const phrase of [
      [55, null, 53, null, null, null, null, null, 52, null, null, null, null, null, null, null],
      [50, 59, 55, null, 53, null, 50, null, 60, 59, 55, null, 52, null, null, null],
    ])
      expect(gradeMusicianship(task, { cells: phrase }).correct).toBe(true);
    expect(gradeMusicianship(task, { cells: Array(16).fill(52) }).correct).toBe(false);
    expect(gradeMusicianship(task, { cells: [55, 53, 52, ...Array(13).fill(null)] }).correct).toBe(
      false,
    );
    expect(gradeMusicianship(task, { cells: [55, 53, ...Array(13).fill(null), 54] }).correct).toBe(
      false,
    );
  });
  it('does not grade expressive preferences', () => {
    const task = musicianshipTask('expression');
    expect(
      gradeMusicianship(task, {
        difference: 'articulation',
        intention: 'I prefer the connected version.',
      }).correct,
    ).toBe(true);
    expect(
      gradeMusicianship(task, {
        difference: 'articulation',
        intention: 'I prefer the detached version.',
      }).correct,
    ).toBe(true);
    expect(gradeMusicianship(task, { difference: 'dynamics' }).correct).toBe(false);
    expect(supportText(task, 'cue')).not.toContain('difference is');
  });
  it('engraves and synthesizes exact authored timing and the intended articulation', () => {
    const task = musicianshipTask('expression');
    const a = buildPracticeScore(task.stimulus),
      b = buildPracticeScore(task.comparison);
    const notes = adaptScore(a, task.id).tracks[0]!.notes;
    expect(notes.map((n) => n.soundingMidi)).toEqual([55, 59, 53, 50, 52, 55, 59, 60]);
    expect(notes.map((n) => n.onsetTicks)).toEqual([0, 960, 1920, 2880, 3840, 4800, 5760, 6720]);
    expect(b.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!.isStaccato).toBe(true);
    expect(a.tracks[0]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!.notes[0]!.isStaccato).toBe(false);
  });
});

it('keeps legacy lesson records readable and new practice state optional', () => {
  const legacy = {
    id: '00000000-0000-4000-8000-000000000001',
    schemaVersion: 1,
    curriculumVersion: 'old',
    sourceHash: 'a',
    trackId: 't',
    objective: 'foundations',
    contextVersion: 'x',
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    status: 'active',
    messages: [],
    pendingTaskId: null,
  };
  expect(lessonSessionSchema.parse(legacy).practice).toBeUndefined();
  expect(lessonSessionSchema.parse({ ...legacy, practice: emptyPractice() }).practice).toEqual(
    practiceStateSchema.parse(emptyPractice()),
  );
});

it('negotiates capabilities, rejects exposed checks, and validates a local activity proposal', () => {
  const request = teacherFixture();
  const turn = localTeacher(request);
  expect(turn.actions).toContainEqual({
    type: 'practice',
    operation: 'activity',
    activity: 'phrase',
    variant: 0,
    assessment: 'practice',
  });
  expect(validateTeacherTurn(turn, request)).not.toBeNull();
  expect(teacherRequestSchema.safeParse({ ...request, schemaVersion: 'teacher-v1' }).success).toBe(
    false,
  );
  expect(
    resolveTeacherAction(request, {
      type: 'practice',
      operation: 'activity',
      activity: 'phrase',
      variant: 1,
      assessment: 'reserved',
    }),
  ).toBeNull();
  expect(
    createTeacherToolRuntime(request).execute({
      name: 'practice_activity',
      args: {
        action: {
          type: 'practice',
          operation: 'strategy',
          approach: 'Compare',
          rationale: 'Attend to one detail.',
        },
      },
    }).status,
  ).toBe('ok');
});
it('honors exploration, and never treats an active unassisted question as permission to explain the answer', () => {
  const request = teacherFixture();
  request.request = 'Stop quizzing. Just explore this phrase with me.';
  expect(
    localTeacher(request).actions.some((a) => a.type === 'question' || a.type === 'practice'),
  ).toBe(false);
  request.context.practice!.active = {
    id: 'episode',
    kind: 'phrase',
    assisted: false,
    responseCount: 0,
  };
  const turn = localTeacher(request);
  expect(turn.actions).toEqual([]);
  expect(turn.message).toContain('help');
  const changed = { ...turn, actions: [{ type: 'highlight', spanIndex: 0, degree: 'b7' }] };
  expect(validateTeacherTurn(changed, request)).toBeNull();
});

it('keeps delayed review separate from same-session retries', async () => {
  const { nextReview } = await import('../src/hooks/usePracticeSession');
  const first = nextReview(null, 'timing', 1000, true)!;
  expect(first.intervalDays).toBe(1);
  expect(nextReview(first, 'timing', 2000, true)).toEqual(first);
  const second = nextReview(first, 'timing', first.dueAt, true)!;
  expect(second.intervalDays).toBe(3);
  expect(nextReview(second, 'timing', second.dueAt, false)?.intervalDays).toBe(1);
  expect(nextReview(second, 'timing', second.dueAt, true)?.intervalDays).toBe(7);
});

it('never inherits qualification from a previous actor/critic prompt', async () => {
  const { readConfig } = await import('../server/config');
  const { TEACHER_PROMPT_VERSION } = await import('../src/shared/teacher');
  const { TEACHER_CRITIC_PROMPT_VERSION } = await import('../server/teacher-review');
  expect(
    readConfig({ TEACHER_AGENT_ENABLED: 'true', TEACHER_QUALIFICATION: 'qualified' })
      .teacherQualification,
  ).toBe('unqualified');
  expect(
    readConfig({
      TEACHER_QUALIFICATION: 'qualified',
      TEACHER_QUALIFIED_PROMPT: TEACHER_PROMPT_VERSION,
      TEACHER_QUALIFIED_CRITIC: TEACHER_CRITIC_PROMPT_VERSION,
      TEACHER_QUALIFIED_MODEL: 'openai/gpt-oss-20b',
      TEACHER_QUALIFIED_CRITIC_MODEL: 'openai/gpt-oss-20b',
    }).teacherQualification,
  ).toBe('qualified');
});

it('gives the teacher verified study context without the rhythm grading key', () => {
  const request = teacherFixture();
  request.context.practice!.studyId = 'musicianship-v1:rhythm:2';
  const runtime = createTeacherToolRuntime(request);
  const fact = runtime.facts.find((f) => f.id === 'practice-study');
  expect(fact?.text).toContain('G7 then Cmaj7');
  expect(fact?.text).toContain('not an annotation of the imported score');
  expect(fact?.text).not.toContain(JSON.stringify(musicianshipTask('rhythm', 2).stimulus.cells));
  expect(
    teacherRequestSchema.safeParse({
      ...request,
      context: {
        ...request.context,
        practice: { ...request.context.practice, studyId: 'invented' },
      },
    }).success,
  ).toBe(false);
});

it('does not relabel a heard melody as reserved in another activity', () => {
  const phrase = musicianshipTask('phrase', 0),
    expression = musicianshipTask('expression', 0);
  const heard = new Set([studySoundKey(phrase.stimulus)]);
  expect(isReservedStudy(expression, heard)).toBe(false);
  expect(isReservedStudy(musicianshipTask('expression', 2), heard)).toBe(true);
});
