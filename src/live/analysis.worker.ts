import { GuitarDetector } from './detector';
let detector: GuitarDetector | null = null;
self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'start') {
    detector = new GuitarDetector(message.sessionId, message.sampleRate, message.mode);
    self.postMessage({ type: 'ready' });
  }
  if (message.type === 'audio') {
    try {
      const observation = detector?.push(
        new Float32Array(message.buffer),
        message.frameStart,
        message.receivedMs,
      );
      if (observation) self.postMessage({ type: 'observation', observation });
    } catch {
      self.postMessage({ type: 'error' });
    } finally {
      self.postMessage({ type: 'recycle', buffer: message.buffer }, { transfer: [message.buffer] });
    }
  }
};
