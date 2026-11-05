import { importer, model, Settings } from '@coderline/alphatab';
import { noteAt, locations } from '../engine/caged';
import { midiToSpn } from '../engine/theory';
import type { HomeworkPlayback } from '../shared/homework-playing';
import { parseChordSymbol, type ProgressionVariation } from '../engine/harmony';
import { timedBeat } from './variation';

/** A labeled derived exercise. The imported source is never mutated. */
export function buildHomeworkStudy(options: HomeworkPlayback): model.Score {
  const { step, tuning, capo, tempo, example, responseMeasures, restMeasures } = options;
  if (
    tuning.length !== 6 ||
    tempo < 40 ||
    tempo > 240 ||
    !Number.isFinite(tempo) ||
    ![1, 2, 4].includes(responseMeasures) ||
    !Number.isInteger(restMeasures) ||
    restMeasures < 0 ||
    restMeasures > 4
  )
    throw new Error('This playing study needs six strings and bounded tempo and rest settings.');
  const pattern: {
    pitches: number[];
    ticks: number;
    positions?: { string: number; fret: number }[];
  }[] = [];
  if (step.progression.length) {
    for (const chord of step.progression) {
      const pitches = chord.positions.map((p) => noteAt(p, tuning, capo));
      if (pitches.some((n) => n === null))
        throw new Error('The proposed fragment does not fit this instrument.');
      pattern.push({
        pitches: pitches as number[],
        ticks: chord.ticks,
        positions: chord.positions,
      });
    }
  } else if (example) {
    for (const [index, pitch] of step.pitches.entries())
      pattern.push({
        pitches: [pitch],
        ticks: 960,
        ...(step.fragment[index] ? { positions: [step.fragment[index]!] } : {}),
      });
  } else {
    // An explicitly authored accompaniment; its label distinguishes it from the imported source.
    for (const pitches of step.objective === 'connection' || step.objective === 'phrase'
      ? [
          [43, 47, 50, 53],
          [48, 52, 55, 59],
        ]
      : [[]])
      pattern.push({ pitches, ticks: 3840 });
  }
  const patternTicks = pattern.reduce((n, e) => n + e.ticks, 0);
  if (!patternTicks) throw new Error('The study has no musical events.');
  const repeats = Math.max(1, Math.ceil((responseMeasures * 3840) / patternTicks));
  const events = Array.from({ length: repeats }, () => pattern).flat();
  const responseTicks = patternTicks * repeats;
  const padded = Math.ceil(responseTicks / 3840) * 3840;
  if (padded > responseTicks) events.push({ pitches: [], ticks: padded - responseTicks });
  if (restMeasures) events.push({ pitches: [], ticks: restMeasures * 3840 });
  const barCount = padded / 3840 + restMeasures;
  if (barCount > 80) throw new Error('Choose a shorter homework passage.');
  const tex = `\\title "Derived guitar homework"\n\\tempo ${tempo}\n\\track "Homework example" \\instrument 25 \\tuning ${tuning.map((n) => midiToSpn(n)).join(' ')} \\capo ${capo}\n. ${Array(barCount).fill('r.1').join(' | ')}`;
  const score = importer.ScoreLoader.loadAlphaTex(tex);
  let cursor = 0;
  const timed = events.map((event) => {
    const start = cursor;
    cursor += event.ticks;
    return { ...event, start, end: cursor };
  });
  const staff = score.tracks[0]!.staves[0]!;
  for (const bar of staff.bars) {
    const start = bar.index * 3840,
      end = start + 3840;
    const boundaries = [
      ...new Set([
        start,
        end,
        ...timed.flatMap((e) => [e.start, e.end]).filter((t) => t > start && t < end),
      ]),
    ].sort((a, b) => a - b);
    const voice = new model.Voice();
    for (let i = 0; i < boundaries.length - 1; i++) {
      const at = boundaries[i]!,
        until = boundaries[i + 1]!;
      const event = timed.find((e) => e.start <= at && e.end >= until)!;
      const beat = timedBeat(until - at);
      const used = new Set<number>();
      for (const [pitchIndex, pitch] of event.pitches.entries()) {
        const candidates = locations(pitch, tuning, capo, { minFret: 0, maxFret: 24 }, true);
        const p = event.positions?.[pitchIndex] ?? candidates.find((p) => !used.has(p.string));
        if (!p) throw new Error('This audition cannot realize all notes on distinct strings.');
        used.add(p.string);
        const note = new model.Note();
        note.string = 7 - p.string;
        note.fret = p.fret;
        note.isTieDestination = at > event.start;
        beat.addNote(note);
      }
      voice.addBeat(beat);
    }
    bar.voices = [];
    bar.addVoice(voice);
  }
  return model.JsonConverter.jsObjectToScore(
    model.JsonConverter.scoreToJsObject(score),
    new Settings(),
  );
}

/** Revoice the selected accompaniment through the existing variation builder. */
export function homeworkVariation(study: HomeworkPlayback): ProgressionVariation | null {
  if (
    study.example ||
    !study.step.progression.length ||
    study.step.progression.some((c) => c.startTick === undefined)
  )
    return null;
  const events = study.step.progression.map((span, index) => {
    const chord = parseChordSymbol(span.symbol);
    if (!chord) throw new Error('The homework chord is unavailable.');
    const notes = span.positions.map((position) => {
      const midi = noteAt(position, study.tuning, study.capo);
      const tone = chord.tones.find((t) => midi !== null && t.pitchClass === midi % 12);
      if (midi === null || !tone)
        throw new Error('The homework voicing contains an unsupported note.');
      return { position, midi, noteName: tone.noteName, label: tone.noteName, degree: tone.degree };
    });
    const presentDegrees = [...new Set(notes.map((n) => n.degree))];
    const omittedDegrees = chord.tones
      .filter((t) => !presentDegrees.includes(t.degree))
      .map((t) => t.degree);
    const bass = [...notes].sort((a, b) => a.midi - b.midi)[0]!;
    const frets = notes.map((n) => n.position.fret),
      minFret = Math.min(...frets),
      maxFret = Math.max(...frets);
    return {
      spanId: `${study.step.id}:${index}`,
      startTick: span.startTick!,
      endTick: span.startTick! + span.ticks,
      voicing: {
        id: `${study.step.id}:${index}`,
        chord,
        notes,
        presentDegrees,
        omittedDegrees,
        bassDegree: bass.degree,
        bassMidi: bass.midi,
        topMidi: Math.max(...notes.map((n) => n.midi)),
        bassLabel: bass.noteName,
        inversion: `${bass.degree} in bass`,
        minFret,
        maxFret,
        span: maxFret - minFret,
        localCost: 0,
      },
    };
  });
  return {
    id: study.step.id,
    version: 'homework-playing-v1',
    events,
    cost: 0,
    totalMotion: 0,
    commonTones: 0,
    maxFretJump: 0,
    omittedDegrees: [...new Set(events.flatMap((e) => e.voicing.omittedDegrees))],
  };
}
