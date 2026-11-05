import { importer, model, midi, Settings } from '@coderline/alphatab';
import { isQuizEligible } from './theory';
import type { NoteEvent, ScoreDocument, ScoreTrack } from './types';

/** Structural IDs survive reimport; alphaTab's process-global numeric IDs do not. */
export function sourceNoteId(note: model.Note): string {
  const beat = note.beat;
  const bar = beat.voice.bar;
  return `t${bar.staff.track.index}:s${bar.staff.index}:m${bar.index}:v${beat.voice.index}:b${beat.index}:n${note.index}`;
}

export function sourceBeatId(beat: model.Beat): string {
  const bar = beat.voice.bar;
  return `t${bar.staff.track.index}:s${bar.staff.index}:m${bar.index}:v${beat.voice.index}:b${beat.index}`;
}

export async function hashSource(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function parseScoreBytes(bytes: Uint8Array): model.Score {
  return importer.ScoreLoader.loadScoreFromBytes(bytes);
}

/** Use explicit accidental instructions or an unambiguous diatonic key spelling.
 * A chromatic pitch with no spelling evidence stays unknown for interval drills. */
export function sourceSpelling(note: model.Note): Pick<NoteEvent, 'spelling' | 'spellingSource'> {
  if (
    note.isDead ||
    note.isPercussion ||
    !Number.isInteger(note.realValue) ||
    note.beat.voice.bar.staff.transpositionPitch !== 0
  )
    return { spelling: null };
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const natural = [0, 2, 4, 5, 7, 9, 11];
  const forced = new Map([
    [model.NoteAccidentalMode.ForceSharp, 1],
    [model.NoteAccidentalMode.ForceFlat, -1],
    [model.NoteAccidentalMode.ForceDoubleSharp, 2],
    [model.NoteAccidentalMode.ForceDoubleFlat, -2],
    [model.NoteAccidentalMode.ForceNatural, 0],
  ]);
  const explicit = forced.get(note.accidentalMode);
  const fifths = note.beat.voice.bar.keySignature;
  const order =
    fifths >= 0 ? ['F', 'C', 'G', 'D', 'A', 'E', 'B'] : ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  for (let i = 0; i < letters.length; i++) {
    const accidental =
      explicit ?? (order.slice(0, Math.abs(fifths)).includes(letters[i]!) ? Math.sign(fifths) : 0);
    const octave = (note.realValue - natural[i]! - accidental) / 12 - 1;
    if (!Number.isInteger(octave)) continue;
    return {
      spelling: `${letters[i]}${accidental > 0 ? '#'.repeat(accidental) : 'b'.repeat(-accidental)}${octave}`,
      spellingSource: explicit === undefined ? 'key-context' : 'explicit',
    };
  }
  return { spelling: null };
}

/** Uses alphaTab's own repeat/ending/tempo interpretation, not a second transport. */
function playbackMap(
  score: model.Score,
): Pick<ScoreDocument, 'playbackOccurrences' | 'tempoEvents'> {
  const generator = new midi.MidiFileGenerator(
    score,
    new Settings(),
    new midi.AlphaSynthMidiFileHandler(new midi.MidiFile()),
  );
  generator.generate();
  const counts = new Map<number, number>();
  const playbackOccurrences: NonNullable<ScoreDocument['playbackOccurrences']> = [];
  const tempoEvents: NonNullable<ScoreDocument['tempoEvents']> = [];
  for (const bar of generator.tickLookup.masterBars) {
    const measureIndex = bar.masterBar.index;
    const occurrence = counts.get(measureIndex) ?? 0;
    counts.set(measureIndex, occurrence + 1);
    playbackOccurrences.push({ measureIndex, occurrence, startTick: bar.start, endTick: bar.end });
    for (const event of bar.tempoChanges)
      tempoEvents.push({ tick: event.tick, bpm: event.tempo, measureIndex });
  }
  return { playbackOccurrences, tempoEvents };
}

export function adaptScore(score: model.Score, hash: string): ScoreDocument {
  const warnings = new Set<string>();
  const tracks: ScoreTrack[] = score.tracks.map((track) => {
    const firstStaff = track.staves[0];
    const tuningMidi = firstStaff ? [...firstStaff.tuning] : [];
    const capo = firstStaff?.capo ?? 0;
    const id = `t${track.index}`;
    const notes: NoteEvent[] = [];
    const chordSymbols: { startTick: number; symbol: string }[] = [];
    let compatible = true;
    let harmonySupported = true;
    for (const staff of track.staves) {
      // A shared fretboard cannot describe two differently tuned staves.
      const sameTuning =
        JSON.stringify(staff.tuning) === JSON.stringify(tuningMidi) && staff.capo === capo;
      if (!sameTuning || staff.transpositionPitch !== 0) compatible = false;
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            const symbol = beat.chordId ? staff.getChord(beat.chordId)?.name : null;
            if (symbol) chordSymbols.push({ startTick: beat.absolutePlaybackStart, symbol });
            for (const note of beat.notes) {
              if (note.isLetRing || note.isPalmMute || note.durationPercent !== 1)
                harmonySupported = false;
              const soundingMidi = note.isDead || note.isPercussion ? null : note.realValue;
              const position =
                note.isStringed && note.string > 0
                  ? { string: staff.tuning.length - note.string + 1, fret: note.fret }
                  : null;
              const unsupported: string[] = [];
              if (beat.graceType !== model.GraceType.None) unsupported.push('grace note');
              if (beat.hasWhammyBar) unsupported.push('whammy bar');
              if (note.isTrill) unsupported.push('trill');
              if (note.ornament !== model.NoteOrnament.None) unsupported.push('ornament');
              if (staff.transpositionPitch !== 0) unsupported.push('staff transposition');
              if (!sameTuning) unsupported.push('different staff tuning');
              const item: NoteEvent = {
                id: sourceNoteId(note),
                trackId: id,
                staffIndex: staff.index,
                voiceIndex: voice.index,
                measureIndex: bar.index,
                beatId: sourceBeatId(beat),
                onsetTicks: beat.absolutePlaybackStart,
                durationTicks: beat.playbackDuration * (note.isStaccato ? 0.5 : 1),
                soundingMidi,
                ...sourceSpelling(note),
                position,
                effects: {
                  dead: note.isDead,
                  ghost: note.isGhost,
                  staccato: note.isStaccato,
                  palmMute: note.isPalmMute,
                  letRing: note.isLetRing,
                  durationPercent: note.durationPercent,
                  harmonic: note.isHarmonic
                    ? model.HarmonicType[note.harmonicType].toLowerCase()
                    : undefined,
                  tieDestination: note.isTieDestination,
                  tieOriginId: note.tieOrigin ? sourceNoteId(note.tieOrigin) : undefined,
                  bend: note.hasBend
                    ? note.bendPoints?.map((point) => ({
                        offset: point.offset / 60,
                        semitones: point.value / 2,
                      }))
                    : undefined,
                  slide:
                    note.slideInType !== model.SlideInType.None ||
                    note.slideOutType !== model.SlideOutType.None,
                  unsupported: unsupported.length ? unsupported : undefined,
                },
                eligible: Boolean(
                  position &&
                    Number.isInteger(soundingMidi) &&
                    soundingMidi !== null &&
                    !track.isPercussion,
                ),
              };
              item.eligible = isQuizEligible(item);
              notes.push(item);
            }
          }
        }
      }
    }
    const byId = new Map(notes.map((note) => [note.id, note]));
    // Resolve source tie links across measures/voices. Continuations remain in
    // the document, but only the original attack owns the sustained duration.
    for (const sourceStaff of track.staves)
      for (const bar of sourceStaff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats)
            for (const source of beat.notes) {
              if (
                source.isTieDestination ||
                !source.tieDestination ||
                source.isStaccato ||
                source.isPalmMute
              )
                continue;
              const attack = byId.get(sourceNoteId(source));
              if (!attack) continue;
              const seen = new Set<model.Note>([source]);
              let destination: model.Note | null = source.tieDestination;
              while (destination && !seen.has(destination)) {
                seen.add(destination);
                const continuation = byId.get(sourceNoteId(destination));
                if (!continuation) break;
                const movingPitch =
                  continuation.soundingMidi !== attack.soundingMidi ||
                  continuation.effects.bend?.length ||
                  continuation.effects.slide ||
                  (continuation.effects.harmonic && continuation.effects.harmonic !== 'none') ||
                  continuation.effects.unsupported?.length;
                if (movingPitch) {
                  attack.effects.unsupported = [
                    ...new Set([
                      ...(attack.effects.unsupported ?? []),
                      'articulated tie continuation',
                    ]),
                  ];
                  attack.eligible = false;
                }
                attack.durationTicks = Math.max(
                  attack.durationTicks,
                  continuation.onsetTicks + continuation.durationTicks - attack.onsetTicks,
                );
                if (destination.isStaccato || destination.isPalmMute) break;
                destination = destination.tieDestination;
              }
            }
    if (!compatible)
      warnings.add(
        `${track.name}: playback is preserved; differing staff tunings or transposition limit fretboard drills.`,
      );
    if (!tuningMidi.length || track.isPercussion)
      warnings.add(
        `${track.name}: this part plays back, but has no supported fretted-note drills.`,
      );
    if (!harmonySupported)
      warnings.add(
        `${track.name}: let-ring, palm-mute, or custom note durations play natively; chord analysis is unavailable for this part.`,
      );
    notes.sort(
      (a, b) =>
        a.onsetTicks - b.onsetTicks || a.staffIndex - b.staffIndex || a.voiceIndex - b.voiceIndex,
    );
    return {
      id,
      index: track.index,
      name: track.name || `Track ${track.index + 1}`,
      tuningMidi,
      capo,
      notes,
      chordSymbols,
      isPercussion: track.isPercussion,
      supported: compatible && tuningMidi.length > 0 && !track.isPercussion,
      harmonySupported,
    };
  });
  let tempoBpm = score.tempo;
  const measures = score.masterBars.map((bar) => {
    const firstTempo = bar.tempoAutomations.find((automation) => automation.ratioPosition === 0);
    if (firstTempo) tempoBpm = firstTempo.value;
    const result = {
      index: bar.index,
      startTicks: bar.start,
      durationTicks: bar.calculateDuration(),
      tempoBpm,
      meter: [bar.timeSignatureNumerator, bar.timeSignatureDenominator] as [number, number],
    };
    for (const automation of bar.tempoAutomations) tempoBpm = automation.value;
    return result;
  });
  return {
    id: hash,
    hash,
    title: score.title || 'Imported study',
    artist: score.artist || undefined,
    tracks,
    measures,
    warnings: [...warnings],
    ...playbackMap(score),
  };
}
