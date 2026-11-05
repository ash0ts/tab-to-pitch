import { abstain, explore, type Intent, type IntentContext } from './contract.js';

/** Deliberately small local grammar; unknown or conflicting constraints ask for clarification. */
export function parseIntent(request: string, context: IntentContext): Intent {
  const text = request.toLowerCase().replaceAll('–', '-').replaceAll('—', '-');
  if (
    /\b(record|microphone|listen to me|transcribe|diagnose|pain|(?:seventh|7th) chord|delete|execute|shell|ignore (?:the |all )?(?:rules|instructions))\b/.test(
      text,
    )
  )
    return abstain('unsupported');
  const chord = /\b(chord|triad|voicing|inversion)\b/.test(text);
  if (chord && !context.chord) return abstain('unsupported');
  const exact = /\b(exact|same octave|same sounding pitch|same register)\b/.test(text);
  const anyOctave =
    /\b(any octave|every octave|all octaves|octave doesn't matter|octaves? apart)\b/.test(text);
  if (exact && anyOctave) return abstain('clarify');
  if (!chord && !/\b(note|pitch|b|c|d|e|f|g|a)\b/.test(text)) return abstain('clarify');
  if (/\b(higher up|further up|lower down|nearby|easy|easier|comfortable|another key)\b/.test(text))
    return abstain('clarify');
  const range = text.match(/\bfrets?\s*(\d+)\s*(?:-|to|through|and)\s*(\d+)\b/);
  const minFret = range ? Number(range[1]) : 0;
  const maxFret = range ? Number(range[2]) : 24;
  if (minFret > maxFret || maxFret > 24) return abstain('clarify');
  let strings: number[] | null = null;
  if (/\b(top|highest|thinnest) (?:three|3) strings\b/.test(text)) strings = [1, 2, 3];
  if (/\b(bottom|lowest|thickest) (?:three|3) strings\b/.test(text)) strings = [4, 5, 6];
  const numbered = text.match(/strings?\s+([1-6](?:\s*(?:,|and|&)\s*[1-6])*)/);
  if (numbered) strings = [...new Set(numbered[1]!.match(/[1-6]/g)!.map(Number))];
  if (chord && strings && strings.length !== 3) return abstain('clarify');
  if (!range && /\bfrets?\b/.test(text)) return abstain('clarify');
  const inversion = /\b(first inversion|third (?:in the bass|lowest|on the bottom))\b/.test(text)
    ? 'third'
    : /\b(second inversion|fifth (?:in the bass|lowest|on the bottom))\b/.test(text)
      ? 'fifth'
      : /\b(root position|root (?:in the bass|lowest|on the bottom))\b/.test(text)
        ? 'root'
        : 'any';
  if (!chord && inversion !== 'any') return abstain('clarify');
  if (chord && exact) return abstain('unsupported');
  return explore({
    kind: chord ? 'chord' : 'note',
    match: exact ? 'exact' : 'pitch-class',
    minFret,
    maxFret,
    strings,
    inversion,
  });
}
