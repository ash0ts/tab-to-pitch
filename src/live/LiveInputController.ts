import captureUrl from './capture.worklet.js?url&no-inline';
import {
  LIVE_VERSION,
  observationSchema,
  type LiveInputSession,
  type PerformanceObservation,
} from '../shared/live-guitar';
import { MidiTracker } from './midi';

export interface InputOptions {
  provider: 'browser-audio' | 'midi';
  deviceId: string;
  channel: number;
  mode: 'notes' | 'chords';
}
export class LiveInputController {
  private generation = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private worker: Worker | null = null;
  private cleanupMidi: (() => void) | null = null;
  private cancelStartup: (() => void) | null = null;
  private session: LiveInputSession | null = null;
  private removeLifecycle: () => void;
  constructor(
    private callbacks: {
      state(s: LiveInputSession): void;
      observation(o: PerformanceObservation): void;
      error(message: string): void;
      interrupted(): void;
    },
  ) {
    const hidden = () => {
      if (document.hidden && ['requesting', 'listening'].includes(this.session?.status ?? ''))
        this.stop(true);
    };
    const devices = () => {
      if (this.session?.status === 'listening') this.stop(true);
    };
    document.addEventListener('visibilitychange', hidden);
    navigator.mediaDevices?.addEventListener('devicechange', devices);
    this.removeLifecycle = () => {
      document.removeEventListener('visibilitychange', hidden);
      navigator.mediaDevices?.removeEventListener('devicechange', devices);
    };
  }
  private update(patch: Partial<LiveInputSession>) {
    if (this.session) {
      this.session = { ...this.session, ...patch };
      this.callbacks.state(this.session);
    }
  }
  async start(options: InputOptions) {
    this.stop();
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    this.session = {
      version: LIVE_VERSION,
      id: crypto.randomUUID(),
      provider: options.provider,
      status: 'requesting',
      sampleRate: null,
      channel: options.channel,
      processingDisabled: null,
      calibrationId: null,
      qualification: 'experimental',
      timingQualified: false,
    };
    this.update({});
    try {
      if (options.provider === 'midi') {
        if (!navigator.requestMIDIAccess)
          throw new Error('Web MIDI is unavailable. Use Chrome or direct audio input.');
        const access = await navigator.requestMIDIAccess({ sysex: false });
        if (!current()) return;
        const input = [...access.inputs.values()].find((p) => p.id === options.deviceId);
        if (!input) throw new Error('Choose an available MIDI input, then connect again.');
        const tracker = new MidiTracker(this.session.id);
        const listener = (event: MIDIMessageEvent) => {
          if (event.data) tracker.message(event.data, event.timeStamp);
        };
        input.addEventListener('midimessage', listener);
        const timer = setInterval(() => {
          if (current())
            this.callbacks.observation(tracker.snapshot(performance.now(), options.mode));
        }, 40);
        const disconnect = () => {
          if (input.state === 'disconnected') this.stop(true);
        };
        input.addEventListener('statechange', disconnect);
        this.cleanupMidi = () => {
          clearInterval(timer);
          input.removeEventListener('midimessage', listener);
          input.removeEventListener('statechange', disconnect);
          void input.close();
        };
        await input.open();
        if (!current()) {
          await input.close();
          return;
        }
        this.update({ status: 'listening' });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Audio input needs a secure browser page and input permission.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: Math.max(2, options.channel + 1) },
        },
        video: false,
      });
      if (!current()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const track = stream.getAudioTracks()[0]!,
        settings = track.getSettings();
      if (settings.channelCount !== undefined && options.channel >= settings.channelCount)
        throw new Error(
          'That channel is not supplied by this input. Choose another guitar channel.',
        );
      track.onended = () => {
        if (current()) this.stop(true);
      };
      const context = new AudioContext({ latencyHint: 'interactive' });
      this.context = context;
      await context.audioWorklet.addModule(captureUrl);
      if (!current()) return;
      const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker = worker;
      const node = new AudioWorkletNode(context, 'guitar-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCountMode: 'max',
        processorOptions: { channel: options.channel },
      });
      this.node = node;
      let analysisReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        analysisReady = resolve;
      });
      let inputReady!: () => void;
      const captured = new Promise<void>((resolve) => {
        inputReady = resolve;
      });
      this.cancelStartup = () => {
        analysisReady();
        inputReady();
      };
      const transport = new MessageChannel();
      node.port.postMessage({ transport: transport.port1 }, [transport.port1]);
      worker.onmessage = (event) => {
        if (!current()) return;
        if (event.data.type === 'ready') analysisReady();
        if (event.data.type === 'observation') {
          const parsed = observationSchema.safeParse(event.data.observation);
          if (parsed.success) this.callbacks.observation(parsed.data);
          else this.fail('The detector returned an invalid observation.');
        }
        if (event.data.type === 'error')
          this.fail('Audio analysis stopped. Reconnect to try again.');
      };
      worker.onerror = () => {
        if (current()) this.fail('The analysis worker could not run.');
      };
      node.port.onmessage = (event) => {
        if (!current()) return;
        if (event.data.type === 'capture-ready') inputReady();
        if (event.data.type === 'gap') {
          this.fail(
            event.data.reason === 'channel'
              ? 'The selected guitar channel was unavailable. Choose its input channel and reconnect.'
              : 'Audio analysis fell behind and frames were lost. Reconnect before another attempt.',
          );
          return;
        }
      };
      worker.postMessage(
        {
          type: 'start',
          sessionId: this.session.id,
          sampleRate: context.sampleRate,
          mode: options.mode,
          transport: transport.port2,
          timeOrigin: performance.timeOrigin,
        },
        [transport.port2],
      );
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          ready,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('The detector did not become ready. Reconnect to retry.')),
              10000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      if (!current()) return;
      for (let i = 0; i < 16; i++) {
        const buffer = new ArrayBuffer(512 * 4);
        node.port.postMessage({ buffer }, [buffer]);
      }
      context.createMediaStreamSource(stream).connect(node);
      node.connect(context.destination);
      await context.resume();
      try {
        await Promise.race([
          captured,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () =>
                reject(new Error('No input frames arrived. Check the interface and reconnect.')),
              3000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      if (!current()) return;
      this.cancelStartup = null;
      this.update({
        status: 'listening',
        sampleRate: context.sampleRate,
        processingDisabled:
          settings.echoCancellation === false &&
          settings.noiseSuppression === false &&
          settings.autoGainControl === false,
      });
      context.onstatechange = () => {
        if (current() && context.state !== 'running') this.stop(true);
      };
    } catch (error) {
      if (current())
        this.fail(error instanceof Error ? error.message : 'Unable to open the input.');
    }
  }
  private fail(message: string) {
    this.stop(true);
    this.update({ status: 'error' });
    this.callbacks.error(message);
  }
  stop(interrupted = false) {
    ++this.generation;
    this.cancelStartup?.();
    this.cancelStartup = null;
    this.cleanupMidi?.();
    this.cleanupMidi = null;
    this.worker?.terminate();
    this.worker = null;
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = null;
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.session) this.update({ status: 'stopped' });
    if (interrupted) this.callbacks.interrupted();
  }
  dispose() {
    this.stop(true);
    this.removeLifecycle();
  }
}
