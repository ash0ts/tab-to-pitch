// Capture only. The zero-filled output keeps the graph alive without monitoring.
class GuitarCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channel = options.processorOptions.channel;
    this.initialized = false;
    this.connected = false;
    this.transport = null;
    this.pool = [];
    this.buffer = null;
    this.offset = 0;
    this.start = 0;
    this.dropped = false;
    this.port.onmessage = (event) => {
      if (event.data.transport) {
        this.transport = event.data.transport;
        this.transport.onmessage = (message) => {
          if (message.data.buffer) this.pool.push(new Float32Array(message.data.buffer));
        };
      }
      if (event.data.buffer) {
        this.pool.push(new Float32Array(event.data.buffer));
        this.initialized = true;
      }
    };
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (!this.initialized || !this.transport) return true;
    // Port messages can arrive before the graph's connection update. There is
    // no captured input to lose yet; require the first real input quantum.
    if (!this.connected && !inputs[0]?.length) return true;
    const channel = inputs[0]?.[this.channel];
    if (!channel) {
      if (!this.dropped) this.port.postMessage({ type: 'gap', reason: 'channel' });
      this.dropped = true;
      return true;
    }
    if (!this.connected) {
      this.connected = true;
      this.port.postMessage({ type: 'capture-ready' });
    }
    for (let i = 0; i < channel.length; i++) {
      if (!this.buffer) {
        this.buffer = this.pool.pop() ?? null;
        if (!this.buffer) {
          if (!this.dropped) this.port.postMessage({ type: 'gap', reason: 'pool' });
          this.dropped = true;
          return true;
        }
        this.start = currentFrame + i;
        this.offset = 0;
      }
      this.dropped = false;
      this.buffer[this.offset++] = channel[i];
      if (this.offset === this.buffer.length) {
        const buffer = this.buffer.buffer;
        this.transport.postMessage({ type: 'audio', buffer, frameStart: this.start }, [buffer]);
        this.buffer = null;
      }
    }
    return true;
  }
}
registerProcessor('guitar-capture', GuitarCapture);
