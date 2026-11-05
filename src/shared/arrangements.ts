import { z } from 'zod';
import {
  defineChord,
  generateProgressionVariations,
  harmonicFunction,
  parseChordSymbol,
  type ChordQuality,
  type HarmonicContext,
  type HarmonySpan,
  type ProgressionResult,
} from '../engine/harmony.js';

export const ARRANGEMENT_VERSION = 'arrangement-v1';
export const ARRANGEMENT_PROMPT_VERSION = 'arrangement-tools-v1';
export const ARRANGEMENT_JSON_PROMPT_VERSION = 'arrangement-tools-v2-json';
export const chordQualities = [
  'major',
  'minor',
  'diminished',
  'augmented',
  'sus2',
  'sus4',
  'power',
  'maj7',
  'm7',
  '7',
  'm7b5',
  'dim7',
  'mMaj7',
  '6',
  'm6',
  'add9',
  'madd9',
  '6/9',
  'maj9',
  'm9',
  '9',
  'm11',
  'maj13',
  '13',
] as const;
const degreeSchema = z.enum([
  '1',
  'b3',
  '3',
  '2',
  '4',
  'b5',
  '5',
  '#5',
  '6',
  'bb7',
  'b7',
  '7',
  '9',
  '11',
  '13',
]);
const pitchName = z.string().regex(/^[A-G](?:#|b){0,2}$/);
const symbol = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[A-G][A-Za-z0-9#b+/()°ø△ -]*$/);
export const arrangementConstraintsSchema = z
  .object({
    minFret: z.number().int().min(0).max(24),
    maxFret: z.number().int().min(0).max(24),
    strings: z.array(z.number().int().min(1).max(6)).min(2).max(6),
    voiceCount: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    maxSpan: z.number().int().min(0).max(4),
    allowOpenStrings: z.boolean(),
    omitFifth: z.boolean(),
    rootless: z.boolean(),
    bass: z.union([z.literal('any'), z.literal('preserve'), degreeSchema]),
    preserveMelody: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.minFret > value.maxFret)
      ctx.addIssue({ code: 'custom', message: 'Fret range is reversed' });
    if (new Set(value.strings).size !== value.strings.length)
      ctx.addIssue({ code: 'custom', message: 'Strings must be unique' });
    if (value.voiceCount > value.strings.length)
      ctx.addIssue({ code: 'custom', message: 'Voice count exceeds available strings' });
  });
export type ArrangementConstraints = z.infer<typeof arrangementConstraintsSchema>;
export const DEFAULT_ARRANGEMENT_CONSTRAINTS: ArrangementConstraints = {
  minFret: 0,
  maxFret: 12,
  strings: [1, 2, 3, 4, 5, 6],
  voiceCount: 4,
  maxSpan: 4,
  allowOpenStrings: true,
  omitFifth: false,
  rootless: false,
  bass: 'any',
  preserveMelody: false,
};
export const arrangementContextSchema = z
  .object({
    tuning: z.array(z.number().int().min(20).max(100)).length(6),
    capo: z.number().int().min(0).max(12),
    key: z
      .object({
        tonic: pitchName,
        mode: z.enum([
          'ionian',
          'dorian',
          'phrygian',
          'lydian',
          'mixolydian',
          'aeolian',
          'locrian',
        ]),
      })
      .strict()
      .nullable(),
    selectedSpan: z.number().int().min(0).max(7),
    spans: z
      .array(
        z
          .object({
            symbol: symbol.nullable(),
            confirmed: z.boolean(),
            startTick: z.number().int().min(0).max(100_000_000),
            endTick: z.number().int().min(1).max(100_000_000),
            melody: z
              .array(
                z
                  .object({
                    startTick: z.number().int().min(0),
                    endTick: z.number().int().positive(),
                    midi: z.number().int().min(20).max(108),
                  })
                  .strict(),
              )
              .max(32),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
  .superRefine((context, ctx) => {
    if (context.selectedSpan >= context.spans.length)
      ctx.addIssue({ code: 'custom', message: 'Selected span is missing' });
    context.spans.forEach((span, index) => {
      if (
        span.startTick >= span.endTick ||
        (index && context.spans[index - 1]!.endTick > span.startTick)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Spans must have positive non-overlapping durations',
        });
      if (span.symbol && !parseChordSymbol(span.symbol))
        ctx.addIssue({ code: 'custom', message: 'Unsupported chord symbol' });
      span.melody.forEach((note, n) => {
        if (
          note.startTick < span.startTick ||
          note.endTick > span.endTick ||
          note.startTick >= note.endTick ||
          (n && span.melody[n - 1]!.endTick > note.startTick)
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Melody must be monophonic and inside its span',
          });
      });
    });
  });
export const arrangementRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    contextVersion: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_.:-]+$/),
    request: z.string().trim().min(1).max(600),
    context: arrangementContextSchema,
    constraints: arrangementConstraintsSchema,
  })
  .strict();
export type ArrangementRequest = z.infer<typeof arrangementRequestSchema>;
export const arrangementIntentSchema = z
  .object({
    action: z.enum(['propose', 'clarify', 'reject']),
    reason: z.enum([
      'requested',
      'ambiguous',
      'unsupported',
      'unconfirmed-harmony',
      'no-melody',
      'incompatible',
    ]),
    operation: z.enum(['move', 'color', 'substitute']),
    constraints: arrangementConstraintsSchema,
    targetQuality: z.enum(chordQualities).nullable(),
    substituteSymbol: symbol.nullable(),
  })
  .strict();
export type ArrangementIntent = z.infer<typeof arrangementIntentSchema>;
export interface ArrangementFact {
  id: string;
  text: string;
}
export interface ArrangementExecution {
  status: 'ok' | 'incomplete' | 'no-match' | 'invalid' | 'clarify' | 'reject';
  result: ProgressionResult | null;
  facts: ArrangementFact[];
  spans: HarmonySpan[];
}
const colorFamilies: ChordQuality[][] = [
  ['major', 'maj7', '6', 'add9', '6/9', 'maj9', 'maj13'],
  ['minor', 'm7', 'm6', 'madd9', 'm9', 'm11', 'mMaj7'],
  ['7', '9', '13'],
];
export function normalizedArrangementSpans(request: ArrangementRequest): HarmonySpan[] {
  return request.context.spans.map((span, i) => ({
    id: `s${i}`,
    startTick: span.startTick,
    endTick: span.endTick,
    sourceNoteIds: [],
    chord: span.symbol ? parseChordSymbol(span.symbol) : null,
    confirmation: span.confirmed ? 'confirmed' : 'suggested',
    source: 'manual',
    melodyAnchors: span.melody.map((note, n) => ({ ...note, noteId: `m${i}-${n}` })),
  }));
}
/** The model controls only validated constraints; pitches and explanations come from the engine. */
export function executeArrangementIntent(
  request: ArrangementRequest,
  raw: unknown,
): ArrangementExecution {
  const intent = arrangementIntentSchema.parse(raw);
  const spans = normalizedArrangementSpans(request);
  const empty = (status: ArrangementExecution['status'], text: string): ArrangementExecution => ({
    status,
    result: null,
    spans,
    facts: [{ id: 'boundary', text }],
  });
  if (intent.action !== 'propose')
    return empty(
      intent.action,
      intent.action === 'clarify'
        ? 'Choose explicit harmony and controls before generating a variation.'
        : 'This request is outside the supported arrangement controls.',
    );
  if (spans.some((span) => span.confirmation !== 'confirmed' || !span.chord))
    return empty('clarify', 'Confirm the chord symbols before changing this passage.');
  if (intent.constraints.preserveMelody && spans.some((span) => !span.melodyAnchors?.length))
    return empty(
      'clarify',
      'Select a monophonic melody for every span before preserving its top voice.',
    );
  const selected = spans[request.context.selectedSpan]!;
  const source = selected.chord!;
  if (intent.operation === 'color') {
    if (
      !intent.targetQuality ||
      intent.substituteSymbol ||
      !colorFamilies.some(
        (family) => family.includes(source.quality) && family.includes(intent.targetQuality!),
      )
    )
      return empty('invalid', 'The selected extension is not supported for this chord family.');
    selected.chord = defineChord(source.rootName, intent.targetQuality, source.bassName);
    if (
      source.bassPitchClass !== undefined &&
      !selected.chord?.tones.some((tone) => tone.pitchClass === source.bassPitchClass)
    )
      return empty(
        'clarify',
        'The requested color removes the named bass tone. Choose the bass context explicitly before changing this chord.',
      );
  } else if (intent.operation === 'substitute') {
    const target = intent.substituteSymbol ? parseChordSymbol(intent.substituteSymbol) : null;
    const key = request.context.key as HarmonicContext | null;
    if (!target || intent.targetQuality || !key || key.mode !== 'ionian')
      return empty('clarify', 'Choose a confirmed major key and a supported substitute chord.');
    const before = harmonicFunction(source, key),
      after = harmonicFunction(target, key);
    if (
      !['tonic-area', 'predominant', 'dominant'].includes(before) ||
      before !== after ||
      source.id === target.id
    )
      return empty(
        'invalid',
        'This substitute is outside the supported major-key function family.',
      );
    selected.chord = target;
  } else if (intent.targetQuality || intent.substituteSymbol)
    return empty('invalid', 'Moving a voicing preserves its chord definitions.');
  const result = generateProgressionVariations(
    spans,
    request.context.tuning,
    request.context.capo,
    { ...intent.constraints, maxCandidates: 64, maxPaths: 3 },
  );
  const facts: ArrangementFact[] = [
    {
      id: 'operation',
      text:
        intent.operation === 'move'
          ? 'The confirmed chord progression is preserved.'
          : `Chord ${request.context.selectedSpan + 1} changes from ${source.symbol} to ${selected.chord!.symbol}.`,
    },
    {
      id: 'region',
      text: `Use frets ${intent.constraints.minFret}–${intent.constraints.maxFret} with ${intent.constraints.voiceCount} voices.`,
    },
    {
      id: 'timing',
      text: 'The variation uses the selected chord timing. The imported score is preserved.',
    },
    ...(intent.constraints.preserveMelody
      ? [
          {
            id: 'melody',
            text: 'The selected melody remains the top voice with its original pitch and rhythm.',
          },
        ]
      : []),
    ...result.variations.map((v, i) => ({
      id: `path${i}`,
      text: `Variation ${i + 1} has ${v.events.length} events and ${v.commonTones} retained common tones; movement cost ${v.cost.toFixed(2)} is a geometric heuristic.`,
    })),
  ];
  return { status: result.status, result, spans, facts };
}
const responseSchema = z
  .object({
    source: z.enum(['local', 'forge']),
    status: z.enum(['proposal', 'clarify', 'no-match', 'rejected']),
    contextVersion: z.string().min(1).max(128),
    intent: arrangementIntentSchema,
    candidateId: z.string().max(512).nullable(),
    evidenceRefs: z.array(z.string().max(64)).max(8),
    explanation: z.string().max(1800),
    versions: z
      .object({
        policy: z.literal(ARRANGEMENT_VERSION),
        prompt: z.string().max(128),
        model: z.string().max(128),
      })
      .strict(),
    fallbackReason: z
      .enum([
        'disabled',
        'session-required',
        'budget',
        'duplicate',
        'unavailable',
        'invalid-response',
      ])
      .optional(),
    traceId: z.string().uuid().optional(),
  })
  .strict();
export type ArrangementResponse = z.infer<typeof responseSchema>;
export function arrangementResponse(
  request: ArrangementRequest,
  intent: ArrangementIntent,
  candidateId: string | null,
  source: ArrangementResponse['source'] = 'local',
  model = 'deterministic-arrangement-v1',
  evidenceRefs?: string[],
  promptVersion:
    | typeof ARRANGEMENT_PROMPT_VERSION
    | typeof ARRANGEMENT_JSON_PROMPT_VERSION = ARRANGEMENT_PROMPT_VERSION,
): ArrangementResponse {
  const execution = executeArrangementIntent(request, intent);
  const candidate = execution.result?.variations.find((v) => v.id === candidateId);
  if (candidateId && !candidate) throw new Error('Ineligible variation');
  const status = candidate
    ? 'proposal'
    : execution.status === 'clarify'
      ? 'clarify'
      : execution.status === 'reject' || execution.status === 'invalid'
        ? 'rejected'
        : 'no-match';
  const refs = evidenceRefs ?? execution.facts.slice(0, 3).map((f) => f.id);
  if (refs.some((id) => !execution.facts.some((f) => f.id === id)))
    throw new Error('Invented evidence reference');
  return {
    source,
    status,
    contextVersion: request.contextVersion,
    intent,
    candidateId: candidate?.id ?? null,
    evidenceRefs: refs,
    explanation: refs.map((id) => execution.facts.find((f) => f.id === id)!.text).join(' '),
    versions: {
      policy: ARRANGEMENT_VERSION,
      prompt: source === 'forge' ? promptVersion : 'none',
      model,
    },
  };
}
export function validateArrangementResponse(
  value: unknown,
  request: ArrangementRequest,
): ArrangementResponse {
  const response = responseSchema.parse(value);
  if (response.contextVersion !== request.contextVersion)
    throw new Error('Stale arrangement context');
  const expected = arrangementResponse(
    request,
    response.intent,
    response.candidateId,
    response.source,
    response.versions.model,
    response.evidenceRefs,
    response.versions.prompt === ARRANGEMENT_JSON_PROMPT_VERSION
      ? ARRANGEMENT_JSON_PROMPT_VERSION
      : ARRANGEMENT_PROMPT_VERSION,
  );
  if (
    response.status !== expected.status ||
    response.explanation !== expected.explanation ||
    response.versions.prompt !== expected.versions.prompt ||
    (response.source === 'forge' && response.fallbackReason)
  )
    throw new Error('Arrangement response does not match verified facts');
  return response;
}

/** Small explicit-command baseline. Unknown requests ask for controls instead of guessing. */
export function parseArrangementRequest(request: ArrangementRequest): ArrangementIntent {
  const text = request.request.toLowerCase();
  const intent: ArrangementIntent = {
    action: 'propose',
    reason: 'requested',
    operation: 'move',
    constraints: structuredClone(request.constraints),
    targetQuality: null,
    substituteSymbol: null,
  };
  const boundary = (action: 'clarify' | 'reject', reason: ArrangementIntent['reason']) => ({
    ...intent,
    action,
    reason,
  });
  if (
    /ignore|system prompt|developer message|reveal.*key|execute|upload|delete|mastery|guarantee/.test(
      text,
    )
  )
    return boundary('reject', 'unsupported');
  if (request.context.spans.some((span) => !span.confirmed || !span.symbol))
    return boundary('clarify', 'unconfirmed-harmony');
  if (
    /comfortable|better|jazzy|sophisticated|easier|nicer/.test(text) &&
    !/(?:fret|voice|rootless|seventh|ninth)/.test(text)
  )
    return boundary('clarify', 'ambiguous');
  let recognized = false;
  const range = text.match(/frets?\s+(\d+)\s*(?:-|to|through|and|–)\s*(\d+)/);
  if (range) {
    intent.constraints.minFret = Number(range[1]);
    intent.constraints.maxFret = Number(range[2]);
    recognized = true;
  }
  const voices = text.match(/\b([2-6])\s*(?:voices|notes|strings)\b/);
  if (voices) {
    intent.constraints.voiceCount = Number(voices[1]) as ArrangementConstraints['voiceCount'];
    recognized = true;
  }
  if (/keep.*melody|preserve.*melody/.test(text)) {
    intent.constraints.preserveMelody = true;
    recognized = true;
    if (request.context.spans.some((span) => !span.melody.length))
      return boundary('clarify', 'no-melody');
  }
  if (/rootless/.test(text)) {
    intent.constraints.rootless = true;
    recognized = true;
  }
  if (/omit.*fifth|without.*fifth/.test(text)) {
    intent.constraints.omitFifth = true;
    recognized = true;
  }
  if (/preserve.*bass|keep.*bass/.test(text)) {
    intent.constraints.bass = 'preserve';
    recognized = true;
  }
  const bass = text.match(
    /(?:bass|lowest)\s*(?:degree)?\s*(1|b3|3|2|4|b5|5|#5|6|bb7|b7|7|9|11|13)\b/,
  );
  if (bass) {
    intent.constraints.bass = bass[1] as ArrangementConstraints['bass'];
    recognized = true;
  }
  const stringMatch = text.match(/strings\s+([1-6](?:\s*,\s*[1-6])+)/);
  if (stringMatch) {
    intent.constraints.strings = stringMatch[1]!.split(',').map(Number);
    recognized = true;
  }
  if (/no open|avoid open/.test(text)) {
    intent.constraints.allowOpenStrings = false;
    recognized = true;
  }
  const quality = text.match(
    /(?:color|quality|change to|add)\s+(major|minor|maj13|mmaj7|m7b5|dim7|maj9|maj7|madd9|add9|m11|m9|m7|m6|6\/9|13|9|7|6)\b/,
  );
  if (quality) {
    intent.operation = 'color';
    intent.targetQuality = (quality[1] === 'mmaj7' ? 'mMaj7' : quality[1]) as ChordQuality;
    recognized = true;
  }
  const substitute = request.request.match(/substitute\s+([A-G][#b]?(?:maj7|m7|m|7|dim|°)?)/i);
  if (substitute) {
    intent.operation = 'substitute';
    intent.substituteSymbol = substitute[1]!;
    recognized = true;
  }
  if (/same harmony|move.*voicing|revoice|keep.*chord/.test(text)) recognized = true;
  if (!recognized) return boundary('clarify', 'ambiguous');
  if (!arrangementConstraintsSchema.safeParse(intent.constraints).success)
    return {
      ...boundary('reject', 'incompatible'),
      constraints: structuredClone(request.constraints),
    };
  return intent;
}
export function localArrangement(
  request: ArrangementRequest,
  fallbackReason: ArrangementResponse['fallbackReason'] = 'disabled',
): ArrangementResponse {
  const intent = parseArrangementRequest(request),
    execution = executeArrangementIntent(request, intent);
  return {
    ...arrangementResponse(request, intent, execution.result?.variations[0]?.id ?? null),
    fallbackReason,
  };
}
