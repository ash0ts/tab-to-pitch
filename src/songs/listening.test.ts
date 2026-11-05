import { describe, expect, it } from 'vitest';
import {
  PASSAGES,
  RECORDINGS,
  localSongLists,
  matchSong,
  passageReady,
  passageSchema,
} from './catalog';
import { createListeningExercise, gradeListening } from './listening';
import { catalogScore } from '../player/catalog-score';
import * as alphaTab from '@coderline/alphatab';
import { adaptScore } from '../engine/adapter';
import { PlaybackCoordinator } from '../player/PlaybackCoordinator';

describe('list provenance and recording qualification', () => {
  it('parses quoted CSV, BOM, CRLF, and artist/title lines without evaluating content', () => {
    expect(localSongLists.parse('\uFEFFtitle,artist\r\n"One, two",Someone')).toEqual([
      { title: 'One, two', artist: 'Someone' },
    ]);
    expect(localSongLists.parse('U2 - With or Without You')).toEqual([
      { artist: 'U2', title: 'With or Without You' },
    ]);
    expect(localSongLists.parse('artist,title\nSomeone,"=SUM(A1)"')[0]!.title).toBe('=SUM(A1)');
    expect(() => localSongLists.parse('artist,title\n"unfinished')).toThrow();
    expect(matchSong({ title: 'Stand by Me', artist: 'Another artist' }).status).toBe(
      'unsupported',
    );
    expect(matchSong({ title: 'Stand by Me', artist: '' }).status).toBe('confirmation');
  });
  it('does not promote familiar titles or unaligned recordings into grading keys', () => {
    for (const p of PASSAGES.filter((p) => p.status === 'pending')) {
      expect(passageReady(p)).toBe(false);
      expect(() => createListeningExercise(p, 'recall')).toThrow(/reviewed/);
    }
    expect(passageSchema.safeParse({ ...PASSAGES[2], status: 'reviewed' }).success).toBe(false);
    expect(
      passageReady(
        { ...PASSAGES[0]!, status: 'reviewed' },
        { ...RECORDINGS.find((r) => r.id === 'u2-official')!, availability: 'pending' },
      ),
    ).toBe(false);
  });
});

describe('frozen listening grading', () => {
  const exercise = createListeningExercise(PASSAGES[0]!, 'recall');
  it('grades independently authored roots, qualities and order', () => {
    expect(gradeListening(exercise, ['Dm7', 'G7', 'Cmaj7', 'Am7']).correct).toBe(true);
    const quality = gradeListening(exercise, ['D', 'G7', 'Cmaj7', 'Am7']);
    expect(quality.root).toEqual([true, true, true, true]);
    expect(quality.quality).toEqual([false, true, true, true]);
    expect(quality.feedback[0]).toContain('root matches');
    const root = gradeListening(exercise, ['Em7', 'G7', 'Cmaj7', 'Am7']);
    expect(root.root[0]).toBe(false);
    expect(root.quality[0]).toBe(true);
    expect(gradeListening(exercise, ['G7', 'Dm7', 'Cmaj7', 'Am7']).feedback[0]).toContain(
      'different order',
    );
    expect(gradeListening(exercise, ['Dm7', 'G7', 'Cmaj7']).correct).toBe(false);
  });
  it('accepts enharmonic roots and explicitly accepted interpretations', () => {
    const p = structuredClone(PASSAGES[0]!);
    p.chords[0] = { symbol: 'C#', beats: 4, alternatives: ['C#maj7'] };
    const e = createListeningExercise(p, 'guided');
    expect(gradeListening(e, ['Db']).correct).toBe(true);
    expect(gradeListening(e, ['Dbmaj7']).correct).toBe(true);
    expect(gradeListening(e, ['Dbm']).correct).toBe(false);
  });
  it('gives variants distinct identities and cannot pretend synthetic audio is a recording', () => {
    expect(createListeningExercise(PASSAGES[0]!, 'guided', 'synthesized', 1).slots).toEqual([1]);
    expect(() => createListeningExercise(PASSAGES[0]!, 'recall', 'recording')).toThrow();
  });
});

it('builds a separate timed accompaniment with all four verified seventh chords', () => {
  const p = PASSAGES[0]!,
    result = catalogScore(p);
  const score = adaptScore(
    alphaTab.importer.ScoreLoader.loadAlphaTex(result.alphaTex),
    result.sourceId,
  );
  expect(score.hash).toBe('catalog:songs-v1:original-c');
  expect(score.measures).toHaveLength(4);
  const expected = [
    [0, 2, 5, 9],
    [2, 5, 7, 11],
    [0, 4, 7, 11],
    [0, 4, 7, 9],
  ];
  score.measures.forEach((_, i) =>
    expect(
      [
        ...new Set(
          score.tracks[0]!.notes.filter((n) => n.measureIndex === i).map(
            (n) => n.soundingMidi! % 12,
          ),
        ),
      ].sort((a, b) => a - b),
    ).toEqual(expected[i]),
  );
});

it('stops other clocks before granting playback and unregisters disposed players', () => {
  const coordinator = new PlaybackCoordinator(),
    calls: string[] = [];
  coordinator.register('score', () => calls.push('score'));
  const remove = coordinator.register('video', () => calls.push('video'));
  coordinator.claim('score');
  expect(calls).toEqual(['video']);
  remove();
  coordinator.claim('score');
  expect(calls).toEqual(['video']);
  coordinator.claim('audition');
  expect(calls).toEqual(['video', 'score']);
});

it('matches overlapping accepted interpretations without greedy order errors', () => {
  const p = structuredClone(PASSAGES[0]!);
  p.chords = [
    { symbol: 'C6', alternatives: ['Am7'], beats: 4 },
    { symbol: 'C6', alternatives: [], beats: 4 },
  ];
  const e = createListeningExercise(p, 'recall');
  expect(gradeListening(e, ['C6', 'Am7']).feedback[0]).toContain('different order');
  const mixed = gradeListening(e, ['Cm7', 'C6']);
  expect(mixed.correct).toBe(false);
  expect(mixed.root[0]).toBe(true);
  expect(mixed.quality[0]).toBe(true);
  expect(mixed.feedback[0]).toContain('different accepted interpretations');
});
