import { generateVoicings, type ChordDefinition, type VoicingOptions } from './harmony';
import { rankVoicingsWithModel, validateVoicingRankerModel } from './voicing-ranker';
import type { FretPosition } from './types';

type Request = {
  chord: ChordDefinition;
  options: VoicingOptions;
  tuning: number[];
  capo: number;
  previous: { position: FretPosition; midi: number }[];
  pitchClasses: number[];
};
self.addEventListener('message', async (event: MessageEvent<Request>) => {
  try {
    const { chord, options, tuning, capo, previous, pitchClasses } = event.data;
    const response = await fetch('/research/voicing-ranker-v1.json');
    if (!response.ok) throw new Error('Model asset unavailable');
    const artifact = await response.json();
    if (artifact?.kind === 'model-reference' && artifact.bundled === false) {
      self.postMessage({
        status: 'unsupported',
        voicings: [],
        reason:
          'Trained ranking parameters are not bundled. Movement-based progression remains available.',
      });
      return;
    }
    const model = validateVoicingRankerModel(artifact);
    if (!model) throw new Error('The experimental model could not be validated.');
    const bank = generateVoicings(chord, tuning, capo, { ...options, maxCandidates: 64 });
    const target = [...pitchClasses].sort((a, b) => a - b).join(',');
    const candidates = bank.voicings.filter(
      (voicing) =>
        voicing.notes
          .map((note) => note.midi % 12)
          .sort((a, b) => a - b)
          .join(',') === target,
    );
    const result = rankVoicingsWithModel({
      voicings: candidates,
      previous,
      requestedPitchClassMultiset: pitchClasses,
      tuningMidi: tuning,
      capo,
      model,
    });
    self.postMessage({ ...result, candidateCount: candidates.length, searchStatus: bank.status });
  } catch {
    self.postMessage({
      status: 'unsupported',
      voicings: [],
      reason:
        'The experimental ordering could not finish. The movement-based progression remains available.',
    });
  }
});
