import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineChord, generateVoicings } from './harmony.js';
import {
  rankVoicingsWithModel,
  scoreVoicingShape,
  validateVoicingRankerModel,
  voicingRankFeatures,
} from './voicing-ranker.js';

const modelBytes = readFileSync(
  new URL('../../public/research/voicing-ranker-v1.json', import.meta.url),
);
const model = validateVoicingRankerModel(JSON.parse(modelBytes.toString('utf8')))!;
const parity = JSON.parse(
  readFileSync(
    new URL('../../research/voicing-ranking/runtime-parity.json', import.meta.url),
    'utf8',
  ),
) as {
  modelSha256: string;
  cases: {
    previous: number[];
    pitchClassMultiset: number[];
    candidates: { shape: number[]; features: number[]; score: number }[];
  }[];
};
const tuning = [64, 59, 55, 50, 45, 40];

describe('experimental recorded-choice ordering', () => {
  it('matches every Python feature and score in the frozen public-data parity sample', () => {
    expect(createHash('sha256').update(modelBytes).digest('hex')).toBe(parity.modelSha256);
    expect(parity.cases).toHaveLength(12);
    for (const sample of parity.cases)
      for (const candidate of sample.candidates) {
        const features = voicingRankFeatures(candidate.shape, sample.previous);
        expect(features).not.toBeNull();
        features!.forEach((value, index) =>
          expect(Math.abs(value - candidate.features[index]!)).toBeLessThan(1e-9),
        );
        expect(
          Math.abs(scoreVoicingShape(candidate.shape, sample.previous, model)! - candidate.score),
        ).toBeLessThan(1e-9);
      }
  });

  it('rejects malformed models and shapes', () => {
    expect(model).not.toBeNull();
    expect(validateVoicingRankerModel({ ...model, std: Array(10).fill(0) })).toBeNull();
    expect(validateVoicingRankerModel({ ...model, weights: Array(10).fill(NaN) })).toBeNull();
    expect(
      validateVoicingRankerModel({ ...model, features: [...model.features].reverse() }),
    ).toBeNull();
    expect(voicingRankFeatures([0, -1], [0, -1])).toBeNull();
    expect(voicingRankFeatures([0, 12, 2, -1, -1, -1], [0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it('only reorders existing valid engine candidates and preserves unsupported order', () => {
    const chord = defineChord('G', 'maj7')!;
    const voicings = generateVoicings(chord, tuning, 0, {
      voiceCount: 4,
      maxCandidates: 100,
      omitFifth: false,
    }).voicings;
    expect(voicings.length).toBeGreaterThan(1);
    const originalIds = voicings.map((v) => v.id);
    const input = {
      voicings,
      previous: voicings[0]!.notes,
      requestedPitchClassMultiset: chord.tones.map((t) => t.pitchClass),
      tuningMidi: tuning,
      capo: 0,
      model,
    };
    const ranked = rankVoicingsWithModel(input);
    expect(ranked.status).toBe('ranked');
    expect(ranked.voicings.map((v) => v.id).sort()).toEqual([...originalIds].sort());
    expect(voicings.map((v) => v.id)).toEqual(originalIds);
    for (const unsupported of [
      { ...input, capo: 2 },
      { ...input, tuningMidi: [64, 59, 55, 50, 45, 38] },
      { ...input, requestedPitchClassMultiset: [0, 4, 7] },
      { ...input, previous: [] },
    ]) {
      const result = rankVoicingsWithModel(unsupported);
      expect(result.status).toBe('unsupported');
      expect(result.reason).toBeTruthy();
      expect(result.voicings.map((v) => v.id)).toEqual(originalIds);
    }
  });
});
