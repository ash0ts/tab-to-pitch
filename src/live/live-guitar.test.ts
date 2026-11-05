import { describe, it, expect, vi, afterEach } from 'vitest';
import { GuitarDetector } from './detector';
import { MidiTracker } from './midi';
import { chordsFromPitches } from './chords';
import { assessPerformance, liveTasks } from './assessment';
import { PlaybackClockBridge } from './clock';
import {
  LIVE_VERSION,
  liveContextSchema,
  performanceAttemptSchema,
  type PerformanceObservation,
} from '../shared/live-guitar';
import { lessonSessionSchema, lessonEventSchema } from '../lesson-storage';
import { LiveInputController } from './LiveInputController';

export function observed(pitch = 60, attackId = 1): PerformanceObservation {
  return {
    version: LIVE_VERSION,
    sessionId: 'input-1',
    sequence: attackId,
    provider: 'browser-audio',
    detectorVersion: 'independent-fixture',
    captureMs: 100,
    receivedMs: 200,
    attackId,
    pitches: [pitch],
    chords: [],
    kind: 'note',
    stable: true,
    rms: 0.1,
    clarity: 0.99,
    problems: [],
  };
}
const task = liveTasks('source-1', ['C', 'F', 'G', 'C'], 60)[0]!;
describe('musical evidence boundaries', () => {
  it('accepts pitch class across octaves but keeps exact-pitch contracts separate', () => {
    expect(assessPerformance(task, [observed(72)], 'source-1').outcome).toBe('match');
    expect(
      assessPerformance({ ...task, exactOctave: true }, [observed(72)], 'source-1').outcome,
    ).toBe('discrepancy');
  });
  it('freezes the first stable answer and ignores repeated frames from one attack', () => {
    expect(assessPerformance(task, [observed(61), observed(60)], 'source-1').outcome).toBe(
      'discrepancy',
    );
    expect(assessPerformance(task, [observed(60), observed(60)], 'source-1').outcome).toBe('match');
    expect(assessPerformance(task, [observed(60), observed(60, 2)], 'source-1').outcome).toBe(
      'discrepancy',
    );
  });
  it('does not turn clipping, partial detection, or stale music into incorrect playing', () => {
    expect(
      assessPerformance(task, [{ ...observed(), problems: ['clipping'] }], 'source-1').outcome,
    ).toBe('unassessed');
    expect(assessPerformance(task, [], 'source-1').outcome).toBe('unassessed');
    expect(assessPerformance(task, [observed()], 'source-2').outcome).toBe('interrupted');
    expect(
      assessPerformance(
        task,
        [observed(), { ...observed(), problems: ['dropped-audio'] }],
        'source-1',
      ).outcome,
    ).toBe('unassessed');
  });
  it('checks actual connection order independently of fret position', () => {
    const t = liveTasks('source-1', [], 60)[1]!;
    expect(assessPerformance(t, [observed(65), observed(64, 2)], 'source-1').outcome).toBe('match');
    expect(assessPerformance(t, [observed(53), observed(64, 2)], 'source-1').outcome).toBe(
      'discrepancy',
    );
    expect(assessPerformance(t, [observed(53), observed(52, 2)], 'source-1').outcome).toBe('match');
    expect(assessPerformance(t, [observed(64), observed(65, 2)], 'source-1').outcome).toBe(
      'discrepancy',
    );
  });
  it('does not accept only the recognizable part of a sustained uncertain response', () => {
    const uncertain = (at: number): PerformanceObservation => ({
      ...observed(),
      captureMs: at,
      stable: false,
      kind: 'unknown',
      pitches: [],
      problems: ['ambiguous'],
    });
    expect(
      assessPerformance(task, [observed(), uncertain(200), uncertain(500)], 'source-1').outcome,
    ).toBe('unassessed');
    expect(
      assessPerformance(task, [uncertain(0), uncertain(40), observed()], 'source-1').outcome,
    ).toBe('match');
    expect(
      assessPerformance(
        task,
        [observed(), { ...uncertain(200), problems: ['unsupported'] }],
        'source-1',
      ).outcome,
    ).toBe('unassessed');
  });
  it('retains C6/Am7 ambiguity, rejects missing thirds, and recognizes G7 and Cmaj7', () => {
    expect(chordsFromPitches([57, 60, 64, 67])).toEqual(
      expect.arrayContaining([
        { root: 9, quality: 'm7', score: 1 },
        { root: 0, quality: '6', score: 1 },
      ]),
    );
    expect(chordsFromPitches([48, 55, 60])).toEqual([]);
    expect(chordsFromPitches([43, 47, 50, 53])).toEqual([{ root: 7, quality: '7', score: 1 }]);
    expect(chordsFromPitches([48, 52, 55, 59])).toEqual([{ root: 0, quality: 'maj7', score: 1 }]);
  });
  it('keeps extended chord tones available as sequences without claiming strum support', () => {
    const tasks = liveTasks('r', ['Dm9'], 60);
    expect(tasks.some((t) => t.kind === 'chords')).toBe(false);
    expect(tasks.find((t) => t.id === 'live-arpeggio')?.pitches).toContain(64);
  });
});

describe('streaming detectors', () => {
  for (const rate of [44100, 48000])
    for (const midi of [40, 48, 60, 76, 88])
      it(`tracks a generated ${midi} tone at ${rate} Hz`, () => {
        const d = new GuitarDetector('i', rate, 'notes');
        const events: PerformanceObservation[] = [];
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        for (let start = 0; start < rate / 2; start += 512) {
          const block = Float32Array.from(
            { length: 512 },
            (_, i) => 0.2 * Math.sin((2 * Math.PI * frequency * (start + i)) / rate),
          );
          const o = d.push(block, start, (start / rate) * 1000);
          if (o?.stable) events.push(o);
        }
        expect(events.length).toBeGreaterThan(0);
        expect(events.every((o) => Math.round(o.pitches[0]!) === midi)).toBe(true);
      });
  it('marks silence and clipping instead of emitting a supported note', () => {
    for (const amplitude of [0, 1]) {
      const d = new GuitarDetector('i', 48000, 'notes');
      let last: PerformanceObservation | null = null;
      for (let frame = 0; frame < 10000; frame += 512)
        last = d.push(new Float32Array(512).fill(amplitude), frame, 200);
      expect(last?.stable).toBe(false);
      expect(last?.problems).toContain(amplitude ? 'clipping' : 'silence');
    }
  });
  it('normalizes MIDI note-off, bends, and repeated attacks without treating channel as string', () => {
    const d = new MidiTracker('m');
    d.message(new Uint8Array([0x93, 60, 100]), 0);
    expect(d.snapshot(100, 'notes')).toMatchObject({ pitches: [60], stable: true });
    const first = d.snapshot(100, 'notes').attackId;
    d.message(new Uint8Array([0x93, 60, 0]), 110);
    expect(d.snapshot(300, 'notes').problems).toContain('silence');
    d.message(new Uint8Array([0x93, 60, 100]), 320);
    expect(d.snapshot(500, 'notes').attackId).toBeGreaterThan(first);
    d.message(new Uint8Array([0xe3, 0, 80]), 550);
    expect(d.snapshot(700, 'notes').problems).toContain('unsupported');
  });
  it('waits for a chord to settle and abstains on alternative interpretations', () => {
    const d = new MidiTracker('m');
    [48, 52, 55].forEach((n, i) => d.message(new Uint8Array([0x90, n, 100]), i * 30));
    expect(d.snapshot(100, 'chords').stable).toBe(false);
    expect(d.snapshot(400, 'chords')).toMatchObject({
      stable: true,
      chords: [{ root: 0, quality: 'major' }],
    });
    d.message(new Uint8Array([0x90, 57, 100]), 450);
    expect(d.snapshot(800, 'chords')).toMatchObject({ stable: false, problems: ['ambiguous'] });
  });
});

describe('persistence and clocks', () => {
  it('accepts legacy lessons, preserves attempts, and rejects raw audio in cloud context', () => {
    const lesson = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      curriculumVersion: 'old',
      sourceHash: 'source',
      trackId: 'track',
      objective: 'foundations',
      contextVersion: 'c',
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
      status: 'active',
      messages: [],
      pendingTaskId: null,
    };
    expect(lessonSessionSchema.safeParse(lesson).success).toBe(true);
    const attempt = performanceAttemptSchema.parse({
      version: LIVE_VERSION,
      id: 'a',
      episodeId: 'e',
      task,
      inputSessionId: 'input-1',
      provider: 'browser-audio',
      startedAt: 0,
      finishedAt: 200,
      responseIndex: 0,
      assisted: false,
      supports: [],
      observations: [observed()],
      outcome: 'match',
      reason: 'fixture',
      qualification: 'experimental',
      evidence: 'detected-audio',
      timingGraded: false,
      positionVerified: false,
    });
    expect(
      lessonEventSchema.safeParse({
        id: crypto.randomUUID(),
        lessonId: lesson.id,
        at: 200,
        contextVersion: 'c',
        kind: 'live-response',
        exposureKeys: [],
        live: { attempt, taskId: task.id },
      }).success,
    ).toBe(true);
    expect(performanceAttemptSchema.safeParse({ ...attempt, positionVerified: true }).success).toBe(
      false,
    );
    expect(
      liveContextSchema.safeParse({
        capability: LIVE_VERSION,
        revision: 0,
        ready: true,
        active: false,
        assisted: false,
        qualification: 'experimental',
        eligible: [],
        evidence: [],
        audio: [1],
      }).success,
    ).toBe(false);
  });
  it('invalidates timing after traversal and speed changes; never self-qualifies', () => {
    const c = new PlaybackClockBridge();
    c.observe(100, 100, 1, true, 10);
    const first = c.snapshot();
    c.observe(0, 0, 1, true, 20);
    expect(c.snapshot().epoch).toBeGreaterThan(first.epoch);
    c.observe(20, 20, 0.5, true, 30);
    expect(c.snapshot().timingQualified).toBe(false);
  });
});

afterEach(() => vi.unstubAllGlobals());
it.each(['stop', 'background'])(
  'closes a late permission grant after %s without opening an audio context',
  async (cause) => {
    let grant!: (stream: MediaStream) => void;
    const media = new EventTarget();
    Object.assign(media, {
      getUserMedia: () =>
        new Promise<MediaStream>((r) => {
          grant = r;
        }),
    });
    const document = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal('document', document);
    vi.stubGlobal('navigator', { mediaDevices: media });
    const stopped = vi.fn();
    const stream = { getTracks: () => [{ stop: stopped }] } as unknown as MediaStream;
    const c = new LiveInputController({
      state: () => {},
      observation: () => {},
      error: () => {},
      interrupted: () => {},
    });
    const start = c.start({ provider: 'browser-audio', deviceId: '', channel: 0, mode: 'notes' });
    if (cause === 'stop') c.stop();
    else {
      document.hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    }
    grant(stream);
    await start;
    expect(stopped).toHaveBeenCalledOnce();
    c.dispose();
  },
);

it('recognizes an independent clean C chord fixture and abstains on its missing third', () => {
  for (const notes of [
    [48, 52, 55],
    [48, 55],
  ]) {
    const d = new GuitarDetector('chord', 48000, 'chords');
    const stable: PerformanceObservation[] = [];
    for (let frame = 0; frame < 48000; frame += 512) {
      const pcm = Float32Array.from({ length: 512 }, (_, i) =>
        notes.reduce(
          (n, p) =>
            n + 0.12 * Math.sin((2 * Math.PI * 440 * 2 ** ((p - 69) / 12) * (frame + i)) / 48000),
          0,
        ),
      );
      const o = d.push(pcm, frame, frame / 48);
      if (o?.stable) stable.push(o);
    }
    if (notes.length === 3) {
      expect(stable.length).toBeGreaterThan(0);
      expect(stable.every((o) => o.chords[0]?.root === 0 && o.chords[0]?.quality === 'major')).toBe(
        true,
      );
    } else expect(stable).toEqual([]);
  }
});
