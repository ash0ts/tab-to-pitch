import { chordsFromPitches } from './chords';
import { LIVE_VERSION, type PerformanceObservation } from '../shared/live-guitar';
/** Channels are protocol channels, never assumed to identify guitar strings. */
export class MidiTracker {
  private notes = new Map<string, { note: number; channel: number }>();
  private bends = Array<number>(16).fill(0);
  private changedAt = 0;
  private attack = 0;
  private sequence = 0;
  private unsupportedBend = false;
  constructor(private sessionId: string) {}
  message(bytes: Uint8Array, at: number) {
    const status = bytes[0] ?? 0,
      command = status & 0xf0,
      channel = status & 15,
      note = bytes[1] ?? 0,
      value = bytes[2] ?? 0;
    if (status === 0xff) {
      this.notes.clear();
      this.changedAt = at;
      return;
    }
    if (command === 0x90 && value) {
      this.notes.set(`${channel}:${note}`, { note, channel });
      this.attack++;
      this.changedAt = at;
    }
    if (command === 0x80 || (command === 0x90 && !value)) {
      this.notes.delete(`${channel}:${note}`);
      this.changedAt = at;
    }
    if (command === 0xe0) {
      this.bends[channel] = ((value << 7) + note - 8192) / 8192;
      this.changedAt = at;
    }
    // Sustain and RPN pitch range need a provider-specific contract. Abstain.
    if (command === 0xb0) {
      if (note === 120 || note === 123) {
        this.notes.clear();
        this.changedAt = at;
      } else if ([64, 100, 101, 6, 38].includes(note)) this.unsupportedBend = true;
    }
  }
  snapshot(at: number, mode: 'notes' | 'chords'): PerformanceObservation {
    const pitches = [...this.notes.values()].map((n) => n.note);
    const bent = [...this.notes.values()].some((n) => Math.abs(this.bends[n.channel]!) > 0.01);
    const chords = mode === 'chords' ? chordsFromPitches(pitches) : [];
    const stable = at - this.changedAt >= (mode === 'notes' ? 60 : 200);
    const problems: PerformanceObservation['problems'] =
      bent || this.unsupportedBend
        ? ['unsupported']
        : !pitches.length
          ? ['silence']
          : pitches.length > 12
            ? ['ambiguous']
            : !stable
              ? ['unstable']
              : mode === 'notes'
                ? pitches.length !== 1
                  ? ['ambiguous']
                  : []
                : chords.length !== 1
                  ? ['ambiguous']
                  : [];
    return {
      version: LIVE_VERSION,
      sessionId: this.sessionId,
      sequence: this.sequence++,
      provider: 'midi',
      detectorVersion: 'midi-normalizer-v1',
      captureMs: this.changedAt,
      receivedMs: at,
      attackId: this.attack,
      pitches: pitches.slice(0, 12),
      chords,
      kind: mode === 'notes' ? 'note' : 'chord',
      stable: stable && !problems.length,
      rms: pitches.length ? 0.5 : 0,
      clarity: null,
      problems,
    };
  }
}
