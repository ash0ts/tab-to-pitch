import { describe, it, expect } from 'vitest';
import { backupSchema, parseBackup } from './storage';
import { lessonSessionSchema, mergeLessonCheckpoints } from './lesson-storage';
const attempt = {
  id: 'a',
  exerciseId: 'e',
  scoreId: 's',
  trackId: 't',
  skillId: 'note-name',
  kind: 'note-name',
  noteIds: ['n'],
  response: 'B',
  outcome: 'correct',
  assisted: false,
  hintsUsed: [],
  startedAt: 1000,
  answeredAt: 2000,
  responseMs: 1000,
  mode: 'recall',
  partition: 'practice',
  evidence: 'answer',
};
const backup = (change = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date(0).toISOString(),
    attempts: [{ ...attempt, ...change }],
  });
describe('portable progress evidence', () => {
  it('accepts a versioned answer record', () => expect(parseBackup(backup())).toHaveLength(1));
  it.each([
    { hintsUsed: ['answer'] },
    { outcome: 'revealed' },
    { evidence: 'self-report' },
    { responseMs: 999 },
    { answeredAt: 500 },
    { kind: 'interval' },
  ])('rejects inconsistent evidence %j', (change) =>
    expect(() => parseBackup(backup(change))).toThrow(),
  );
  it('rejects future schema versions and unexpected fields', () => {
    expect(() => parseBackup(backup().replace('"schemaVersion":1', '"schemaVersion":2'))).toThrow();
    expect(() => parseBackup(backup({ gradingKey: 'B2' }))).toThrow();
  });
});

describe('version-three lesson backups', () => {
  const lesson = lessonSessionSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    schemaVersion: 1,
    curriculumVersion: 'teacher-curriculum-v1',
    sourceHash: 'original-study',
    trackId: 't',
    objective: 'foundations',
    contextVersion: 'context-1',
    revision: 0,
    createdAt: 100,
    updatedAt: 100,
    status: 'active',
    messages: [],
    pendingTaskId: null,
  });
  const versionThree = () => ({
    schemaVersion: 3,
    exportedAt: new Date(0).toISOString(),
    attempts: [attempt],
    variations: [],
    lessons: [lesson],
    lessonEvents: [],
    exerciseDefinitions: [],
  });
  it('retains original attempts while accepting local lesson state', () => {
    expect(parseBackup(JSON.stringify(versionThree()))).toEqual([attempt]);
    expect(backupSchema.parse(versionThree())).toMatchObject({ lessons: [lesson] });
  });
  it('keeps the newer checkpoint only when its conversation extends the old one', () => {
    const newer = {
      ...lesson,
      revision: 1,
      updatedAt: 200,
      messages: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          role: 'user' as const,
          text: 'Why is F the seventh?',
          at: 200,
        },
      ],
    };
    expect(mergeLessonCheckpoints(newer, lesson)).toEqual(newer);
    expect(() => mergeLessonCheckpoints(newer, { ...newer, objective: 'extensions' })).toThrow(
      'conflicts',
    );
    expect(() => mergeLessonCheckpoints(newer, { ...newer, revision: 2, messages: [] })).toThrow(
      'conflicts',
    );
  });
  it('rejects edited grading definitions and foreign fields', () => {
    const data = versionThree();
    expect(() => backupSchema.parse({ ...data, lessons: [{ ...lesson, mastery: 1 }] })).toThrow();
    expect(() =>
      backupSchema.parse({
        ...data,
        exerciseDefinitions: [
          {
            id: 'task-1',
            generatorVersion: 'teacher-task-v1',
            createdAt: 100,
            definition: { id: 'task-2' },
          },
        ],
      }),
    ).toThrow();
  });
});
