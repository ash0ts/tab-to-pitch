import type { StudyCase } from './cases.js';

/** Independent arithmetic checker: no application music, grading or chord utilities. */
const naturals: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pc = (n: number) => ((n % 12) + 12) % 12;
function namePc(name: string) {
  if (!/^[A-G][#b]{0,2}$/.test(name)) return null;
  return pc(naturals[name[0]!]! + [...name.slice(1)].reduce((n, a) => n + (a === '#' ? 1 : -1), 0));
}
export function validPositions(task: StudyCase) {
  const out: { string: number; fret: number; midi: number }[] = [];
  const { music, constraints } = task.request.context;
  for (const string of constraints.strings)
    for (let fret = constraints.minFret; fret <= constraints.maxFret; fret++) {
      const midi = music.tuning[string - 1]! + music.capo + fret;
      if (pc(midi) === task.passage.tone.pc) out.push({ string, fret, midi });
    }
  return out;
}
export function checkVariation(
  task: StudyCase,
  variation: any,
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const events = variation?.events;
  const { music, constraints: c } = task.request.context;
  if (!Array.isArray(events) || events.length !== task.passage.spans.length)
    return { valid: false, reasons: ['missing-or-wrong-event-count'] };
  events.forEach((event: any, i: number) => {
    const span = task.passage.spans[i]!;
    const requested = music.spans[i]!;
    if (event.startTick !== requested.startTick || event.endTick !== requested.endTick)
      reasons.push(`timing:${i}`);
    if (event.voicing?.chord?.symbol !== span.symbol) reasons.push(`harmony:${i}`);
    const notes = event.voicing?.notes;
    if (!Array.isArray(notes) || notes.length !== c.voiceCount) {
      reasons.push(`voice-count:${i}`);
      return;
    }
    const strings = new Set<number>(),
      pcs = new Set<number>(),
      frets: number[] = [];
    for (const note of notes) {
      const { string, fret } = note.position ?? {};
      if (
        !Number.isInteger(string) ||
        !Number.isInteger(fret) ||
        !c.strings.includes(string) ||
        fret < c.minFret ||
        fret > c.maxFret ||
        strings.has(string)
      )
        reasons.push(`position:${i}`);
      strings.add(string);
      frets.push(fret);
      if (note.midi !== music.tuning[string - 1]! + music.capo + fret) reasons.push(`pitch:${i}`);
      pcs.add(pc(note.midi));
      if (!span.tones.some((t) => t.pc === pc(note.midi))) reasons.push(`foreign-tone:${i}`);
      if (!span.tones.some((t) => t.degree === note.degree && t.pc === pc(note.midi)))
        reasons.push(`degree:${i}`);
    }
    if (Math.max(...frets) - Math.min(...frets) > c.maxSpan) reasons.push(`span:${i}`);
    for (const tone of span.tones)
      if (!(c.omitFifth && tone.degree === '5') && !pcs.has(tone.pc))
        reasons.push(`required-tone:${i}:${tone.degree}`);
  });
  return { valid: !reasons.length, reasons };
}

export function score(task: StudyCase, row: any) {
  const output = row.output;
  const actions = output?.actions ?? [];
  const resolved = row.resolved ?? [];
  const noQuiz = !actions.some((a: any) => a.type === 'question');
  const required = validPositions(task);
  const role = actions.some((a: any, i: number) => {
    if (
      a.type !== 'highlight' ||
      a.spanIndex !== task.passage.selected ||
      a.degree !== task.passage.tone.degree
    )
      return false;
    const positions = resolved[i]?.positions;
    return (
      Array.isArray(positions) &&
      positions.length === required.length &&
      new Set(positions.map((p: any) => `${p.string}:${p.fret}`)).size === positions.length &&
      positions.every((m: any) => required.some((p) => p.string === m.string && p.fret === m.fret))
    );
  });
  const moves = actions
    .map((a: any, i: number) =>
      a.type === 'preview' ? checkVariation(task, resolved[i]?.variation) : null,
    )
    .filter(Boolean);
  const move = moves.some((m: any) => m.valid);
  const actionValid = actions.every(
    (a: any, i: number) =>
      resolved[i] && (a.type !== 'preview' || checkVariation(task, resolved[i].variation).valid),
  );
  const claimErrors: string[] = [];
  for (const claim of output?.claims ?? []) {
    if (
      claim.kind === 'tone-role' &&
      !task.passage.spans[claim.spanIndex]?.tones.some(
        (t) => t.degree === claim.degree && t.pc === namePc(claim.noteName),
      )
    )
      claimErrors.push('tone-role');
    if (
      claim.kind === 'position-pitch' &&
      claim.midi !==
        task.request.context.music.tuning[claim.position.string - 1]! +
          task.request.context.music.capo +
          claim.position.fret
    )
      claimErrors.push('position-pitch');
    if (claim.kind === 'observation') claimErrors.push('invented-evidence');
  }
  const delivered =
    row.sourceUnchanged === true &&
    noQuiz &&
    actionValid &&
    !claimErrors.length &&
    (task.kind === 'role' ? role : move);
  return {
    requestedActionDelivered: delivered,
    actorDelivered: output?.source === 'forge' && delivered,
    hostedReply: output?.source === 'forge',
    fallback: output?.source === 'local' && row.arm !== 'local',
    noUnrequestedQuiz: noQuiz,
    actionsValid: actionValid,
    structuredClaimsValid: !claimErrors.length,
    structuredClaimsPresent: !!output?.claims?.length,
    claimErrors,
    variationChecks: moves,
    selectedToolCount: row.tools?.length ?? 0,
    immutableRequest: row.sourceUnchanged === true,
  };
}
