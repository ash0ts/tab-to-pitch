import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeHarmony, type ChordQuality } from '../../src/engine/harmony.js';
import type { NoteEvent } from '../../src/engine/types.js';

interface Example {
  recording: string;
  timeSeconds: number;
  quality: string;
  shape: number[];
  midi: number[];
  formulaMatches: boolean;
  possibleRoots: number[];
}
const input = resolve(process.argv[2]!);
const output = resolve(process.argv[3]!);
const bytes = await readFile(input);
const rows = JSON.parse(bytes.toString('utf8')) as Example[];
const qualities: Record<string, ChordQuality> = {
  maj: 'major',
  min: 'minor',
  aug: 'augmented',
  dim: 'diminished',
  Maj7: 'maj7',
  '7': '7',
  m7: 'm7',
  m7b5: 'm7b5',
};
const sources = [
  'src/engine/harmony.ts',
  'src/engine/theory.ts',
  'src/engine/types.ts',
  'package-lock.json',
];
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const sourceHashes = Object.fromEntries(
  await Promise.all(sources.map(async (path) => [path, hash(await readFile(path))])),
);
let matched = 0,
  ambiguous = 0,
  unavailable = 0;
const results = rows
  .filter((row) => row.formulaMatches)
  .map((row, index) => {
    const notes: NoteEvent[] = row.midi.map((midi, noteIndex) => ({
      id: `techs-${index}-${noteIndex}`,
      trackId: 'recorded',
      staffIndex: 0,
      voiceIndex: 0,
      measureIndex: 0,
      beatId: `techs-${index}`,
      onsetTicks: 0,
      durationTicks: 960,
      soundingMidi: midi,
      spelling: null,
      position: null,
      effects: {},
      eligible: true,
    }));
    const analysis = analyzeHarmony(notes);
    const valid = analysis.interpretations.some(
      (item) =>
        item.chord.quality === qualities[row.quality] &&
        row.possibleRoots.includes(item.chord.rootPitchClass) &&
        item.bassMidi === Math.min(...row.midi),
    );
    matched += Number(valid);
    ambiguous += Number(analysis.status === 'ambiguous');
    unavailable += Number(analysis.status === 'unavailable');
    return {
      recording: row.recording,
      timeSeconds: row.timeSeconds,
      matched: valid,
      status: analysis.status,
      interpretations: analysis.interpretations.map((item) => ({
        quality: item.chord.quality,
        rootPitchClass: item.chord.rootPitchClass,
        bassDegree: item.bassDegree,
      })),
    };
  });
for (const path of sources)
  if (hash(await readFile(path)) !== sourceHashes[path])
    throw new Error('Engine source changed during conformance check');
const report = {
  inputSha256: hash(bytes),
  sourceHashes,
  sourceRows: rows.length,
  formulaMismatchExcluded: rows.length - results.length,
  eligibleRows: results.length,
  matched,
  ambiguous,
  unavailable,
  result:
    'Exact formula/root inclusion and sounding-bass agreement; not independent audio transcription or learning',
  results,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ eligibleRows: results.length, matched, ambiguous, unavailable }));
if (matched !== results.length) process.exitCode = 2;
