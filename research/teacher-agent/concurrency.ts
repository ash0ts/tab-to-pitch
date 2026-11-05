/** Drain already-started work before propagating a failure; never launch a replacement retry. */
export async function mapBounded<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  let failure: unknown;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (failure === undefined) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await work(items[index]!);
      } catch (error) {
        failure = error;
      }
    }
  });
  await Promise.all(workers);
  if (failure !== undefined) throw failure;
}
