import {
  cagedPlacements,
  regionFragments,
  locations,
  noteAt,
  type NeckRegion,
} from '../engine/caged';
import { generateVoicings, parseChordSymbol } from '../engine/harmony';
import type { HomeworkTask } from '../shared/homework';
import { PLAYING_VERSION, playingStepSchema, type PlayingStep } from '../shared/homework-playing';
import { LIVE_VERSION, type LiveAssessmentContract } from '../shared/live-guitar';

export function playingPlan(
  context: string,
  tuning: readonly number[],
  capo: number,
  region: NeckRegion,
  harmony: readonly { symbol: string; ticks: number; startTick?: number }[],
  minutes: 5 | 15 | 30,
): PlayingStep[] {
  const steps: PlayingStep[] = [];
  function add(value: Omit<PlayingStep, 'id' | 'stimulusId' | 'sourceRevision' | 'supportPolicy'>) {
    const signature = JSON.stringify(value);
    const fingerprint = Array.from(signature).reduce((h,c) => Math.imul(h ^ c.charCodeAt(0),16777619) >>> 0,2166136261).toString(36);
    const id = `${PLAYING_VERSION}:${context}:${fingerprint}`;
    steps.push(
      playingStepSchema.parse({
        ...value,
        id,
        stimulusId: `derived:${id}`,
        sourceRevision: context,
        supportPolicy: 'help-before-exposure-v1',
      }),
    );
  }
  const base = {
    region,
    family: null,
    fragment: [],
    progression: [],
    ordered: false,
    exact: false,
    responseMethods: ['self-report', 'live'],
  } as const;
  for (const [name, pitch] of (minutes === 5
    ? [['C', 60]]
    : [
        ['C', 60],
        ['F', 65],
        ['G', 67],
      ]) as [string, number][]) {
    if (locations(pitch, tuning, capo, region).length)
      add({
        ...base,
        fragment: [],
        progression: [],
        responseMethods: ['self-report', 'live'],
        objective: 'note',
        title: `Find ${name}`,
        instruction: `Play ${name} in this region and say its name. Then find another location. Commit one sounding ${name}; location knowledge has a separate check.`,
        pitches: [pitch],
      });
  }
  const root = parseChordSymbol(harmony[0]?.symbol ?? 'C')?.rootName ?? 'C';
  const fragments = regionFragments(cagedPlacements(root, tuning, capo), region).filter(
    (f) => f.fragment.positions.length === 3,
  );
  const families = [...new Set(fragments.map((f) => f.placement.family))];
  for (const [i, family] of families.slice(0, 2).entries()) {
    const f = fragments.find((f) => f.placement.family === family)!;
    add({
      ...base,
      progression: [],
      responseMethods: ['self-report', 'live'],
      objective: i ? 'neighbor' : 'fragment',
      family,
      title: `${root} major · ${family}-family fragment`,
      instruction:
        'Pick these three notes individually, in any order. Say root, third and fifth, then try without the labels. The family names the landmark, not the sounding chord.',
      fragment: f.fragment.positions,
      pitches: f.fragment.positions.map((p) => noteAt(p, tuning, capo)!),
    });
  }
  const alternate = region.minFret < 5 ? { minFret: 5, maxFret: 9 } : { minFret: 0, maxFret: 5 };
  for (const r of [region, alternate]) {
    const progression = harmony.slice(0, 8).flatMap((h) => {
      const chord = parseChordSymbol(h.symbol);
      if (!chord) return [];
      const result = generateVoicings(chord, tuning, capo, {
        ...r,
        voiceCount: chord.tones.length > 3 ? 4 : 3,
        maxSpan: 4,
        maxCandidates: 1,
        omitFifth: true,
      });
      const v = result.voicings[0];
      return v ? [{ ...h, positions: v.notes.map((n) => n.position) }] : [];
    });
    if (progression.length && progression.length === harmony.length)
      add({
        ...base,
        fragment: [],
        region: r,
        objective: 'progression',
        title: `Play ${progression.map((h) => h.symbol).join('–')} · frets ${r.minFret}–${r.maxFret}`,
        instruction:
          'Play along, then isolate one change. Use the proposed small voicings or another valid voicing. A detected chord does not verify its position.',
        pitches: [],
        progression,
        ordered: true,
        responseMethods: progression.every((h) =>
          ['major', 'minor', '7', 'maj7', 'm7'].includes(parseChordSymbol(h.symbol)!.quality),
        )
          ? ['self-report', 'live']
          : ['self-report'],
      });
  }
  // This is a separately identified authored comparison, never inferred from the imported passage.
  add({
    ...base,
    fragment: [],
    progression: [],
    responseMethods: ['self-report', 'live'],
    objective: 'connection',
    title: 'Authored connection · G7 → Cmaj7',
    instruction:
      'Compare G with G7. Pick F, then the E one semitone below it: seventh to third. Find the connection elsewhere afterward.',
    pitches: [65, 64],
    ordered: true,
  });
  if (minutes > 5)
    add({
      ...base,
      fragment: [],
      progression: [],
      responseMethods: ['self-report'],
      objective: 'phrase',
      title: 'Make a short response',
      instruction:
        'Over the authored G7 → Cmaj7 example, make a short phrase with a rest and end on E. Choose your own rhythm and notes. Reflect on the result; artistic quality is not graded.',
      pitches: [64],
    });
  return steps;
}

export function stepLiveTask(
  step: PlayingStep,
  revision = step.sourceRevision,
): LiveAssessmentContract | null {
  if (!step.responseMethods.includes('live')) return null;
  return {
    version: LIVE_VERSION,
    id: step.id,
    stimulusId: step.stimulusId,
    sourceRevision: revision,
    prompt: step.instruction,
    kind:
      step.objective === 'progression' ? 'chords' : step.pitches.length === 1 ? 'note' : 'sequence',
    pitches: step.pitches,
    chords: step.progression.map((h) => {
      const c = parseChordSymbol(h.symbol)!;
      return {
        root: c.rootPitchClass,
        quality: c.quality as 'major' | 'minor' | '7' | 'maj7' | 'm7',
      };
    }),
    exactOctave: step.exact,
    order: step.ordered ? 'ordered' : 'any',
    ...(step.objective === 'connection' ? { semitoneSteps: [-1] } : {}),
    timingGraded: false,
    positionVerified: false,
  };
}

/** Location alternatives are an answer set, not a sequence to perform. */
export function homeworkLiveTask(
  homework: HomeworkTask,
  sourceRevision: string,
): LiveAssessmentContract | null {
  if (homework.variant === null) return null;
  const base: LiveAssessmentContract = {
    version: LIVE_VERSION,
    id: 'live-homework',
    sourceRevision,
    stimulusId: `derived-live:${homework.id}`,
    prompt: 'Play the target note once. Its position is not verified by audio.',
    kind: 'note',
    pitches: [homework.pitch],
    chords: [],
    exactOctave: homework.exact,
    positionVerified: false,
    timingGraded: false,
  };
  if (['locate', 'name', 'roots', 'target'].includes(homework.kind)) return base;
  if (homework.kind === 'connection')
    return {
      ...base,
      prompt: 'Play F, then E one semitone below it.',
      kind: 'sequence',
      pitches: [65, 64],
      semitoneSteps: [-1],
    };
  if (!homework.template.length) return null;
  return {
    ...base,
    prompt:
      'Pick the selected fragment once, in any order. Audio does not verify the chosen positions.',
    kind: 'sequence',
    pitches: homework.template.map((p) => noteAt(p, homework.tuning, homework.capo)!),
    order: 'any',
  };
}
