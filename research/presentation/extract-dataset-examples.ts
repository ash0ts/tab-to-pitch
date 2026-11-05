/** Extract public annotated music and aggregate recall provenance, never review rows. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExerciseBank } from '../../src/engine/exercises.js';
import { gradeExercise } from '../../src/engine/assessment.js';
import { midiToSpn } from '../../src/engine/theory.js';
import type { NormalizedRecording } from '../music-data/guitarset.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const data = resolve(root, '../tabtopitch-real-data');
const output = resolve(data, 'presentation');
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const load = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const provenance = await load(resolve(data, 'guitarset/provenance.json'));
const normalized = await readFile(resolve(data, 'guitarset/normalized-recordings.jsonl'));
assert.equal(sha(normalized), provenance.outputFiles['normalized-recordings.jsonl'].sha256);
const recording = normalized
  .toString()
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as NormalizedRecording)
  .find((record) => record.id === '05_BN3-119-G_comp')!;
const raw = await readFile(resolve(data, 'guitarset/raw', `${recording.id}.jams`));
assert.equal(sha(raw), recording.sourceSha256);
const observed = recording.sourceNotes.find(
  (note) => note.sourceStringIndex === 4 && note.sourceObservationIndex === 0,
)!;
const canonical = recording.score.tracks[0]!.notes.find((note) => note.id === observed.id)!;
const annotation = JSON.parse(raw.toString()).annotations.find(
  (item: any) => item.namespace === 'note_midi' && item.annotation_metadata.data_source === '4',
).data[0];
assert.equal(annotation.time, observed.timeSeconds);
assert.equal(annotation.duration, observed.durationSeconds);
assert.equal(annotation.value, observed.observedMidi);
assert.equal(canonical.eligible, true);
assert.deepEqual(observed.exclusionReasons, []);
const questions = createExerciseBank(recording.score, 'guitarset-track', {
  maxFret: 24,
  octaveRequired: true,
  reserveHeldout: false,
}).filter((question) => question.noteIds.length === 1 && question.noteIds[0] === observed.id);
assert.equal(questions.length, 2);
const name = questions.find((question) => question.kind === 'note-name')!;
const position = questions.find((question) => question.kind === 'note-location')!;
const pitch = midiToSpn(canonical.soundingMidi!);
assert.equal(gradeExercise(name, pitch).correct, true);
assert.equal(position.answer.type, 'position');
if (position.answer.type !== 'position') throw new Error('Expected exact-pitch locations');
for (const answer of position.answer.positions) {
  assert.equal(gradeExercise(position, `${answer.string}:${answer.fret}`).correct, true);
  assert.equal(
    recording.score.tracks[0]!.tuningMidi[answer.string - 1]! + answer.fret,
    observed.nearestMidi,
  );
}
const reportBytes = await readFile(resolve(data, 'recall/run-003/report.json'));
assert.equal(sha(reportBytes), '1fd45ed156ac3a61bdfdc038cc360e087708bd5bde3314aab868f0506cb1cf48');
const report = JSON.parse(reportBytes.toString());
const recallProvenance = await load(resolve(data, 'recall/run-003/dataset-manifest.json'));
const model = await load(resolve(data, 'recall/run-003/model.json'));
const payload = {
  schemaVersion: 1,
  guitar: {
    source: {
      dataset: provenance.dataset,
      version: provenance.version,
      sourceUrl: provenance.sourceUrl,
      license: provenance.license,
      attribution: provenance.attribution,
      recording: recording.id,
      sourceSha256: recording.sourceSha256,
      rawLocator: 'note_midi annotation data_source=4, data[0]',
    },
    observed,
    canonical,
    pitch,
    questions,
    alternativePositions: position.answer.positions,
    counts: await load(resolve(data, 'guitarset/integrity-report.json')),
    status:
      'Actual public annotated note and generated application questions; fret positions are inferred, not observed.',
  },
  recall: {
    source: {
      dataset: recallProvenance.dataset,
      revision: recallProvenance.revision,
      sourceUrl: recallProvenance.sourceUrl,
      license: recallProvenance.license,
    },
    target: report.target,
    counts: report.exclusions,
    selectedCollections: recallProvenance.selectedCollectionCount,
    splits: report.splits,
    featureNames: model.featureNames,
    reportSha256: sha(reportBytes),
    visualStatus:
      'Schematic feature/target boundary. No individual review, ID, timestamp, or history is included.',
  },
  evidenceBoundary:
    'GuitarSet supplies annotated musical content. FSRS supplies self-rated flashcard outcomes. Neither measures the effect of TabToPitch instruction on guitar recall.',
};
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'dataset-examples.json'), JSON.stringify(payload, null, 2) + '\n');
console.info(
  JSON.stringify(
    {
      output,
      recording: recording.id,
      pitch,
      nameQuestion: name.prompt,
      locationQuestion: position.prompt,
      acceptedPositions: position.answer.positions,
      rawReviewRowsExported: 0,
    },
    null,
    2,
  ),
);
