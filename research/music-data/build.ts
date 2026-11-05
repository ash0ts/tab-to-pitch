import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExerciseBank } from '../../src/engine/exercises.js';
import { gradeExercise } from '../../src/engine/assessment.js';
import {
  ADAPTER_VERSION,
  ARCHIVE_MD5,
  ARCHIVE_SHA256,
  DATASET_VERSION,
  EXCLUDED_RECORDINGS,
  makeCoachCase,
  normalizeRecording,
  type NormalizedRecording,
} from './guitarset.js';

const root = resolve(process.argv[2] ?? '../tabtopitch-real-data/guitarset');
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
await mkdir(root, { recursive: true });
const archive = await readFile(resolve(root, 'annotation.zip'));
if (
  sha(archive) !== ARCHIVE_SHA256 ||
  createHash('md5').update(archive).digest('hex') !== ARCHIVE_MD5
)
  throw new Error('GuitarSet archive differs from pinned release');
const files = (await readdir(resolve(root, 'raw'))).filter((f) => f.endsWith('.jams')).sort();
if (files.length !== 360) throw new Error(`Expected 360 recordings, found ${files.length}`);
const records: NormalizedRecording[] = [];
for (const file of files)
  records.push(
    normalizeRecording(file.replace(/\.jams$/, ''), await readFile(resolve(root, 'raw', file))),
  );
const cases = records.map(makeCoachCase).filter((c) => c !== null);
const testCases = cases.filter((c) => c.split === 'test');
if (testCases.length !== 20)
  throw new Error(`Frozen test cohort needs all 20 recordings; got ${testCases.length}`);
const bySplit: Record<
  string,
  { recordings: number; sourceNotes: number; eligibleNotes: number; coachCases: number }
> = {};
const exclusions: Record<string, number> = {};
const exerciseCounts: Record<string, number> = {};
let gradedCorrectAnswers = 0,
  invalidGrading = 0,
  positionAnswersChecked = 0,
  invalidPositions = 0;
for (const record of records) {
  const eligible = record.sourceNotes.filter((n) => n.exclusionReasons.length === 0);
  const stats = (bySplit[record.split] ??= {
    recordings: 0,
    sourceNotes: 0,
    eligibleNotes: 0,
    coachCases: 0,
  });
  stats.recordings++;
  stats.sourceNotes += record.sourceNotes.length;
  stats.eligibleNotes += eligible.length;
  stats.coachCases += Number(cases.some((c) => c.recordingId === record.id));
  for (const note of record.sourceNotes)
    for (const reason of note.exclusionReasons) exclusions[reason] = (exclusions[reason] ?? 0) + 1;
  const bank = createExerciseBank(record.score, 'guitarset-track', {
    maxFret: 24,
    octaveRequired: true,
    reserveHeldout: false,
  });
  for (const exercise of bank) {
    exerciseCounts[exercise.kind] = (exerciseCounts[exercise.kind] ?? 0) + 1;
    const source = record.sourceNotes.find((n) => n.id === exercise.noteIds[0])!;
    if (exercise.answer.type === 'position') {
      // Enumerate the fretboard independently, including every alternative on every string.
      const expected = [64, 59, 55, 50, 45, 40].flatMap((open, i) =>
        Array.from({ length: 25 }, (_, fret) => ({ string: i + 1, fret })).filter(
          (p) => open + p.fret === source.nearestMidi && p.string !== 6 - source.sourceStringIndex,
        ),
      );
      const key = (p: { string: number; fret: number }) => `${p.string}:${p.fret}`;
      if (
        JSON.stringify(expected.map(key).sort()) !==
        JSON.stringify(exercise.answer.positions.map(key).sort())
      )
        invalidPositions++;
      for (const position of expected) {
        positionAnswersChecked++;
        if (!gradeExercise(exercise, key(position)).correct) invalidGrading++;
      }
    } else if (exercise.answer.type === 'pitch') {
      const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const answer = `${names[source.nearestMidi % 12]}${Math.floor(source.nearestMidi / 12) - 1}`;
      gradedCorrectAnswers++;
      if (!gradeExercise(exercise, answer).correct) invalidGrading++;
    } else throw new Error('Unqualified exercise family was generated');
  }
}
if (invalidGrading || invalidPositions)
  throw new Error(
    `Independent exercise checks failed: ${invalidGrading} grading, ${invalidPositions} position sets`,
  );
const included = ['train', 'validation', 'test'];
for (let i = 0; i < included.length; i++)
  for (let j = i + 1; j < included.length; j++) {
    for (const field of ['performerId', 'progressionFamily', 'leadSheetId'] as const) {
      const left = new Set(records.filter((r) => r.split === included[i]).map((r) => r[field]));
      if (records.some((r) => r.split === included[j] && left.has(r[field])))
        throw new Error(`Split leakage in ${field}`);
    }
  }
const outputs: Record<string, string> = {
  'normalized-recordings.jsonl': records.map((r) => JSON.stringify(r)).join('\n') + '\n',
  'coach-cases.json': JSON.stringify(cases, null, 2) + '\n',
  'campaign-test-cases.json': JSON.stringify(testCases, null, 2) + '\n',
  'split-manifest.json':
    JSON.stringify(
      {
        version: 'performer-and-progression-v1',
        rule: 'train: performer00-03 and progression1; validation: performer04 and progression2; test: performer05 and progression3; all other combinations excluded from these cohorts',
        recordings: records.map((r) => ({
          id: r.id,
          sourceSha256: r.sourceSha256,
          performerId: r.performerId,
          progressionFamily: r.progressionFamily,
          leadSheetId: r.leadSheetId,
          split: r.split,
        })),
      },
      null,
      2,
    ) + '\n',
  'integrity-report.json':
    JSON.stringify(
      {
        datasetVersion: DATASET_VERSION,
        adapterVersion: ADAPTER_VERSION,
        recordings: records.length,
        performers: new Set(records.map((r) => r.performerId)).size,
        sourceNotes: records.reduce((sum, r) => sum + r.sourceNotes.length, 0),
        eligibleNotes: records.reduce(
          (sum, r) => sum + r.sourceNotes.filter((n) => n.exclusionReasons.length === 0).length,
          0,
        ),
        sourceDurationSeconds: records.reduce((sum, r) => sum + r.durationSeconds, 0),
        bySplit,
        exclusions,
        exerciseCounts,
        gradedCorrectAnswers,
        positionAnswersChecked,
        invalidGrading,
        invalidPositions,
        campaignCases: testCases.length,
        learnerAttempts: 0,
        caveat:
          'Integrity checks concern annotated music and deterministic generated answers, not independent audio transcription, observed frets, pedagogical outcomes, or real learner recall.',
      },
      null,
      2,
    ) + '\n',
};
for (const [name, content] of Object.entries(outputs))
  await writeFile(resolve(root, name), content);
const scriptRoot = fileURLToPath(new URL('.', import.meta.url));
const provenance = {
  dataset: 'GuitarSet',
  version: '1.1.0',
  doi: '10.5281/zenodo.3371780',
  sourceUrl: 'https://zenodo.org/records/3371780',
  archiveUrl: 'https://zenodo.org/records/3371780/files/annotation.zip',
  license: 'CC-BY-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution:
    'Qingyang Xi, Rachel M. Bittner, Johan Pauwels, Xuzhou Ye, Juan P. Bello. GuitarSet: A Dataset for Guitar Transcription. ISMIR 2018.',
  archive: {
    file: 'annotation.zip',
    md5: ARCHIVE_MD5,
    sha256: ARCHIVE_SHA256,
    bytes: archive.length,
  },
  modifications: [
    'Normalize note-level annotations, infer standard-tuning frets from nearest MIDI pitch, retain fractional pitch and measured onset/duration.',
    'Apply explicit timing, fret-range and pitch-contour stability eligibility filters; exclude three upstream-erratum recordings.',
    'Create deterministic pitch/location exercise descriptors with empty learner history; reserve performer/progression-disjoint cohorts.',
  ],
  exclusions: EXCLUDED_RECORDINGS,
  accessDate: '2026-10-29',
  audioDownloaded: false,
  learnerDataPresent: false,
  outputFiles: Object.fromEntries(
    Object.entries(outputs).map(([name, content]) => [
      name,
      { sha256: sha(content), bytes: Buffer.byteLength(content) },
    ]),
  ),
  implementation: await Promise.all(
    ['guitarset.ts', 'build.ts'].map(async (name) => ({
      path: relative(root, resolve(scriptRoot, name)),
      sha256: sha(await readFile(resolve(scriptRoot, name))),
    })),
  ),
};
await writeFile(resolve(root, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(outputs['integrity-report.json']);
