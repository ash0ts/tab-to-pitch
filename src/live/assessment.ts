import {
  LIVE_VERSION,
  type LiveAssessmentContract,
  type PerformanceObservation,
} from '../shared/live-guitar';
import { parseChordSymbol } from '../engine/harmony';
import type { HomeworkTask } from '../shared/homework';
import { homeworkLiveTask } from '../homework/planner';

// Allow brief attack/decay transitions, but do not grade only the recognizable
// portion of an otherwise uncertain response. This is a versioned heuristic,
// not a calibrated probability or a claim that undetected notes were absent.
function hasSustainedUncertainty(observations: readonly PerformanceObservation[]) {
  let since: number | null = null;
  for (const observation of observations) {
    if (observation.problems.includes('unsupported')) return true;
    if (observation.problems.some((p) => p === 'ambiguous' || p === 'weak-signal')) {
      since ??= observation.captureMs;
      if (observation.captureMs - since >= 250) return true;
    } else {
      since = null;
    }
  }
  return false;
}

export function stableResponses(observations: readonly PerformanceObservation[]) {
  const seen = new Set<number>();
  return observations.filter((o) => {
    if (!o.stable || o.problems.length || seen.has(o.attackId)) return false;
    seen.add(o.attackId);
    return true;
  });
}

export function assessPerformance(
  task: LiveAssessmentContract,
  observations: readonly PerformanceObservation[],
  currentRevision: string,
) {
  if (task.sourceRevision !== currentRevision)
    return {
      outcome: 'interrupted' as const,
      reason: 'The musical selection changed. Start a new attempt.',
    };
  if (
    observations.some(
      (o) =>
        o.problems.includes('dropped-audio') ||
        o.problems.includes('interrupted') ||
        o.problems.includes('clipping'),
    )
  )
    return {
      outcome: 'unassessed' as const,
      reason: 'Input was interrupted or clipped. This is not an incorrect answer.',
    };
  const responses = stableResponses(observations);
  if (hasSustainedUncertainty(observations))
    return {
      outcome: 'unassessed' as const,
      reason:
        'Part of the response remained uncertain or unsupported. Isolate its notes before trying again.',
    };
  const expectedCount = task.kind === 'chords' ? task.chords.length : task.pitches.length;
  if (responses.length < expectedCount)
    return {
      outcome: 'unassessed' as const,
      reason:
        'There was not enough stable input to assess the whole response. Try picking the notes separately.',
    };
  const normalize = (n: number) => task.exactOctave ? Math.round(n) : Math.round(n) % 12;
  const unordered = task.order === 'any' && task.kind !== 'chords';
  const expected = unordered ? task.pitches.map(normalize).sort((a,b) => a-b) : task.pitches;
  const compared = unordered ? [...responses.slice(0, expectedCount)].sort((a,b) => normalize(a.pitches[0] ?? 0)-normalize(b.pitches[0] ?? 0)) : responses.slice(0, expectedCount);
  const matches = compared.map((o, i) => {
    if (task.kind === 'chords') {
      if (o.kind !== 'chord' || o.chords.length !== 1) return null;
      return (
        o.chords[0]!.root === task.chords[i]!.root &&
        o.chords[0]!.quality === task.chords[i]!.quality
      );
    }
    if (o.kind !== 'note' || o.pitches.length !== 1) return null;
    const note = Math.round(o.pitches[0]!);
    return task.exactOctave ? note === expected[i] : note % 12 === expected[i]! % 12;
  });
  if (matches.includes(null))
    return {
      outcome: 'unassessed' as const,
      reason:
        'The input does not support this kind of assessment. No position, fingering, or timing was verified.',
    };
  if (
    task.semitoneSteps &&
    task.semitoneSteps.some(
      (step, i) =>
        Math.round(responses[i + 1]!.pitches[0]!) - Math.round(responses[i]!.pitches[0]!) !== step,
    )
  )
    return {
      outcome: 'discrepancy' as const,
      reason:
        'The notes did not make the requested semitone movement. Try F to the E immediately below it.',
    };
  if (matches.every(Boolean) && responses.length === expectedCount)
    return {
      outcome: 'match' as const,
      reason:
        'The detected sound is consistent with the requested notes. This experimental result does not verify a fret, grip, or clean technique.',
    };
  return {
    outcome: 'discrepancy' as const,
    reason:
      responses.length > expectedCount
        ? 'Additional attacks were detected. Try the requested sequence again; the first response remains saved.'
        : `The detected sound differs at response ${matches.indexOf(false) + 1}. Isolate that change, then try again.`,
  };
}

function task(
  id: string,
  sourceRevision: string,
  prompt: string,
  pitches: number[],
  exactOctave = false,
): LiveAssessmentContract {
  return {
    version: LIVE_VERSION,
    id,
    stimulusId: `derived-live:${id}`,
    sourceRevision,
    prompt,
    kind: pitches.length === 1 ? 'note' : 'sequence',
    pitches,
    chords: [],
    exactOctave,
    positionVerified: false,
    timingGraded: false,
  };
}
export function liveTasks(
  sourceRevision: string,
  symbols: readonly string[],
  selectedMidi: number,
  homework?: HomeworkTask,
  phrase: readonly number[] = [],
): LiveAssessmentContract[] {
  const tasks = [
    task('live-note', sourceRevision, 'Play the selected note. Any octave is accepted.', [
      selectedMidi,
    ]),
    task(
      'live-connection',
      sourceRevision,
      'Play F, then E: the seventh of G7 connecting to the third of Cmaj7.',
      [65, 64],
    ),
  ];
  tasks.push(
    task(
      'live-exact',
      sourceRevision,
      'Play the selected pitch in the displayed octave.',
      [selectedMidi],
      true,
    ),
  );
  tasks[1]!.semitoneSteps = [-1];
  const chords = symbols.map(parseChordSymbol);
  if (
    chords.length &&
    chords.every((c) => c && ['major', 'minor', '7', 'maj7', 'm7'].includes(c.quality))
  )
    tasks.push({
      ...task(
        'live-progression',
        sourceRevision,
        `Strum ${symbols.join(' → ')}. Let each chord settle before the next change.`,
        [],
      ),
      kind: 'chords',
      chords: chords.map((c) => ({
        root: c!.rootPitchClass,
        quality: c!.quality as 'major' | 'minor' | '7' | 'maj7' | 'm7',
      })),
    });
  const chord = chords[0];
  if (chord)
    tasks.push(
      task(
        'live-arpeggio',
        sourceRevision,
        `Pick ${chord.symbol}'s chord tones separately, in the displayed order.`,
        chord.tones.map((t) => 60 + t.pitchClass),
      ),
    );
  if (homework) {
    const playing = homeworkLiveTask(homework, sourceRevision);
    if (playing) tasks.push(playing);
  }
  if (phrase.length && phrase.length <= 16)
    tasks.push(
      task(
        'live-phrase',
        sourceRevision,
        'Play your constructed phrase. Only its pitch sequence is assessed; rests, rhythm and expression are not graded.',
        [...phrase],
      ),
    );
  return tasks;
}
