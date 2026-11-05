import { parseChordSymbol } from '../engine/harmony';
import { DEGREE_LABELS } from '../engine/harmony-exercises';
import type { TeacherAction, TeacherRequest } from '../shared/teacher';

export function asksAboutConnection(text: string) {
  return /resolv|connect|voice.?lead|next chord|F\s*(?:→|to|-)\s*E|\b(?:moves?|descends?)\s+to\b|two roles/i.test(
    text,
  );
}

/** Small offline explanations. Cloud teaching remains free-form; these are inspectable fallbacks. */
export function explainHomework(request: TeacherRequest) {
  const text = request.request;
  const spans = request.context.music.spans;
  const selected = request.context.music.selectedSpan;
  const current = parseChordSymbol(spans[selected]?.symbol ?? '');
  const actions: TeacherAction[] = [];
  // The engine's connection explanation validates both chord roles and directed movement.
  if (asksAboutConnection(text)) return null;
  if (/\bcaged\b|shape famil|neighbor.*shape/i.test(text)) {
    return {
      message: `CAGED names the C, A, G, E and D parent shapes, not five different harmonies. ${current ? `Here the sounding chord is ${current.symbol}: ${current.tones.map((t) => `${t.noteName} (${DEGREE_LABELS[t.degree]})`).join(', ')}. ` : ''}Find a root on the neck map, then pick a small fragment around it. Move to a neighboring family while keeping the same chord tones. The outline changes; the sounding harmony stays the same. Select a note on the map to hear it, then try the fragment on your guitar.`,
      actions,
      factRefs: current ? [`harmony:${selected}`] : [],
    };
  }
  const namedChord = /\b(?:of|in|over)\s+(?:an?\s+)?([A-G](?:#|b)?)(?:\s+(major|minor))?\b/.exec(
    text,
  );
  const chord = namedChord
    ? parseChordSymbol(`${namedChord[1]}${namedChord[2] === 'minor' ? 'm' : ''}`)
    : current;
  const note = /\b([A-G](?:#|b)?)\b/.exec(text)?.[1];
  const tone = chord?.tones.find((t) => t.noteName === note);
  if (tone && chord && /\bwhy\b|third|fifth|root|role|quality/i.test(text)) {
    const span = spans.findIndex(
      (s) => s.confirmed && parseChordSymbol(s.symbol ?? '')?.id === chord.id,
    );
    if (span >= 0) actions.push({ type: 'highlight', spanIndex: span, degree: tone.degree });
    const spelling = chord.tones
      .map((t) => `${t.noteName} (${DEGREE_LABELS[t.degree]})`)
      .join(', ');
    return {
      message: `${note} is the ${DEGREE_LABELS[tone.degree]} of ${chord.symbol}. That chord contains ${spelling}. The note name tells you which pitch; its role tells you how it relates to ${chord.rootName}, the chord’s root. ${tone.degree === '3' ? `A major third is four semitones above the root. ` : ''}Pick the root, then ${note}, and listen to the difference. ${span < 0 ? 'This is a separate example from the selected harmony.' : 'Use the highlighted locations to try it in this neck region.'}`,
      actions,
      factRefs: span >= 0 ? [`harmony:${span}`] : [],
    };
  }
  if (/compar|difference|root.*third/i.test(text) && current) {
    const third = current.tones.find((t) => t.degree === '3' || t.degree === 'b3');
    if (third) {
      actions.push(
        { type: 'highlight', spanIndex: selected, degree: '1' },
        { type: 'highlight', spanIndex: selected, degree: third.degree },
      );
      return {
        message: `Compare ${current.rootName}, the root of ${current.symbol}, with ${third.noteName}, its ${DEGREE_LABELS[third.degree]}. Pick the root first and let it settle; then pick ${third.noteName}. That interval helps establish the chord’s ${third.degree === '3' ? 'major' : 'minor'} quality. Choose each highlight below, then select a note to hear it. Finish by playing both inside the chord.`,
        actions,
        factRefs: [`harmony:${selected}`],
      };
    }
  }
  return null;
}
