import { model, Settings } from '@coderline/alphatab';
import type { ProgressionVariation, VariationEvent } from '../engine/harmony';

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Exact tick duration. Ordinary values engrave normally; other ratios retain their tuplet timing. */
export function timedBeat(ticks: number): model.Beat {
  if (!Number.isInteger(ticks) || ticks <= 0)
    throw new Error('The variation has an invalid duration.');
  const beat = new model.Beat();
  for (const duration of [1, 2, 4, 8, 16, 32, 64, 128, 256]) {
    for (const dots of [0, 1, 2]) {
      if ((3840 / duration) * (2 - 1 / 2 ** dots) === ticks) {
        beat.duration = duration;
        beat.dots = dots;
        return beat;
      }
    }
  }
  const divisor = gcd(960, ticks);
  beat.duration = model.Duration.Quarter;
  beat.tupletNumerator = 960 / divisor;
  beat.tupletDenominator = ticks / divisor;
  return beat;
}

/** A block-chord study on a cloned score. Master bars and all backing tracks remain intact. */
export function buildVariationScore(
  source: model.Score,
  trackIndex: number,
  variation: ProgressionVariation,
): model.Score {
  const original = source.tracks[trackIndex];
  if (
    !original ||
    original.staves.length !== 1 ||
    original.staves[0]!.tuning.length !== 6 ||
    original.staves[0]!.isPercussion
  )
    throw new Error('Progression playback needs a single-staff six-string guitar track.');
  const events = [...variation.events].sort((a, b) => a.startTick - b.startTick);
  if (
    !events.length ||
    events.some(
      (event, index) =>
        !Number.isInteger(event.startTick) ||
        !Number.isInteger(event.endTick) ||
        event.startTick < 0 ||
        event.endTick <= event.startTick ||
        (index > 0 && event.startTick < events[index - 1]!.endTick),
    )
  )
    throw new Error('The variation has overlapping or invalid events.');
  const score = model.JsonConverter.jsObjectToScore(model.JsonConverter.scoreToJsObject(source));
  const staff = score.tracks[trackIndex]!.staves[0]!;
  if (staff.transpositionPitch !== 0)
    throw new Error('This track transposition cannot be revoiced yet.');
  const first = events[0]!.startTick,
    last = events.at(-1)!.endTick;
  const originalStaff = original.staves[0]!;
  const finalBar = source.masterBars.at(-1);
  if (
    !finalBar ||
    first < source.masterBars[0]!.start ||
    last > finalBar.start + finalBar.calculateDuration()
  )
    throw new Error('The variation extends beyond the source score.');
  for (const event of events) {
    const strings = event.voicing.notes.map((note) => note.position.string);
    if (strings.length < 2 || strings.length > 6 || new Set(strings).size !== strings.length)
      throw new Error('A chord variation needs 2–6 notes on distinct physical strings.');
  }
  for (const bar of staff.bars) {
    const start = bar.masterBar.start,
      end = start + bar.masterBar.calculateDuration();
    if (end <= first || start >= last) continue;
    // A selected passage is whole bars; retaining a partial imported beat would change its effects.
    if (start < first || end > last) throw new Error('Choose whole bars for variation playback.');
    const voice = new model.Voice();
    const relevant = events.filter((event) => event.startTick < end && event.endTick > start);
    const automationBeats = originalStaff.bars[bar.index]!.voices.flatMap(
      (sourceVoice) => sourceVoice.beats,
    ).filter((beat) => beat.automations.length > 0);
    const boundaries = [
      ...new Set([
        start,
        end,
        ...automationBeats
          .map((beat) => beat.absolutePlaybackStart)
          .filter((tick) => tick > start && tick < end),
        ...relevant.flatMap((event) => [
          Math.max(start, event.startTick),
          Math.min(end, event.endTick),
        ]),
      ]),
    ].sort((a, b) => a - b);
    let previous: VariationEvent | undefined;
    for (let index = 0; index < boundaries.length - 1; index++) {
      const at = boundaries[index]!,
        until = boundaries[index + 1]!;
      const event = relevant.find((item) => item.startTick <= at && item.endTick >= until);
      const beat = timedBeat(until - at);
      // Tempo changes are owned by master bars; preserve other beat automation at its exact onset.
      beat.automations = automationBeats
        .filter((item) => item.absolutePlaybackStart === at)
        .flatMap((sourceBeat) =>
          sourceBeat.automations.map((item) => Object.assign(new model.Automation(), item)),
        );
      for (const item of event?.voicing.notes ?? []) {
        if (
          !Number.isInteger(item.position.string) ||
          item.position.string < 1 ||
          item.position.string > 6 ||
          !Number.isInteger(item.position.fret) ||
          item.position.fret < 0 ||
          item.position.fret > 24 ||
          staff.tuning[item.position.string - 1]! + staff.capo + item.position.fret !== item.midi
        )
          throw new Error('A variation note does not match this guitar tuning.');
        const note = new model.Note();
        note.string = 7 - item.position.string;
        note.fret = item.position.fret;
        // Continue an event across a barline, without introducing a new attack.
        note.isTieDestination = Boolean(
          event && at > event.startTick && (previous?.spanId === event.spanId || at === start),
        );
        beat.addNote(note);
      }
      voice.addBeat(beat);
      previous = event;
    }
    bar.voices = [];
    bar.addVoice(voice);
  }
  // Recreate derived caches and cross-bar ties through alphaTab's normal deserializer.
  return model.JsonConverter.jsObjectToScore(
    model.JsonConverter.scoreToJsObject(score),
    new Settings(),
  );
}
