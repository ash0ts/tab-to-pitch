import { midiToSpn } from '../engine/theory';
import { parseChordSymbol } from '../engine/harmony';
import type { EarContext, EarAction } from '../shared/audio';
import type { TeacherFact } from '../shared/teacher';
export function earFacts(context: EarContext | undefined): TeacherFact[] {
  if (!context) return [];
  return [
    {
      id: 'ear:boundary',
      kind: 'boundary',
      text: 'The ear workspace is a separate recording. Existing score harmony is a derived example, not evidence of what this recording contains. Model hypotheses and learner proposals cannot grade hearing.',
    },
    {
      id: 'ear:state',
      kind: 'observation',
      text:
        'Analysis ' +
        context.analysis +
        '; opaque job ' +
        (context.analysisRef ?? 'none') +
        '; source ' +
        context.origin +
        '; question ' +
        (context.activeQuestion ? 'active' : 'inactive') +
        '; assistance ' +
        context.assisted +
        '.',
    },
    ...(context.noteProposal == null
      ? []
      : [
          {
            id: 'ear:note-proposal',
            kind: 'observation' as const,
            text: `The learner proposed ${midiToSpn(context.noteProposal)} for comparison. This is not a reference fact about the recording or proof they played it.`,
          },
        ]),
    ...context.hypotheses.map((n) => ({
      id: 'ear:' + n.id,
      kind: 'boundary' as const,
      text:
        n.authority +
        ' at ' +
        n.start.toFixed(2) +
        '–' +
        n.end.toFixed(2) +
        ' seconds: MIDI ' +
        n.midi +
        '. Confidence ' +
        (n.confidence ?? 'unknown') +
        '. Independent families ' +
        n.independentFamilies +
        '. This does not establish a grading key.',
    })),
  ];
}
export function earActionAllowed(context: EarContext | undefined, action: EarAction) {
  if (!context) return false;
  if (context.activeQuestion && !context.assisted && action.operation !== 'replay') return false;
  if (action.operation === 'correct')
    return (
      context.analysis === 'completed' &&
      action.midi !== undefined &&
      context.hypotheses.some((n) => n.id === action.noteId)
    );
  if (action.operation === 'compare-note') return context.noteProposal != null;
  if (action.operation === 'draft') return context.analysis === 'completed';
  if (action.operation === 'question')
    return context.origin === 'authored' && context.referenceAvailable;
  if (action.operation === 'analyze') return !['queued', 'running'].includes(context.analysis);
  if (action.operation === 'workspace' || action.operation === 'compare')
    return context.proposal.length >= 2 && context.proposal.every((s) => !!parseChordSymbol(s));
  return true;
}
