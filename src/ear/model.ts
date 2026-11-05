import { z } from 'zod';
import {
  audioAssetSchema,
  type AudioNote,
  type AudioReview,
  type EarContext,
} from '../shared/audio';
import { parsePitch } from '../engine/theory';
import { parseChordSymbol } from '../engine/harmony';
export const earStateSchema = z
  .object({
    asset: audioAssetSchema,
    revision: z.string().uuid(),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    noteProposal: z.string().max(8).optional(),
    proposal: z.array(z.string().max(24)).min(2).max(8),
    jobId: z.string().uuid().nullable(),
    draftVisible: z.boolean(),
    assisted: z.boolean(),
    activeQuestion: z.boolean(),
    completed: z.boolean(),
    replayCount: z.number().int().nonnegative(),
  })
  .strict();
export type EarState = z.infer<typeof earStateSchema>;
export interface EarStudy {
  id: string;
  symbols: string[];
  secondsPerChord: number;
  seed: EarState;
}
export const EAR_REFERENCE = {
  version: 'authored-g7-cmaj7-v1',
  assetId: 'b6fe2790593bc95df7f87cbf86eca75a12ea557972bbde03cca63d3cdccb7ddb',
  start: 0,
  end: 8,
} as const;
export function hasEarReference(state: EarState) {
  return (
    state.asset.origin === 'authored' &&
    state.asset.id === EAR_REFERENCE.assetId &&
    state.start === 0 &&
    state.end === 8 &&
    state.proposal.length === 2
  );
}
export function reviewedNotes(notes: AudioNote[], reviews: AudioReview[]): AudioNote[] {
  const result = new Map(notes.map((n) => [n.id, { ...n }]));
  for (const review of reviews)
    for (const d of review.decisions) {
      if (d.decision === 'reject') {
        result.delete(d.noteId);
        continue;
      }
      const original = notes.find((n) => n.id === d.noteId);
      if (original)
        result.set(d.noteId, {
          ...original,
          midi: d.decision === 'replace' ? d.midi! : original.midi,
          authority: 'learner-confirmed',
          confidence: null,
        });
    }
  return [...result.values()];
}
export function gradeEarProposal(state: EarState) {
  if (!hasEarReference(state)) return null;
  const expected = ['G7', 'Cmaj7'].map((s) => parseChordSymbol(s)!);
  const actual = state.proposal.map((s) => parseChordSymbol(s));
  return expected.map((e, i) => ({
    root: actual[i]?.rootPitchClass === e.rootPitchClass,
    quality: actual[i]?.quality === e.quality,
    feedback:
      actual[i]?.rootPitchClass !== e.rootPitchClass
        ? 'Listen for the bass movement at this change.'
        : actual[i]?.quality !== e.quality
          ? 'The root matches. Compare the chord quality, including the seventh.'
          : 'The root and quality match the authored example.',
  }));
}
export function earContext(
  state: EarState,
  notes: AudioNote[],
  status: EarContext['analysis'],
): EarContext {
  return {
    revision: state.revision,
    duration: state.end - state.start,
    analysis: status,
    analysisRef: state.jobId,
    origin: state.asset.origin,
    draftVisible: state.draftVisible,
    activeQuestion: state.activeQuestion,
    assisted: state.assisted,
    hypotheses: notes.slice(0, 24).map((n, i) => ({
      id: 'h' + i,
      midi: n.midi,
      start: n.start,
      end: n.end,
      authority: n.authority,
      confidence: n.confidence,
      independentFamilies: n.families?.length ?? 1,
    })),
    noteProposal: parsePitch(state.noteProposal ?? ''),
    proposal: state.proposal.map((s) => (parseChordSymbol(s) ? s : '')),
    referenceAvailable: hasEarReference(state),
  };
}
export function earMasked(state: EarState | null) {
  return !!state?.activeQuestion && !state.assisted;
}
