import { expect, it } from 'vitest';
import { boundaryCases, checkpointCases, developmentCases, episodes, requestFor } from './cases';
import {
  localTeacher,
  validateTeacherTurn,
  createTeacherToolRuntime,
} from '../../src/engine/teacher';
import { parseChordSymbol } from '../../src/engine/harmony';
import { PASSAGES } from '../../src/songs/catalog';
import { teacherRequestSchema } from '../../src/shared/teacher';

it('freezes disjoint progression families with specified cohort counts', () => {
  expect(developmentCases).toHaveLength(24);
  expect(checkpointCases).toHaveLength(48);
  expect(episodes).toHaveLength(12);
  expect(boundaryCases).toHaveLength(12);
  const signature = (c: (typeof developmentCases)[number]) => {
    const root = parseChordSymbol(c.passage.tonic)!.rootPitchClass;
    return c.passage.chords
      .map((c) => {
        const chord = parseChordSymbol(c.symbol)!;
        return `${(chord.rootPitchClass - root + 12) % 12}:${chord.quality}`;
      })
      .join('/');
  };
  const dev = new Set(developmentCases.map(signature));
  expect(checkpointCases.some((c) => dev.has(signature(c)))).toBe(false);
  expect(new Set(checkpointCases.map((c) => c.passage.recordingId)).size).toBe(12);
});
it('validates authored responses and rejects changed identities and fabricated actions', () => {
  for (const c of [...developmentCases, ...checkpointCases, ...boundaryCases]) {
    const request = requestFor(c, c.id),
      before = JSON.stringify(request),
      response = localTeacher(request);
    expect(validateTeacherTurn(response, request), c.id).not.toBeNull();
    expect(JSON.stringify(request)).toBe(before);
    expect(validateTeacherTurn({ ...response, contextVersion: 'stale' }, request)).toBeNull();
  }
  const request = requestFor(checkpointCases[0]!, 'tools');
  const runtime = createTeacherToolRuntime(request);
  expect(runtime.execute({ name: 'inspect_passage', args: {} }).status).toBe('ok');
});
it('rejects unverified passages and the v1 listening wire shape', () => {
  const request = requestFor(checkpointCases[0]!, 'unsupported');
  request.context.listening!.passageId = PASSAGES.find((p) => p.status === 'pending')!.id;
  expect(teacherRequestSchema.safeParse(request).success).toBe(false);
  request.context.listening!.passageId = checkpointCases[0]!.passage.id;
  request.schemaVersion = 'teacher-v1';
  expect(teacherRequestSchema.safeParse(request).success).toBe(false);
});
