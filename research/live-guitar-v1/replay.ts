import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GuitarDetector } from '../../src/live/detector.js';
import type { PerformanceObservation } from '../../src/shared/live-guitar.js';

export interface SignalCase {
  id: string;
  group: string;
  split: 'development' | 'regression';
  mode: 'notes' | 'chords';
  rate: number;
  notes: number[];
  expected: string | null;
  condition: 'clean' | 'harmonics' | 'silence' | 'clipping' | 'missing-third' | 'ambiguous';
}
// Independently authored pitches and labels, not the production chord-template generator.
export function fixtures(): SignalCase[] {
  const rows: SignalCase[] = [];
  for (const rate of [44100, 48000])
    for (const note of [40, 45, 48, 55, 60, 64, 69, 76, 81, 88])
      for (const condition of ['clean', 'harmonics'] as const)
        rows.push({
          id: `note-${note}-${rate}-${condition}`,
          group: `note-${note}`,
          split: 'development',
          mode: 'notes',
          rate,
          notes: [note],
          expected: `note:${note}`,
          condition,
        });
  const chords: [string, number[], string | null, SignalCase['condition']][] = [
    ['C', [48, 52, 55], 'chord:0:major', 'clean'],
    ['F', [53, 57, 60], 'chord:5:major', 'clean'],
    ['G', [43, 47, 50], 'chord:7:major', 'clean'],
    ['Dm', [50, 53, 57], 'chord:2:minor', 'clean'],
    ['G7', [43, 47, 50, 53], 'chord:7:7', 'clean'],
    ['Cmaj7', [48, 52, 55, 59], 'chord:0:maj7', 'clean'],
    ['Am7-C6', [57, 60, 64, 67], null, 'ambiguous'],
    ['C-power', [48, 55, 60], null, 'missing-third'],
  ];
  for (const rate of [44100, 48000])
    for (const [name, notes, expected, condition] of chords)
      rows.push({
        id: `chord-${name}-${rate}`,
        group: `chord-${name}`,
        split: 'development',
        mode: 'chords',
        rate,
        notes,
        expected,
        condition,
      });
  for (const mode of ['notes', 'chords'] as const)
    for (const condition of ['silence', 'clipping'] as const)
      rows.push({
        id: `${mode}-${condition}`,
        group: condition,
        split: 'regression',
        mode,
        rate: 48000,
        notes: [],
        expected: null,
        condition,
      });
  return rows;
}
export function signal(row: SignalCase): Float32Array {
  return Float32Array.from({ length: row.rate }, (_, frame) => {
    if (row.condition === 'clipping') return 1;
    if (row.condition === 'silence') return 0;
    return row.notes.reduce((sum, note) => {
      const phase = (2 * Math.PI * 440 * 2 ** ((note - 69) / 12) * frame) / row.rate;
      return (
        sum +
        (0.15 / Math.sqrt(row.notes.length)) *
          (Math.sin(phase) +
            (row.condition === 'harmonics'
              ? 0.4 * Math.sin(2 * phase) + 0.2 * Math.sin(3 * phase)
              : 0))
      );
    }, 0);
  });
}
export function replay(row: SignalCase) {
  const samples = signal(row),
    detector = new GuitarDetector(row.id, row.rate, row.mode);
  let first: PerformanceObservation | null = null,
    delayMs: number | null = null;
  const observations: PerformanceObservation[] = [];
  const started = performance.now();
  for (let frame = 0; frame < samples.length; frame += 512) {
    const end = Math.min(samples.length, frame + 512);
    const observation = detector.push(samples.subarray(frame, end), frame, (end / row.rate) * 1000);
    if (observation) {
      observations.push(observation);
      if (!first && observation.stable && !observation.problems.length) {
        first = observation;
        delayMs = (end / row.rate) * 1000;
      }
    }
  }
  const detected = first
    ? first.kind === 'note'
      ? `note:${Math.round(first.pitches[0]!)}`
      : `chord:${first.chords[0]!.root}:${first.chords[0]!.quality}`
    : null;
  return {
    id: row.id,
    group: row.group,
    mode: row.mode,
    condition: row.condition,
    rate: row.rate,
    expected: row.expected,
    detected,
    assessed: detected !== null,
    correct: detected !== null && detected === row.expected,
    falseMatch: row.expected === null && detected !== null,
    offlineDetectionDelayMs: delayMs,
    processMs: performance.now() - started,
    first,
    observations,
  };
}
export function interval(correct: number, total: number) {
  if (!total) return null;
  const z = 1.96,
    p = correct / total,
    d = 1 + (z * z) / total,
    c = (p + (z * z) / (2 * total)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / d;
  return { numerator: correct, denominator: total, value: p, wilson95: [c - h, c + h] };
}
export function aggregate(rows: ReturnType<typeof replay>[]) {
  return ['notes', 'chords'].map((mode) => {
    const all = rows.filter((r) => r.mode === mode),
      eligible = all.filter((r) => r.expected !== null),
      supported = eligible.filter((r) => r.assessed),
      unknown = all.filter((r) => r.expected === null);
    return {
      mode,
      precision: interval(supported.filter((r) => r.correct).length, supported.length),
      coverage: interval(supported.length, eligible.length),
      correctRecovery: interval(supported.filter((r) => r.correct).length, eligible.length),
      falseMatchesOnUnknown: interval(unknown.filter((r) => r.falseMatch).length, unknown.length),
      delaysMs: supported.map((r) => r.offlineDetectionDelayMs).sort((a, b) => a! - b!),
    };
  });
}
async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const output = resolve(process.argv[2] ?? '../live-guitar-results/run-001');
  await mkdir(output, { recursive: true });
  const sourceFiles = [
    'package-lock.json',
    'src/live/detector.ts',
    'src/live/chords.ts',
    'src/shared/live-guitar.ts',
    'research/live-guitar-v1/replay.ts',
    'research/live-guitar-v1/protocol.json',
  ];
  const sources = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (p) => [
        p,
        createHash('sha256')
          .update(await readFile(resolve(root, p)))
          .digest('hex'),
      ]),
    ),
  );
  for(const path of sourceFiles){const destination=resolve(output,'source',path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,await readFile(resolve(root,path)),{flag:'wx'});}
  const frozen = fixtures();
  // Exclusive writes preserve every earlier run and freeze membership before execution.
  await writeFile(
    resolve(output, 'manifest.json'),
    JSON.stringify(
      { version: 'live-guitar-v1', createdAt: new Date().toISOString(), sources, fixtures: frozen },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  const rows = frozen.map(replay);
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(
      {
        status: 'development-only',
        realGuitarRecordings: 0,
        physicalInterfaces: 0,
        paidCalls: 0,
        summary: aggregate(rows),
        rows,
        unexecuted: [
          'recorded-guitar',
          'physical-latency',
          'Jam Origin',
          'Forge actor and critic',
          'remote publication',
        ],
      },
      null,
      2,
    ),
    { flag: 'wx' },
  );
  process.stdout.write(JSON.stringify({ output, summary: aggregate(rows) }, null, 2) + '\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
