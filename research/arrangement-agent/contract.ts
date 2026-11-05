import {
  arrangementIntentSchema,
  executeArrangementIntent,
  validateArrangementResponse,
  type ArrangementResponse,
} from '../../src/shared/arrangements.js';
import type { ArrangementCase } from './cases.js';
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, v]) => [key, canonical(v)]),
        )
      : value;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
/** Reference constraints are authored independently of the parser and model. */
export function scoreArrangement(task: ArrangementCase, output: unknown) {
  let response: ArrangementResponse | undefined;
  try {
    response = validateArrangementResponse(output, task.request);
  } catch {
    /* Failure remains scored false. */
  }
  const parsed = arrangementIntentSchema.safeParse(response?.intent);
  const actual = parsed.success ? parsed.data : null;
  const expected = task.expected;
  // Clarification and rejection have no applied controls; irrelevant model defaults are not task errors.
  const interpretation =
    !!actual &&
    actual.action === expected.action &&
    actual.reason === expected.reason &&
    (expected.action !== 'propose' ||
      (actual.operation === expected.operation &&
        actual.targetQuality === expected.targetQuality &&
        actual.substituteSymbol === expected.substituteSymbol &&
        equal(actual.constraints, expected.constraints)));
  let validNotes = true,
    melodyPreserved = true,
    sourcePreserved = true,
    hasProposal = false;
  if (response?.candidateId) {
    const before = JSON.stringify(task.request);
    const execution = executeArrangementIntent(task.request, response.intent);
    const variation = execution.result?.variations.find((v) => v.id === response!.candidateId);
    sourcePreserved = JSON.stringify(task.request) === before;
    hasProposal = !!variation;
    validNotes = !!variation;
    for (const event of variation?.events ?? []) {
      const span = execution.spans.find((s) => s.id === event.spanId)!;
      const strings = new Set<number>();
      for (const note of event.voicing.notes) {
        const { string, fret } = note.position;
        if (
          strings.has(string) ||
          !response.intent.constraints.strings.includes(string) ||
          fret < response.intent.constraints.minFret ||
          fret > response.intent.constraints.maxFret ||
          note.midi !==
            task.request.context.tuning[string - 1]! + task.request.context.capo + fret ||
          !span.chord!.tones.some((t) => t.pitchClass === ((note.midi % 12) + 12) % 12)
        )
          validNotes = false;
        strings.add(string);
      }
      if (event.voicing.notes.length !== response.intent.constraints.voiceCount) validNotes = false;
      if (response.intent.constraints.preserveMelody) {
        const anchors = task.request.context.spans[Number(event.spanId.slice(1))]!.melody;
        const anchor = anchors.find(
          (a) => a.startTick <= event.startTick && a.endTick >= event.endTick,
        );
        if (!anchor || Math.max(...event.voicing.notes.map((n) => n.midi)) !== anchor.midi)
          melodyPreserved = false;
      }
    }
  }
  return {
    schemaValid: !!response,
    requestCorrect: interpretation,
    constraintSatisfaction:
      !!response && (expected.action !== 'propose' || (interpretation && validNotes)),
    validNotes: !!response && validNotes,
    sourcePreserved: !!response && sourcePreserved,
    melodyPreserved: !!response && melodyPreserved,
    clarificationCorrect:
      !!actual &&
      (expected.action === 'propose'
        ? actual.action === 'propose'
        : actual.action === expected.action),
    factualReferences: !!response,
    usableProposal:
      expected.action === 'propose' &&
      interpretation &&
      hasProposal &&
      validNotes &&
      melodyPreserved,
  };
}
