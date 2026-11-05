import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audition, closeAudition, stopAudition } from './audition';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function oscillatorStub() {
  return {
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
}

class AudioContextStub {
  static instances: AudioContextStub[] = [];
  currentTime = 0;
  state = 'running';
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  oscillators: ReturnType<typeof oscillatorStub>[] = [];
  constructor() {
    AudioContextStub.instances.push(this);
  }
  createOscillator() {
    const oscillator = oscillatorStub();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}

describe('audition lifecycle', () => {
  beforeEach(() => {
    AudioContextStub.instances = [];
    vi.stubGlobal('AudioContext', AudioContextStub);
  });
  afterEach(async () => {
    await closeAudition();
    vi.unstubAllGlobals();
  });

  it('cancels pending resumes and stops the previous listening example', async () => {
    await audition([60]);
    const audio = AudioContextStub.instances[0];
    const resume = deferred();
    audio.resume.mockReturnValueOnce(resume.promise);
    const pending = audition([64]);
    expect(audio.oscillators[0].stop).toHaveBeenLastCalledWith();
    stopAudition();
    resume.resolve();
    await pending;
    expect(audio.oscillators).toHaveLength(1);
  });

  it('closing an old context cannot discard a newly opened context', async () => {
    await audition([60]);
    const close = deferred();
    AudioContextStub.instances[0].close.mockReturnValueOnce(close.promise);
    const closing = closeAudition();
    await audition([64]);
    close.resolve();
    await closing;
    await audition([67]);
    expect(AudioContextStub.instances).toHaveLength(2);
    expect(AudioContextStub.instances[1].oscillators).toHaveLength(2);
  });
});
