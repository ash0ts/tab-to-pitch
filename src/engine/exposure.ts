import type { FretPosition } from './types.js';
/** Shared identity for a physical position, independent of source, task and layout. */
export function instrumentExposureId(tuning: readonly number[], capo: number): string {
  let value = 14695981039346656037n;
  for (const char of JSON.stringify({ tuning, capo }))
    value = BigInt.asUintN(64, (value ^ BigInt(char.codePointAt(0)!)) * 1099511628211n);
  return value.toString(36);
}
export function positionExposureKey(
  tuning: readonly number[],
  capo: number,
  p: FretPosition,
): string {
  return `position:${instrumentExposureId(tuning, capo)}:${p.string}:${p.fret}`;
}
