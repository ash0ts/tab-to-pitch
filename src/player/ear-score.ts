import * as alphaTab from '@coderline/alphatab';
import { generateVoicings, parseChordSymbol } from '../engine/harmony';
import type { EarStudy } from '../ear/model';
/** A new accompaniment with learner-defined timing, never imported performer fingering. */
export function earScore(study: EarStudy) {
  if (
    study.symbols.length < 2 ||
    study.symbols.length > 8 ||
    !Number.isFinite(study.secondsPerChord) ||
    study.secondsPerChord <= 0
  )
    throw new Error('Invalid audio study');
  const bars = study.symbols.map((symbol) => {
    const chord = parseChordSymbol(symbol);
    if (!chord) throw new Error('Unsupported chord');
    const shape = generateVoicings(chord, [64, 59, 55, 50, 45, 40], 0, {
      minFret: 0,
      maxFret: 12,
      maxSpan: 4,
      voiceCount: 4,
      maxCandidates: 1,
    }).voicings[0];
    if (!shape) throw new Error('No valid four-voice shape. Change the proposal explicitly.');
    return (
      '(' + shape.notes.map((n) => n.position.fret + '.' + n.position.string).join(' ') + ').1'
    );
  });
  const tex =
    '\\title "Ear study: derived accompaniment"\n\\artist "Learner proposal; not a recording transcription"\n\\tempo 60\n\\instrument 25\n\\tuning E4 B3 G3 D3 A2 E2\n. \\ts 4 4 ' +
    bars.join(' | ');
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(tex);
  const tempo = score.masterBars[0]?.tempoAutomations[0];
  if (tempo) tempo.value = 240 / study.secondsPerChord;
  return score;
}
