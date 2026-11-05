import type { HarmonySpan, ProgressionVariation } from './harmony.js';
import { findNotePositions, displayNoteLabel } from './exploration.js';
import { isQuizEligible, pitchClass } from './theory.js';
import type { ExerciseDefinition, ExerciseKind, ScoreDocument, ScoreTrack } from './types.js';

export const DEGREE_LABELS: Record<string, string> = {
  '1': 'root',
  '2': 'second',
  b3: 'minor third',
  '3': 'major third',
  '4': 'fourth',
  b5: 'diminished fifth',
  '5': 'fifth',
  '#5': 'augmented fifth',
  '6': 'sixth',
  bb7: 'diminished seventh',
  b7: 'minor seventh',
  '7': 'major seventh',
  '9': 'ninth',
  '11': 'eleventh',
  '13': 'thirteenth',
};

function hash(value: string): string {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return (result >>> 0).toString(36);
}

/** Only explicitly confirmed harmony can generate graded musical-role questions. */
export function createHarmonyExercises(
  score: ScoreDocument,
  track: ScoreTrack,
  spans: readonly HarmonySpan[],
  variation?: ProgressionVariation | null,
  region = { minFret: 0, maxFret: 12 },
): ExerciseDefinition[] {
  const bank: ExerciseDefinition[] = [];
  const heldoutStart =
    score.measures.length >= 4
      ? score.measures[Math.floor(score.measures.length * 0.75)]!.startTicks
      : Infinity;
  function base(
    kind: ExerciseKind,
    span: HarmonySpan,
    suffix: string,
  ): Omit<ExerciseDefinition, 'prompt' | 'choices' | 'answer' | 'explanation'> {
    const id = `${kind}:v1:${hash(JSON.stringify([score.hash, track.id, span.id, span.chord?.id, suffix]))}`;
    return {
      id,
      scoreId: score.id,
      trackId: track.id,
      skillId: kind,
      kind,
      noteIds: [...span.sourceNoteIds],
      partition: span.startTick >= heldoutStart ? 'heldout' : 'practice',
      transferKeys: [`harmony:${span.chord?.id}:${suffix}`],
      mask: { noteIds: [...span.sourceNoteIds], hide: 'role' },
    };
  }
  const choose = (correct: string, pool: string[], id: string) =>
    [correct, ...pool.filter((value) => value !== correct).slice(0, 3)]
      .map((value) => ({ id: `${id}:${value}`, value, label: value }))
      .sort((a, b) => hash(a.id).localeCompare(hash(b.id)));
  for (const [index, span] of spans.entries()) {
    if (span.confirmation !== 'confirmed' || !span.chord || !span.sourceNoteIds.length) continue;
    const chord = span.chord;
    for (const note of track.notes.filter(
      (item) => span.sourceNoteIds.includes(item.id) && isQuizEligible(item),
    )) {
      const tone = chord.tones.find((item) => item.pitchClass === pitchClass(note.soundingMidi!));
      if (!tone) continue;
      const answer = DEGREE_LABELS[tone.degree]!;
      const item = base(
        'chord-tone',
        span,
        `${note.soundingMidi}:${note.position?.string}:${note.position?.fret}:${tone.degree}`,
      );
      bank.push({
        ...item,
        prompt: `In ${chord.symbol}, what is the role of ${displayNoteLabel(note)}?`,
        choices: choose(
          answer,
          [
            'root',
            'major third',
            'minor third',
            'fifth',
            'minor seventh',
            'major seventh',
            'ninth',
            'eleventh',
            'thirteenth',
          ],
          item.id,
        ),
        answer: { type: 'text', accepted: [answer, tone.degree] },
        explanation: `${tone.noteName} is the ${answer} of the confirmed ${chord.symbol} harmony.`,
      });
    }
    const next = spans[index + 1];
    const target =
      next?.confirmation === 'confirmed'
        ? next.chord?.tones.find((tone) => tone.degree === '3' || tone.degree === 'b3')
        : undefined;
    if (target && next?.chord) {
      const positions = findNotePositions(
        60 + target.pitchClass,
        track.tuningMidi,
        track.capo,
        region,
      );
      if (positions.length) {
        const item = base(
          'next-target',
          span,
          `${next.chord.id}:${target.degree}:${region.minFret}:${region.maxFret}`,
        );
        const first = positions[0]!;
        const keys = new Set(positions.map((position) => `${position.string}:${position.fret}`));
        const values = [`${first.string}:${first.fret}`];
        for (let fret = region.minFret; fret <= region.maxFret && values.length < 4; fret++) {
          const value = `${first.string}:${fret}`;
          if (!keys.has(value)) values.push(value);
        }
        bank.push({
          ...item,
          noteIds: [...new Set([...item.noteIds, ...next.sourceNoteIds])],
          mask: { noteIds: [...new Set([...item.noteIds, ...next.sourceNoteIds])], hide: 'fret' },
          prompt: `Moving from ${chord.symbol} to ${next.chord.symbol}, find its ${DEGREE_LABELS[target.degree]} between frets ${region.minFret} and ${region.maxFret}. Any octave.`,
          choices: values
            .map((value) => ({
              id: `${item.id}:${value}`,
              value,
              label: `String ${value.split(':')[0]}, fret ${value.split(':')[1]}`,
            }))
            .sort((a, b) => hash(a.id).localeCompare(hash(b.id))),
          answer: { type: 'position', positions },
          explanation: `${target.noteName} is the ${DEGREE_LABELS[target.degree]} of ${next.chord.symbol}. Every matching location in this region is accepted.`,
        });
      }
    }
    const event = variation?.events.find((item) => item.spanId === span.id);
    if (!event) continue;
    const added = event.voicing.chord.tones.filter(
      (tone) => !chord.tones.some((original) => original.pitchClass === tone.pitchClass),
    );
    const removed = chord.tones.filter(
      (tone) =>
        !event.voicing.chord.tones.some((changed) => changed.pitchClass === tone.pitchClass),
    );
    if (added.length !== 1 || removed.length) continue;
    const tone = added[0]!;
    const item = base('changed-tone', span, `${event.voicing.chord.id}:${tone.degree}`);
    bank.push({
      ...item,
      prompt: `Which note was added to change ${chord.symbol} into ${event.voicing.chord.symbol}?`,
      choices: choose(
        tone.noteName,
        chord.tones.map((original) => original.noteName),
        item.id,
      ),
      answer: { type: 'pitch', midi: 60 + tone.pitchClass, octaveRequired: false },
      explanation: `The added ${tone.noteName} is the ${DEGREE_LABELS[tone.degree]} in ${event.voicing.chord.symbol}.`,
      listeningExample: [
        chord.tones.map((original) => 48 + chord.rootPitchClass + original.semitones),
        event.voicing.chord.tones.map(
          (original) => 48 + event.voicing.chord.rootPitchClass + original.semitones,
        ),
      ],
    });
  }
  return bank;
}
