import { generateProgressionVariations } from './harmony';
import type { HarmonySpan, ProgressionOptions } from './harmony';

interface Request {
  id: string | number;
  spans: HarmonySpan[];
  tuning: number[];
  capo: number;
  options?: ProgressionOptions;
}
self.addEventListener('message', (event: MessageEvent<Request>) => {
  const { id, spans, tuning, capo, options } = event.data;
  try {
    self.postMessage({ id, result: generateProgressionVariations(spans, tuning, capo, options) });
  } catch {
    self.postMessage({
      id,
      error:
        'The variation could not be generated. Check the selected chords and fretboard constraints.',
    });
  }
});
