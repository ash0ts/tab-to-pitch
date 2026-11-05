import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { backupSchema } from '../src/storage';
import manifest from './fixtures/backups/manifest.json';

describe('backups serialized by the six frozen implementations', () => {
  for (const fixture of manifest) {
    it(`retains ${fixture.name} evidence and its original grading semantics`, () => {
      const text = readFileSync(
        new URL(`./fixtures/backups/${fixture.name}.json`, import.meta.url),
        'utf8',
      );
      expect(createHash('sha256').update(text).digest('hex')).toBe(fixture.fixtureSha256);
      const original = JSON.parse(text);
      const parsed = backupSchema.parse(original);
      expect(parsed.attempts).toEqual(original.attempts);
      expect(parsed.attempts[0]).toMatchObject({ outcome: 'incorrect', assisted: false });
      if (parsed.schemaVersion !== 3 && parsed.schemaVersion !== 4)
        throw new Error('Expected lesson backup');
      const lesson = parsed.lessons[0]!;
      expect(lesson.practice).toEqual(original.lessons[0].practice);
      expect(lesson.ear).toEqual(original.lessons[0].ear);
      expect(lesson.live).toEqual(original.lessons[0].live);
      if (lesson.homework) {
        expect(lesson.homework.playing).toBeUndefined();
        expect(lesson.homework.responses).toEqual(original.lessons[0].homework.responses);
        expect(lesson.homework.exposure).toBe('unknown');
        if (lesson.homework.tasks[0]!.variant === null)
          expect(lesson.homework.status).toBe('paused');
      }
      expect(parsed.lessonEvents).toEqual(original.lessonEvents);
      expect(backupSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    });
  }

  it('pauses pre-planner homework without inventing a reserved stimulus', () => {
    const original = JSON.parse(
      readFileSync(new URL('./fixtures/backups/homework.json', import.meta.url), 'utf8'),
    );
    delete original.lessons[0].homework.tasks[0].variant;
    original.lessons[0].homework.exposure = 'reserved';
    const parsed = backupSchema.parse(original);
    if (parsed.schemaVersion !== 3 && parsed.schemaVersion !== 4)
      throw new Error('Expected lesson backup');
    expect(parsed.lessons[0]!.homework).toMatchObject({ status: 'paused', exposure: 'unknown' });
    expect(parsed.attempts).toEqual(original.attempts);
  });
});
