import type { VoicingNote } from '../src/engine/harmony.js';
import type { TeacherRequest, TeacherToolResult } from '../src/shared/teacher.js';

/** Keep musical facts and evidence intact; bound conversational prose separately. */
export function teacherContextView(context: TeacherRequest['context']) {
  const history = context.history.slice(-4).map((message) => ({
    ...message,
    text:
      message.text.length > 600
        ? `${message.text.slice(0, 600)} [message truncated]`
        : message.text,
  }));
  return {
    ...context,
    history,
    historyIsExcerpt:
      context.history.length > 4 || context.history.some((m) => m.text.length > 600),
  };
}

/** The trace retains complete engine output; the model gets the same musical values without repeated model metadata. */
export function teacherToolView(name: string, result: TeacherToolResult) {
  if (name !== 'explore_voicings' || result.status !== 'ok') return result;
  const data = result.data as
    | {
        status: string;
        candidates?: {
          id: string;
          cost: number;
          events: { chord: string; notes: VoicingNote[]; omittedDegrees: string[] }[];
        }[];
      }
    | undefined;
  return {
    ...result,
    data: data && {
      status: data.status,
      candidates: data.candidates?.map((c) => ({
        id: c.id,
        cost: c.cost,
        events: c.events.map((e) => ({
          chord: e.chord,
          omittedDegrees: e.omittedDegrees,
          notes: e.notes.map((n) => ({
            string: n.position.string,
            fret: n.position.fret,
            midi: n.midi,
            degree: n.degree,
            noteName: n.noteName,
          })),
        })),
      })),
    },
  };
}
