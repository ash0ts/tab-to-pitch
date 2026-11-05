import { GuitarDetector } from './detector';
let detector: GuitarDetector | null = null;
let transport: MessagePort | null = null;
let timeOrigin = 0;
self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'start') {
    detector = new GuitarDetector(message.sessionId, message.sampleRate, message.mode);
    transport = message.transport;
    timeOrigin = message.timeOrigin;
    if (transport) transport.onmessage = analyze;
    self.postMessage({ type: 'ready' });
  }
};
function analyze(event: MessageEvent) {
  const message = event.data;
  if (message.type === 'audio') {
    try {
      const observation = detector?.push(
        new Float32Array(message.buffer),
        message.frameStart,
        performance.timeOrigin + performance.now() - timeOrigin,
      );
      if (observation) self.postMessage({ type: 'observation', observation });
    } catch {
      self.postMessage({ type: 'error' });
    } finally {
      transport?.postMessage({ type: 'recycle', buffer: message.buffer }, [message.buffer]);
    }
  }
}
