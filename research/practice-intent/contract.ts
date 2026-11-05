import { z } from 'zod';
import { findNotePositions, generateTriadVoicings } from '../../src/engine/exploration.js';
import type { TriadAnalysis } from '../../src/engine/theory.js';

export const INTENT_VERSION = 'fretboard-intent-v2';
export const contextSchema = z
  .object({
    selectedMidi: z.number().int().min(0).max(127),
    chord: z
      .object({
        rootPitchClass: z.number().int().min(0).max(11),
        rootName: z.string().max(8),
        quality: z.enum(['major', 'minor']),
      })
      .strict()
      .nullable(),
    tuning: z.array(z.number().int().min(0).max(127)).length(6),
    capo: z.number().int().min(0).max(12),
    metadata: z.string().max(256).optional(),
  })
  .strict();
export type IntentContext = z.infer<typeof contextSchema>;
const responseShape = z
  .object({
    action: z.enum(['explore', 'clarify', 'unsupported']),
    kind: z.enum(['note', 'chord']).nullable(),
    match: z.enum(['pitch-class', 'exact']).nullable(),
    minFret: z.number().int().min(0).max(24).nullable(),
    maxFret: z.number().int().min(0).max(24).nullable(),
    strings: z.array(z.number().int().min(1).max(6)).min(1).max(6).nullable(),
    inversion: z.enum(['any', 'root', 'third', 'fifth']).nullable(),
    reason: z.enum(['none', 'ambiguous', 'unsupported']),
  })
  .strict();
export const intentSchema = responseShape.superRefine((value, ctx) => {
  if (value.action === 'explore') {
    if (
      value.kind === null ||
      value.match === null ||
      value.minFret === null ||
      value.maxFret === null ||
      value.inversion === null ||
      value.reason !== 'none'
    )
      ctx.addIssue({ code: 'custom', message: 'An exploration requires every search constraint' });
    if (value.minFret !== null && value.maxFret !== null && value.minFret > value.maxFret)
      ctx.addIssue({ code: 'custom', message: 'Reversed fret range' });
    if (value.strings && new Set(value.strings).size !== value.strings.length)
      ctx.addIssue({ code: 'custom', message: 'Repeated physical string' });
    if (
      value.kind === 'chord' &&
      (value.match !== 'pitch-class' || (value.strings !== null && value.strings.length !== 3))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Triad searches use pitch classes and exactly three selected strings',
      });
    if (value.kind === 'note' && value.inversion !== 'any')
      ctx.addIssue({ code: 'custom', message: 'A note has no chord inversion' });
  } else if (
    value.reason !== (value.action === 'clarify' ? 'ambiguous' : 'unsupported') ||
    [value.kind, value.match, value.minFret, value.maxFret, value.strings, value.inversion].some(
      (field) => field !== null,
    )
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'A non-exploration must contain no executable constraints',
    });
  }
});
export const toolParameters = z.toJSONSchema(responseShape);
export type Intent = z.infer<typeof intentSchema>;
export function abstain(action: 'clarify' | 'unsupported'): Intent {
  return {
    action,
    kind: null,
    match: null,
    minFret: null,
    maxFret: null,
    strings: null,
    inversion: null,
    reason: action === 'clarify' ? 'ambiguous' : 'unsupported',
  };
}
export function explore(overrides: Partial<Intent> = {}): Intent {
  return intentSchema.parse({
    action: 'explore',
    kind: 'note',
    match: 'pitch-class',
    minFret: 0,
    maxFret: 24,
    strings: null,
    inversion: 'any',
    reason: 'none',
    ...overrides,
  });
}
export interface IntentCase {
  id: string;
  pair: string;
  category: 'literal' | 'paraphrase' | 'boundary' | 'adversarial';
  request: string;
  context: IntentContext;
  expected: Intent;
}
export const caseSchema = z
  .object({
    id: z.string(),
    pair: z.string(),
    category: z.enum(['literal', 'paraphrase', 'boundary', 'adversarial']),
    request: z.string().max(512),
    context: contextSchema,
    expected: intentSchema,
  })
  .strict();

const sorted = (value: Intent) => ({
  ...value,
  strings: value.strings ? [...value.strings].sort((a, b) => a - b) : null,
});
export function sameIntent(a: Intent, b: Intent): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

/** The model chooses controls only. The application's engine generates musical positions. */
export function executeIntent(value: Intent, context: IntentContext) {
  const intent = intentSchema.parse(value);
  if (intent.action !== 'explore') return { applicable: false, resultCount: 0, engineValid: true };
  const options = { minFret: intent.minFret!, maxFret: intent.maxFret! };
  if (intent.kind === 'note') {
    const positions = findNotePositions(context.selectedMidi, context.tuning, context.capo, {
      ...options,
      match: intent.match!,
    }).filter((position) => intent.strings === null || intent.strings.includes(position.string));
    const engineValid = positions.every((position) => {
      const midi = context.tuning[position.string - 1]! + context.capo + position.fret;
      return (
        position.fret >= options.minFret &&
        position.fret <= options.maxFret &&
        (intent.match === 'exact'
          ? midi === context.selectedMidi
          : (midi - context.selectedMidi) % 12 === 0)
      );
    });
    return { applicable: true, resultCount: positions.length, engineValid };
  }
  if (!context.chord) return { applicable: true, resultCount: 0, engineValid: false };
  const triad: TriadAnalysis = { ...context.chord, roles: {}, bassRole: 'root', noteIds: [] };
  const voicings = generateTriadVoicings(triad, context.tuning, context.capo, {
    ...options,
    strings: intent.strings ?? undefined,
  }).filter((voicing) => intent.inversion === 'any' || voicing.bassRole === intent.inversion);
  const expected = [0, context.chord.quality === 'major' ? 4 : 3, 7]
    .map((interval) => (context.chord!.rootPitchClass + interval) % 12)
    .sort((a, b) => a - b)
    .join(',');
  const engineValid = voicings.every((voicing) => {
    const classes = [...new Set(voicing.notes.map((note) => ((note.midi % 12) + 12) % 12))]
      .sort((a, b) => a - b)
      .join(',');
    return (
      classes === expected &&
      voicing.notes.every(
        (note) =>
          note.position.fret >= options.minFret &&
          note.position.fret <= options.maxFret &&
          (intent.strings === null || intent.strings.includes(note.position.string)),
      )
    );
  });
  return { applicable: true, resultCount: voicings.length, engineValid };
}
export function scoreIntent(task: IntentCase, raw: unknown) {
  const parsed = intentSchema.safeParse(raw);
  const execution = parsed.success ? executeIntent(parsed.data, task.context) : null;
  return {
    schemaValid: parsed.success,
    decisionCorrect: parsed.success && parsed.data.action === task.expected.action,
    exactIntent: parsed.success && sameIntent(parsed.data, task.expected),
    engineValid: parsed.success && execution!.engineValid,
    usableExploration:
      parsed.success &&
      parsed.data.action === 'explore' &&
      execution!.engineValid &&
      execution!.resultCount > 0,
  };
}
