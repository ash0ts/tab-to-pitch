import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('ignores obsolete score bounds and SVG while accepting the current render revision', () => {
  const text = readFileSync('public/vendor/alphatab-source/alphaTab.core.mjs', 'utf8');
  const start = text.indexOf('class AlphaTabWorkerScoreRenderer {'),
    end = text.indexOf('//#endregion', start);
  class Emitter {
    trigger = vi.fn();
  }
  const fromJson = vi.fn(() => ({ finish: vi.fn() }));
  const Renderer = runInNewContext(text.slice(start, end) + ';AlphaTabWorkerScoreRenderer', {
    EventEmitterOfT: Emitter,
    EventEmitter: Emitter,
    BoundsLookup: { fromJson },
    Environment: { prepareForPostMessage: (v: unknown) => v },
    JsonConverter: { settingsToJsObject: () => new Map(), scoreToJsObject: (s: unknown) => s },
    FontSizes: { fontSizeLookupTables: [] },
  });
  const sent: { cmd: string; ttpRevision: number }[] = [];
  let receive!: (e: unknown) => void;
  const renderer = new Renderer(
    { settings: {}, score: {} },
    {
      postMessage: (m: (typeof sent)[number]) => sent.push(m),
      addEventListener: (_: string, fn: typeof receive) => {
        receive = fn;
      },
    },
  );
  renderer.renderScore({ id: 'old' }, [], {});
  renderer.renderScore({ id: 'new' }, [], {});
  receive({
    data: { cmd: 'alphaTab.postRenderFinished', ttpRevision: 1, boundsLookup: { old: true } },
  });
  receive({ data: { cmd: 'alphaTab.partialRenderFinished', ttpRevision: 1, result: 'old SVG' } });
  expect(fromJson).not.toHaveBeenCalled();
  expect(renderer.partialRenderFinished.trigger).not.toHaveBeenCalled();
  receive({
    data: { cmd: 'alphaTab.postRenderFinished', ttpRevision: 2, boundsLookup: { current: true } },
  });
  receive({
    data: { cmd: 'alphaTab.partialRenderFinished', ttpRevision: 2, result: 'current SVG' },
  });
  expect(fromJson).toHaveBeenCalledOnce();
  expect(renderer.partialRenderFinished.trigger).toHaveBeenCalledWith('current SVG');
  expect(sent.filter((s) => s.cmd === 'alphaTab.renderScore').map((s) => s.ttpRevision)).toEqual([
    1, 2,
  ]);
});
