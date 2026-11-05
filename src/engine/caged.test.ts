import { describe, expect, it } from 'vitest';
import {
  CAGED_FAMILIES,
  CAGED_SHAPES,
  STANDARD_TUNING,
  cagedPlacements,
  conventionalCaged,
  fragmentFamilies,
  locations,
  noteAt,
} from './caged';
import { gradeHomework, makeHomeworkTask, solution, validFrozenHomeworkTask } from './homework';
import { lessonSessionSchema, emptyLessonData } from '../lesson-storage';
import { homeworkAssignmentSchema } from '../shared/homework';

const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const mod = (n: number) => ((n % 12) + 12) % 12;
const region = { minFret: 0, maxFret: 12 };
describe('independent CAGED pitch fixtures', () => {
  for (const [rootIndex, root] of roots.entries())
    it(`validates all five families and octave repetitions for ${root}`, () => {
      const placements = cagedPlacements(root);
      expect(new Set(placements.map((p) => p.family))).toEqual(new Set(CAGED_FAMILIES));
      for (const p of placements) {
        expect(new Set(p.notes.map((n) => mod(n.midi - rootIndex)))).toEqual(new Set([0, 4, 7]));
        for (const n of p.notes) {
          expect(n.midi).toBe([64, 59, 55, 50, 45, 40][n.position.string - 1]! + n.position.fret);
          expect(n.position.fret).toBeGreaterThanOrEqual(0);
          expect(n.position.fret).toBeLessThanOrEqual(24);
          expect(mod(n.midi - rootIndex)).toBe(
            ({ 1: 0, 3: 4, 5: 7 } as Record<string, number>)[n.degree],
          );
        }
        expect(p.roots.length).toBeGreaterThan(1);
        const octave = placements.find((q) => q.family === p.family && q.shift === p.shift + 12);
        if (octave)
          expect(octave.notes.map((n) => n.midi)).toEqual(p.notes.map((n) => n.midi + 12));
      }
    });
  it('uses independent C-major placements and separates shape from harmony', () => {
    const placements = cagedPlacements('C');
    expect(placements.slice(0, 5).map((p) => [p.family, p.shift])).toEqual([
      ['C', 0],
      ['A', 3],
      ['G', 5],
      ['E', 8],
      ['D', 10],
    ]);
    const g = cagedPlacements('G').find((p) => p.family === 'E' && p.shift === 3)!;
    expect(g.notes.map((n) => n.position.fret)).toEqual([3, 3, 4, 5, 5, 3]);
    expect(g.chord.symbol).toBe('G');
    expect(
      placements.find((p) => p.family === 'D')!.notes.some((n) => n.position.fret === 13),
    ).toBe(true);
  });
  it('preserves physical strings under capo and uniformly transposed tuning', () => {
    for (const offset of [-2, 0, 2])
      for (const capo of [0, 2, 7]) {
        const tuning = STANDARD_TUNING.map((n) => n + offset);
        const before = [...tuning];
        for (const p of cagedPlacements('C', tuning, capo))
          expect(new Set(p.notes.map((n) => mod(n.midi)))).toEqual(new Set([0, 4, 7]));
        expect(tuning).toEqual(before);
      }
    expect(conventionalCaged([64, 59, 55, 50, 45, 38])).toBe(false);
    expect(cagedPlacements('C', [64, 59, 55, 50, 45, 38])).toEqual([]);
    expect(locations(0, [64, 59, 55, 50, 45, 38], 0, region)).toContainEqual({
      string: 6,
      fret: 10,
    });
  });
  it('retains overlapping family affiliations and verifies G–B octave offset', () => {
    expect(
      fragmentFamilies(
        [
          { string: 1, fret: 0 },
          { string: 3, fret: 0 },
        ],
        cagedPlacements('C'),
      ),
    ).toEqual(['C']);
    const placements = cagedPlacements('C');
    expect(
      fragmentFamilies(
        [
          { string: 2, fret: 5 },
          { string: 3, fret: 5 },
        ],
        placements,
      ),
    ).toEqual(['A', 'G']);
    expect(noteAt({ string: 3, fret: 0 }, STANDARD_TUNING, 0)! + 12).toBe(
      noteAt({ string: 1, fret: 3 }, STANDARD_TUNING, 0),
    );
    expect(noteAt({ string: 4, fret: 0 }, STANDARD_TUNING, 0)! + 12).toBe(
      noteAt({ string: 2, fret: 3 }, STANDARD_TUNING, 0),
    );
    expect(noteAt({ string: 6, fret: 0 }, STANDARD_TUNING, 0)! + 12).toBe(
      noteAt({ string: 4, fret: 2 }, STANDARD_TUNING, 0),
    );
    expect(CAGED_SHAPES.find((s) => s.family === 'D')!.mutedStrings).toEqual([5, 6]);
  });
});
describe('homework grading authority', () => {
  it('accepts every pitch-class location on the requested string and exact pitch separately', () => {
    const task = makeHomeworkTask('locate', 'C', 'A', region, STANDARD_TUNING, 0)!;
    for (const p of locations(0, STANDARD_TUNING, 0, region).filter(
      (p) => p.string === task.string,
    ))
      expect(gradeHomework(task, { positions: [p] }).correct).toBe(true);
    expect(gradeHomework(task, { positions: [{ string: 1, fret: 0 }] }).correct).toBe(false);
    const exact = makeHomeworkTask('name', 'C', 'A', region, STANDARD_TUNING, 0, 48, true)!;
    expect(gradeHomework(exact, { positions: [], text: 'B#4' }).correct).toBe(true);
    expect(gradeHomework(exact, { positions: [], text: 'C3' }).correct).toBe(false);
  });
  it('accepts alternative voicings without relying on enumerated answers', () => {
    const task = makeHomeworkTask('voicing', 'C', 'A', region, STANDARD_TUNING, 0)!;
    for (const positions of [
      [
        { string: 1, fret: 0 },
        { string: 2, fret: 1 },
        { string: 3, fret: 0 },
      ],
      [
        { string: 1, fret: 3 },
        { string: 2, fret: 5 },
        { string: 3, fret: 5 },
      ],
      [
        { string: 2, fret: 5 },
        { string: 3, fret: 5 },
        { string: 4, fret: 5 },
      ],
    ])
      expect(gradeHomework(task, { positions }).correct).toBe(true);
    expect(
      gradeHomework(task, {
        positions: [
          { string: 1, fret: 0 },
          { string: 1, fret: 0 },
          { string: 2, fret: 1 },
        ],
      }).correct,
    ).toBe(false);
    expect(
      gradeHomework(task, {
        positions: [
          { string: 1, fret: 0 },
          { string: 2, fret: 1 },
          { string: 3, fret: 1 },
        ],
      }).correct,
    ).toBe(false);
    expect(
      gradeHomework(task, {
        positions: [
          { string: 1, fret: 0 },
          { string: 2, fret: 13 },
          { string: 3, fret: 0 },
        ],
      }).correct,
    ).toBe(false);
  });
  it('distinguishes minor thirds and sevenths, and never fabricates a rootless key', () => {
    const minor = makeHomeworkTask('voicing', 'Cm', 'A', region, STANDARD_TUNING, 0)!;
    expect(
      gradeHomework(minor, {
        positions: [
          { string: 1, fret: 3 },
          { string: 2, fret: 4 },
          { string: 3, fret: 5 },
        ],
      }).correct,
    ).toBe(true);
    expect(
      gradeHomework(minor, {
        positions: [
          { string: 1, fret: 3 },
          { string: 2, fret: 5 },
          { string: 3, fret: 5 },
        ],
      }).correct,
    ).toBe(false);
    const seventh = makeHomeworkTask('voicing', 'G7', 'E', region, STANDARD_TUNING, 0)!;
    expect(
      gradeHomework(seventh, {
        positions: [
          { string: 1, fret: 1 },
          { string: 2, fret: 0 },
          { string: 3, fret: 0 },
          { string: 4, fret: 0 },
        ],
      }).correct,
    ).toBe(true);
    const extended = makeHomeworkTask('voicing', 'C9', 'C', region, STANDARD_TUNING, 0)!;
    expect(solution(extended)).toEqual([]); // Five required tones cannot fit this four-voice task.
    const maj7 = makeHomeworkTask('voicing', 'Cmaj7', 'C', region, STANDARD_TUNING, 0)!;
    expect(
      gradeHomework(maj7, {
        positions: [
          { string: 1, fret: 0 },
          { string: 2, fret: 0 },
          { string: 3, fret: 0 },
        ],
      }).correct,
    ).toBe(false);
  });
  it('checks both positions and signed pitch movement, not just the destination', () => {
    const t = makeHomeworkTask('connection', 'G7', 'E', region, STANDARD_TUNING, 0)!;
    expect(
      gradeHomework(t, {
        positions: [
          { string: 2, fret: 6 },
          { string: 2, fret: 5 },
        ],
      }).correct,
    ).toBe(true);
    expect(
      gradeHomework(t, {
        positions: [
          { string: 2, fret: 6 },
          { string: 4, fret: 2 },
        ],
      }).correct,
    ).toBe(false);
    expect(
      gradeHomework(t, {
        positions: [
          { string: 1, fret: 1 },
          { string: 2, fret: 5 },
        ],
      }).correct,
    ).toBe(true);
  });
  it('requires the specific template only when requested', () => {
    const t = makeHomeworkTask('complete', 'C', 'A', region, STANDARD_TUNING, 0)!;
    expect(gradeHomework(t, { positions: [...t.template].reverse() }).correct).toBe(true);
    expect(
      gradeHomework(t, {
        positions: [
          { string: 1, fret: 0 },
          { string: 2, fret: 1 },
          { string: 3, fret: 0 },
        ],
      }).correct,
    ).toBe(false);
  });
  it('retains legacy lesson backups without inventing homework evidence', () => {
    const legacy = lessonSessionSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      schemaVersion: 1,
      curriculumVersion: 'teacher-curriculum-v1',
      sourceHash: 'demo',
      trackId: 't',
      objective: 'foundations',
      contextVersion: 'c',
      revision: 0,
      createdAt: 1,
      updatedAt: 1,
      status: 'active',
      messages: [],
      pendingTaskId: null,
    });
    expect(legacy.homework).toBeUndefined();
    expect(emptyLessonData().lessons).toEqual([]);
    expect(homeworkAssignmentSchema.safeParse({ version: 'unknown' }).success).toBe(false);
  });
});

it('rejects mutated frozen templates and mismatched derived identities', () => {
  const task = makeHomeworkTask(
    'complete',
    'C',
    'A',
    { minFret: 0, maxFret: 12 },
    STANDARD_TUNING,
    0,
  )!;
  expect(validFrozenHomeworkTask(task)).toBe(true);
  expect(validFrozenHomeworkTask({ ...task, template: [{ string: 1, fret: 1 }] })).toBe(false);
  expect(validFrozenHomeworkTask({ ...task, id: 'imported-note:made-up' })).toBe(false);
});

it('does not invent thirds for suspended or power-chord destination tasks', () => {
  for (const symbol of ['Csus2', 'Csus4', 'C5'])
    expect(
      makeHomeworkTask('target', symbol, 'A', { minFret: 0, maxFret: 12 }, STANDARD_TUNING, 0),
    ).toBeNull();
  const connection = makeHomeworkTask(
    'connection',
    'C',
    'A',
    { minFret: 0, maxFret: 12 },
    STANDARD_TUNING,
    0,
  )!;
  expect(connection.symbol).toBe('G7');
  expect(validFrozenHomeworkTask(connection)).toBe(true);
});

it('names positions independently of the displayed chord root', () => {
  const first = makeHomeworkTask('name', 'C', 'A', { minFret: 0, maxFret: 5 }, STANDARD_TUNING, 0)!;
  expect(first.sourcePosition).toEqual({ string: 1, fret: 0 });
  expect(gradeHomework(first, { positions: [], text: 'E' }).correct).toBe(true);
  expect(gradeHomework(first, { positions: [], text: 'C' }).correct).toBe(false);
});


it('preserves an older homework assignment without activating a new grading contract', () => {
  const task = makeHomeworkTask('locate', 'C', 'A', region, [...STANDARD_TUNING], 0)!;
  const { variant: _variant, ...legacyTask } = task;
  const restored = homeworkAssignmentSchema.parse({
    version: 'homework-caged-v1', id: 'legacy', lessonId: '00000000-0000-4000-8000-000000000001',
    goal: 'Find C', contextVersion: 'old-context', minutes: 5, region, tasks: [legacyTask], index: 0,
    support: [], responses: [{positions: [{string: 2, fret: 1}]}], status: 'active', createdAt: 1,
    updatedAt: 2, dueAt: null, reviewDays: 1, reviewPolicy: 'review-defaults-v1', reflection: '', exposure: 'reserved',
  });
  expect(restored.status).toBe('paused');
  expect(restored.exposure).toBe('unknown');
  expect(restored.responses).toEqual([{positions: [{string: 2, fret: 1}]}]);
  expect(restored.tasks[0]!.variant).toBeNull();
  expect(validFrozenHomeworkTask(restored.tasks[0]!)).toBe(false);
});
