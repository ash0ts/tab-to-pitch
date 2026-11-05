import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

function capture(channel = 0) {
  const control: unknown[] = [],
    audio: any[] = [];
  let Constructor: any;
  runInNewContext(readFileSync(new URL('./capture.worklet.js', import.meta.url), 'utf8'), {
    AudioWorkletProcessor: class {
      port = { onmessage: null, postMessage: (value: unknown) => control.push(value) };
    },
    registerProcessor: (_name: string, ctor: any) => {
      Constructor = ctor;
    },
    currentFrame: 0,
    Float32Array,
  });
  const processor = new Constructor({ processorOptions: { channel } });
  const transport = {
    onmessage: (_: unknown) => {},
    postMessage: (value: unknown) => audio.push(value),
  };
  processor.port.onmessage({ data: { transport } });
  processor.port.onmessage({ data: { buffer: new ArrayBuffer(512 * 4) } });
  return { processor, control, audio, transport };
}
it('waits for graph connection, then transfers bounded audio directly to analysis', () => {
  const { processor, control, audio, transport } = capture();
  processor.process([[]], [[new Float32Array(128)]]);
  expect(control).toEqual([]);
  for (let i = 0; i < 4; i++) processor.process([[new Float32Array(128).fill(0.2)]], []);
  expect(control).toEqual([{ type: 'capture-ready' }]);
  expect(audio).toHaveLength(1);
  expect(new Float32Array(audio[0].buffer)).toHaveLength(512);
  transport.onmessage({ data: { buffer: audio[0].buffer } });
  processor.process([[new Float32Array(128)]], []);
  expect(control).toHaveLength(1);
  processor.process([[]], []);
  expect(control.at(-1)).toEqual({ type: 'gap', reason: 'channel' });
});
it('rejects a wrong channel and buffer exhaustion instead of manufacturing observations', () => {
  const wrong = capture(1);
  wrong.processor.process([[new Float32Array(128)]], []);
  expect(wrong.control).toEqual([{ type: 'gap', reason: 'channel' }]);
  const full = capture();
  for (let i = 0; i < 5; i++) full.processor.process([[new Float32Array(128)]], []);
  expect(full.control.at(-1)).toEqual({ type: 'gap', reason: 'pool' });
  expect(full.audio).toHaveLength(1);
});
