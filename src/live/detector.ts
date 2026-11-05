import { PitchDetector } from 'pitchy';
import FFT from 'fft.js';
import {
  DETECTOR_VERSION,
  LIVE_VERSION,
  type PerformanceObservation,
  type InputProblem,
} from '../shared/live-guitar';
import { spectralChords } from './chords';

const SIZE = 8192,
  NOTE_SIZE = 2048;
/** Stateful streaming DSP, independent of the browser and exercise answer. */
export class GuitarDetector {
  private ring = new Float32Array(SIZE);
  private frame = new Float32Array(SIZE);
  private noteFrame = new Float32Array(NOTE_SIZE);
  private windowed = new Float32Array(SIZE);
  private fft = new FFT(SIZE);
  private spectrum = this.fft.createComplexArray();
  private pitch = PitchDetector.forFloat32Array(NOTE_SIZE);
  private write = 0;
  private count = 0;
  private pending = 0;
  private sequence = 0;
  private previous = '';
  private since = 0;
  private attack = 0;
  private pendingAttack = true;
  private level = 0;
  constructor(
    private sessionId: string,
    private sampleRate: number,
    private mode: 'notes' | 'chords',
  ) {}
  push(block: Float32Array, frameStart: number, receivedMs: number): PerformanceObservation | null {
    for (const value of block) {
      this.ring[this.write] = value;
      this.write = (this.write + 1) % SIZE;
    }
    this.count += block.length;
    this.pending += block.length;
    const size = this.mode === 'notes' ? NOTE_SIZE : SIZE;
    if (this.count < size || this.pending < 1024) return null;
    this.pending = 0;
    for (let i = 0; i < SIZE; i++) this.frame[i] = this.ring[(this.write + i) % SIZE]!;
    this.noteFrame.set(this.frame.subarray(SIZE - NOTE_SIZE));
    const signal = this.mode === 'notes' ? this.noteFrame : this.frame;
    const rms = Math.sqrt(signal.reduce((sum, v) => sum + v * v, 0) / signal.length);
    const clipped = signal.some((v) => Math.abs(v) >= 0.995);
    const endMs = ((frameStart + block.length) / this.sampleRate) * 1000;
    const [hz, clarity] = this.pitch.findPitch(this.noteFrame, this.sampleRate);
    const problems: InputProblem[] = [];
    let pitches: number[] = [];
    let chords: PerformanceObservation['chords'] = [];
    if (clipped) problems.push('clipping');
    if (rms < 0.003) problems.push('silence');
    else if (rms < 0.008) problems.push('weak-signal');
    if (!problems.length) {
      if (this.mode === 'notes') {
        if (clarity >= 0.94 && hz >= 70 && hz <= 1400) pitches = [69 + 12 * Math.log2(hz / 440)];
        else problems.push('ambiguous');
      } else {
        // Windowed spectral peaks with conservative harmonic suppression.
        for (let i = 0; i < SIZE; i++)
          this.windowed[i] =
            this.frame[i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SIZE - 1)));
        this.fft.realTransform(this.spectrum, this.windowed);
        // Locate spectral peaks first. Sampling wide neighborhoods at every MIDI
        // frequency double-counts low-register bins as adjacent semitones.
        const magnitude = (bin: number) =>
          Math.hypot(this.spectrum[bin * 2]!, this.spectrum[bin * 2 + 1]!);
        const peaks: { hz: number; strength: number; midi: number }[] = [];
        for (
          let bin = 2;
          bin < Math.min(SIZE / 2 - 1, Math.ceil((1450 * SIZE) / this.sampleRate));
          bin++
        ) {
          const left = magnitude(bin - 1),
            center = magnitude(bin),
            right = magnitude(bin + 1);
          if (center <= left || center <= right || center < 1e-6) continue;
          const a = Math.log(Math.max(left, 1e-12)),
            b = Math.log(center),
            c = Math.log(Math.max(right, 1e-12));
          const offset = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / (a - 2 * b + c)));
          const hz = ((bin + offset) * this.sampleRate) / SIZE,
            midi = 69 + 12 * Math.log2(hz / 440);
          if (midi >= 39.5 && midi <= 88.5 && Math.abs(midi - Math.round(midi)) <= 0.35)
            peaks.push({ hz, midi: Math.round(midi), strength: center });
        }
        const chroma = Array<number>(12).fill(0);
        const maximum = Math.max(0, ...peaks.map((p) => p.strength));
        for (const peak of peaks) {
          if (peak.strength < maximum * 0.1) continue;
          let strength = peak.strength;
          for (const lower of peaks) {
            const harmonic = Math.round(peak.hz / lower.hz);
            if (
              harmonic >= 2 &&
              harmonic <= 5 &&
              Math.abs(12 * Math.log2(peak.hz / (lower.hz * harmonic))) < 0.25
            )
              strength -= (lower.strength * 0.8) / harmonic;
          }
          chroma[peak.midi % 12] += Math.max(0, strength);
        }
        chords = spectralChords(chroma);
        if (chords.length !== 1) problems.push('ambiguous');
      }
    }
    const key = pitches.length
      ? `n${Math.round(pitches[0]!)}`
      : chords.length === 1
        ? `c${chords[0]!.root}:${chords[0]!.quality}`
        : '';
    const onset = rms > Math.max(0.02, this.level * 2.2) && endMs - this.since > 180;
    if (rms < 0.003 || onset) this.pendingAttack = true;
    if (key && (key !== this.previous || this.pendingAttack)) {
      this.previous = key;
      this.since = endMs;
      this.attack++;
      this.pendingAttack = false;
    }
    // A low-clarity window is not evidence of another pick attack. Keep the
    // identity, retain the uncertain observation, and require stability again.
    if (!key) this.since = endMs;
    this.level = rms;
    const stable =
      !!key && !problems.length && endMs - this.since >= (this.mode === 'notes' ? 45 : 180);
    if (!stable && !problems.length) problems.push('unstable');
    return {
      version: LIVE_VERSION,
      sessionId: this.sessionId,
      sequence: this.sequence++,
      provider: 'browser-audio',
      detectorVersion: DETECTOR_VERSION,
      captureMs: Math.max(0, endMs - (size / this.sampleRate) * 1000),
      receivedMs,
      attackId: this.attack,
      pitches,
      chords,
      kind: pitches.length ? 'note' : chords.length ? 'chord' : 'unknown',
      stable,
      rms: Math.min(1, rms),
      clarity,
      problems,
    };
  }
}
