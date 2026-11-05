import type { PlayingStep } from '../shared/homework-playing';
import { formatPitch } from '../engine/exploration';

/** Presentation groups the existing tasks; it does not add a curriculum or grading state. */
export const HOMEWORK_PHASES = [
  {
    id: 'notes',
    title: 'Find notes',
    objectives: ['note'],
  },
  {
    id: 'shapes',
    title: 'Connect shapes',
    objectives: ['fragment', 'neighbor'],
  },
  {
    id: 'changes',
    title: 'Play changes',
    objectives: ['progression'],
  },
  {
    id: 'music',
    title: 'Make music',
    objectives: ['connection', 'phrase'],
  },
] as const;

export function homeworkGuide(step: PlayingStep) {
  const note = formatPitch(step.pitches[0] ?? 60, false);
  switch (step.objective) {
    case 'note':
      return {
        instruction: `Play ${note} and say its name. Then find another ${note} between frets ${step.region.minFret} and ${step.region.maxFret}.`,
        why: 'Naming the note while you play connects its sound and location. Hide the labels when you want to try from memory.',
        check: 'Listen for the note, then tell us how the attempt felt.',
      };
    case 'fragment':
    case 'neighbor':
      return {
        instruction:
          'Pick the three notes in any order. Say root, third and fifth. Then try the fragment without labels.',
        why: 'The CAGED family names the shape landmark. The note names and degrees tell you what chord you are actually playing.',
        check: 'Can you find the root again after taking your hand away?',
      };
    case 'progression':
      return {
        instruction:
          'Play each chord with the backing. Stay in this neck region. Repeat one change if you need more time.',
        why: 'Small voicings connect the fretboard map to a musical progression. Another valid voicing is welcome.',
        check: 'Notice which change needs another pass before moving to another region.',
      };
    case 'connection':
      return {
        instruction:
          'Play F, then E one semitone lower. Hear the seventh of G7 resolve to the third of Cmaj7.',
        why: 'Following one voice makes the chord change easier to hear. The same connection is available in other positions.',
        check: 'Keep the descending semitone, even when you choose another octave.',
      };
    case 'phrase':
      return {
        instruction:
          'Make a short answer over G7 → Cmaj7. Include a rest and finish on E. Choose the other notes and rhythm yourself.',
        why: 'Use the chord-tone connection to make your own musical response. There is no single correct melody.',
        check: 'Would you keep it, change it, or play a different answer?',
      };
  }
}
