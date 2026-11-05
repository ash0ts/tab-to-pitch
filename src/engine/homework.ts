import { positionExposureKey } from './exposure.js';
import { parseChordSymbol } from './harmony.js';
import { parsePitchClass } from './theory.js';
import { formatPitch } from './exploration.js';
import {
  HOMEWORK_VERSION,
  homeworkResponseSchema,
  homeworkTaskSchema,
  type HomeworkTask,
  type HomeworkResponse,
  type HomeworkKind,
  type HomeworkSupport,
  type HomeworkObservation,
} from '../shared/homework.js';
import {
  cagedPlacements,
  locations,
  noteAt,
  pc,
  positionKey,
  regionFragments,
  validRegion,
  type CagedFamily,
  type NeckRegion,
} from './caged.js';
import type { FretPosition } from './types.js';

export function makeHomeworkTask(
  kind: HomeworkKind,
  symbol: string,
  family: CagedFamily,
  region: NeckRegion,
  tuning: readonly number[],
  capo: number,
  variant = 0,
  exact = false,
): HomeworkTask | null {
  if (kind === 'connection') symbol = 'G7';
  const chord = parseChordSymbol(symbol);
  if (!chord || !validRegion(region) || !Number.isInteger(variant) || variant < 0 || variant > 1000)
    return null;
  const third = chord.tones.find((t) => ['3', 'b3'].includes(t.degree));
  if (kind === 'target' && !third) return null;
  const target =
    kind === 'connection' ? 5 : kind === 'target' ? third!.pitchClass : chord.rootPitchClass;
  const positions =
    kind === 'name'
      ? Array.from({ length: region.maxFret - region.minFret + 1 }, (_, f) =>
          tuning.map((_, i) => ({ string: i + 1, fret: region.minFret + f })),
        )
          .flat()
          .filter((position) => noteAt(position, tuning, capo) !== null)
      : locations(target, tuning, capo, region);
  if (!positions.length) return null;
  const sourcePosition = positions[variant % positions.length]!;
  const pitch = exact
    ? noteAt(sourcePosition, tuning, capo)!
    : kind === 'name'
      ? pc(noteAt(sourcePosition, tuning, capo)!)
      : target;
  const placement = cagedPlacements(chord.rootName, tuning, capo).filter(
    (p) => p.family === family,
  );
  const fragment = regionFragments(placement, region).find(
    (p) => p.fragment.positions.length === 3,
  );
  if (['roots', 'complete', 'neighbor'].includes(kind) && !fragment) return null;
  const full =
    fragment?.placement.notes
      .filter((n) => n.position.fret >= region.minFret && n.position.fret <= region.maxFret)
      .map((n) => n.position) ?? [];
  const template = kind === 'roots' ? full : (fragment?.fragment.positions ?? []);
  if (
    kind === 'connection' &&
    !positions.some(
      (from) => locations(noteAt(from, tuning, capo)! - 1, tuning, capo, region, true).length,
    )
  )
    return null;
  const shown = kind === 'locate' ? positions[variant % positions.length]!.string : null;
  const prompt =
    kind === 'locate'
      ? `Find ${formatPitch(pitch, exact)} on string ${shown}. Choose any matching location in this region.`
      : kind === 'name'
        ? `Name the note at string ${sourcePosition.string}, fret ${sourcePosition.fret}${exact ? ', including its octave' : '. Octave is optional'}.`
        : kind === 'roots'
          ? `Select every root within this ${family}-family ${chord.rootName}-major map.`
          : kind === 'complete'
            ? `Complete the shown ${family}-family ${chord.rootName}-major fragment. Use strings ${template.map((p) => p.string).join(', ')}; select all three positions, including the given note.`
            : kind === 'neighbor'
              ? `Build the neighboring ${family}-family ${chord.rootName}-major fragment shown by its root landmark. Use strings ${template.map((p) => p.string).join(', ')}; select its three template positions.`
              : kind === 'connection'
                ? 'Select F in G7, then E in Cmaj7, exactly one semitone lower. Any valid pair of positions in this region is accepted.'
                : kind === 'target'
                  ? `Find the third of ${chord.symbol} as a destination for your next phrase. Choose any valid position.`
                  : `Construct ${chord.symbol}: three or four strings, every chord tone, at most four frets of span. Any valid voicing in this region is accepted.`;
  const id = `${HOMEWORK_VERSION}:${kind}:${symbol}:${family}:${region.minFret}-${region.maxFret}:${tuning.join('.')}:${capo}:${variant}:${exact}`;
  const exposureKeys = Array.from(
    { length: region.maxFret - region.minFret + 1 },
    (_, f) => f + region.minFret,
  ).flatMap((fret) =>
    tuning.map((_, i) => positionExposureKey(tuning, capo, { string: i + 1, fret })),
  );
  return {
    id,
    version: HOMEWORK_VERSION,
    kind,
    variant,
    symbol: kind === 'connection' ? 'G7' : symbol,
    family,
    region,
    tuning: [...tuning],
    capo,
    pitch,
    string: shown,
    template,
    sourcePosition,
    exact,
    prompt,
    exposureKeys,
  };
}
function sameSet(a: FretPosition[], b: FretPosition[]) {
  return a.length === b.length && a.every((p) => b.some((q) => positionKey(p) === positionKey(q)));
}
export function gradeHomework(
  task: HomeworkTask,
  raw: unknown,
): { correct: boolean; feedback: string; response: HomeworkResponse } {
  const response = homeworkResponseSchema.parse(raw),
    ps = response.positions;
  const fail = (feedback: string) => ({ correct: false, feedback, response });
  const win = (
    feedback = 'That meets the stated musical constraints. This checks your screen answer, not your playing.',
  ) => ({ correct: true, feedback, response });
  if (new Set(ps.map(positionKey)).size !== ps.length) return fail('Select each position once.');
  if (
    ps.some(
      (p) =>
        p.fret < task.region.minFret ||
        p.fret > task.region.maxFret ||
        noteAt(p, task.tuning, task.capo) === null,
    )
  )
    return fail('Use positions inside the displayed region and tuning.');
  const pitches = ps.map((p) => noteAt(p, task.tuning, task.capo)!);
  const chord = parseChordSymbol(task.symbol)!;
  if (task.kind === 'name') {
    const normalized = (response.text ?? '').trim().replaceAll('♯', '#').replaceAll('♭', 'b');
    if (task.exact) {
      // Pitch parsing, rather than stripping an octave digit, preserves B# and Cb boundaries.
      const match = /^([A-Ga-g](?:#{1,2}|b{1,2})?)(-?\d+)$/.exec(normalized);
      if (!match) return fail('Include the octave for this exact-pitch question.');
      const natural = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as Record<string, number>)[
        match[1]![0]!.toUpperCase()
      ]!;
      const alteration = [...match[1]!.slice(1)].reduce((sum, c) => sum + (c === '#' ? 1 : -1), 0);
      return (Number(match[2]) + 1) * 12 + natural + alteration ===
        noteAt(task.sourcePosition!, task.tuning, task.capo)
        ? win()
        : fail('That is a different sounding pitch. Check the note and octave separately.');
    }
    return parsePitchClass(normalized.replace(/-?\d+$/, '')) ===
      pc(noteAt(task.sourcePosition!, task.tuning, task.capo)!)
      ? win()
      : fail(
          'That note name does not match this position. Try an attention cue or compare a nearby landmark.',
        );
  }
  if (task.kind === 'locate')
    return ps.length === 1 &&
      ps[0]!.string === task.string &&
      (task.exact ? pitches[0] === task.pitch : pc(pitches[0]!) === pc(task.pitch))
      ? win()
      : fail('Check the requested string and note. You can revise without revealing the answer.');
  if (task.kind === 'target')
    return ps.length === 1 && pc(pitches[0]!) === task.pitch
      ? win()
      : fail(
          `Check the role as well as the note name. The task asks for the third of ${task.symbol}.`,
        );
  if (task.kind === 'roots') {
    const roots = task.template.filter(
      (p) => pc(noteAt(p, task.tuning, task.capo)!) === chord.rootPitchClass,
    );
    const wrong = ps.find((p) => !roots.some((r) => positionKey(r) === positionKey(p)));
    if (wrong) {
      const midi = noteAt(wrong, task.tuning, task.capo)!;
      const tone = chord.tones.find((t) => t.pitchClass === pc(midi));
      if (tone)
        return fail(
          `That location is ${tone.noteName}. In ${task.symbol} it is the ${tone.degree === '3' ? 'third' : tone.degree === '5' ? 'fifth' : tone.degree}, not the root.`,
        );
    }
    return sameSet(ps, roots)
      ? win()
      : fail('Select all the roots in the displayed map, and only those roots.');
  }
  if (task.kind === 'complete' || task.kind === 'neighbor')
    return sameSet(ps, task.template)
      ? win()
      : fail(
          'This question asks for the specific fragment. Compare its strings and root landmark. Use “Build any voicing” to explore alternatives.',
        );
  if (task.kind === 'connection')
    return ps.length === 2 &&
      pc(pitches[0]!) === 5 &&
      pc(pitches[1]!) === 4 &&
      pitches[1] === pitches[0]! - 1
      ? win(
          'F, the seventh of G7, moves down one semitone to E, the third of Cmaj7. Your pair satisfies both roles and the actual pitch movement.',
        )
      : fail(
          'Check both chord roles and direction. An E in a different octave may not be a descending semitone from your F.',
        );
  if (ps.length < 3 || ps.length > 4 || new Set(ps.map((p) => p.string)).size !== ps.length)
    return fail('Choose three or four notes, at most one on each string.');
  const frets = ps.map((p) => p.fret);
  if (Math.max(...frets) - Math.min(...frets) > 4)
    return fail('Keep the selected frets within a four-fret span.');
  if (pitches.some((p) => !chord.tones.some((t) => t.pitchClass === pc(p))))
    return fail(
      `One selected note is outside ${task.symbol}. Compare note identity with its role in this chord.`,
    );
  if (chord.tones.some((t) => !pitches.some((p) => pc(p) === t.pitchClass)))
    return fail('A required chord tone is missing. This task requests every chord tone.');
  return win();
}
export function solution(task: HomeworkTask): FretPosition[] {
  const chord = parseChordSymbol(task.symbol)!;
  if (task.kind === 'roots')
    return task.template.filter(
      (p) => pc(noteAt(p, task.tuning, task.capo)!) === chord.rootPitchClass,
    );
  if (['complete', 'neighbor'].includes(task.kind)) return task.template;
  if (task.kind === 'name') return [task.sourcePosition!];
  if (task.kind === 'locate' || task.kind === 'target')
    return locations(task.pitch, task.tuning, task.capo, task.region, task.exact).filter(
      (p) => task.string === null || p.string === task.string,
    );
  if (task.kind === 'connection') {
    for (const from of locations(5, task.tuning, task.capo, task.region)) {
      const to = locations(
        noteAt(from, task.tuning, task.capo)! - 1,
        task.tuning,
        task.capo,
        task.region,
        true,
      )[0];
      if (to) return [from, to];
    }
    return [];
  }
  // An example is not an exhaustive answer list; grading checks every legal construction.
  const choices = task.tuning.map((_, i) =>
    chord.tones.flatMap((t) =>
      locations(t.pitchClass, task.tuning, task.capo, task.region).filter(
        (p) => p.string === i + 1,
      ),
    ),
  );
  function search(index: number, selected: FretPosition[]): FretPosition[] | null {
    if (selected.length >= 3 && gradeHomework(task, { positions: selected }).correct)
      return selected;
    if (index >= choices.length || selected.length === 4) return null;
    for (const p of choices[index]!) {
      const r = search(index + 1, [...selected, p]);
      if (r) return r;
    }
    return search(index + 1, selected);
  }
  return search(0, []) ?? [];
}
export function homeworkHelp(task: HomeworkTask, kind: HomeworkSupport): string {
  if (kind === 'cue')
    return 'Find a familiar open or barre-chord landmark. E–F and B–C are one fret apart; the other natural-note neighbors are two frets apart. Then try recalling directly.';
  if (kind === 'landmark')
    return `The ${task.family} family names a shape, not the sounding chord. Its transposed root anchors still name ${parseChordSymbol(task.symbol)!.rootName}.`;
  if (kind === 'partial')
    return 'The highlighted note is one landmark. Complete the requested relationship around it; do not assume every nearby fret belongs to the chord.';
  if (kind === 'worked-example')
    return 'Separate example: an E-family shape shifted three frets in standard tuning without a capo gives G major. G is the root, B the third, and D the fifth. Crossing G to B changes the usual octave pattern by one fret.';
  const ps = solution(task);
  return ps.length
    ? `One valid answer: ${ps.map((p) => `${formatPitch(noteAt(p, task.tuning, task.capo)!, task.exact)} at string ${p.string}, fret ${p.fret}`).join('; ')}. Other positions are accepted when the question permits them.`
    : 'No valid example fits these constraints. Change the region before trying again.';
}
export function suggestedTasks(
  minutes: 5 | 15 | 30,
  history: HomeworkObservation[],
): HomeworkKind[] {
  const usual: HomeworkKind[] = [
    'locate',
    'name',
    'roots',
    'complete',
    'voicing',
    'neighbor',
    'connection',
    'target',
  ];
  const difficulties = history
    .filter((e) => e.kind === 'answer' && e.firstResponse && !e.correct)
    .map((e) => e.skill);
  const coverage = new Set(history.filter((e) => e.kind === 'answer').map((e) => e.skill));
  const ordered = [
    ...new Set([
      ...difficulties.slice(-2).reverse(),
      ...usual.filter((k) => !coverage.has(k)),
      ...usual,
    ]),
  ];
  return minutes === 5 ? ordered.slice(0, 3) : minutes === 15 ? ordered.slice(0, 6) : ordered;
}

export function validFrozenHomeworkTask(task: HomeworkTask): boolean {
  if (task.variant === null) return false;
  const regenerated = makeHomeworkTask(
    task.kind,
    task.symbol,
    task.family,
    task.region,
    task.tuning,
    task.capo,
    task.variant,
    task.exact,
  );
  return (
    !!regenerated &&
    JSON.stringify(homeworkTaskSchema.parse(regenerated)) ===
      JSON.stringify(homeworkTaskSchema.parse(task))
  );
}
