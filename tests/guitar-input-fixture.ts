import { expect, type Page } from '@playwright/test';
export async function syntheticInput(page: Page) {
  await page.addInitScript(() => {
    const devices = navigator.mediaDevices;
    Object.defineProperty(devices, 'getUserMedia', {
      value: async () => {
        const context = new AudioContext();
        await context.resume();
        const destination = context.createMediaStreamDestination();
        let nodes: OscillatorNode[] = [];
        Object.assign(window, {
          guitarTest: {
            context,
            play: (notes: number[]) => {
              nodes.forEach((n) => {
                n.stop();
                n.disconnect();
              });
              nodes = [];
              notes.forEach((note) => {
                const oscillator = context.createOscillator(),
                  gain = context.createGain();
                oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
                gain.gain.value = 0.18;
                oscillator.connect(gain).connect(destination);
                oscillator.start();
                nodes.push(oscillator);
              });
            },
          },
        });
        return destination.stream;
      },
    });
  });
}
export async function play(page: Page, notes: number[], seconds = 0.7) {
  const start = await page.evaluate((notes) => {
    const g = (
      window as unknown as { guitarTest: { context: AudioContext; play(n: number[]): void } }
    ).guitarTest;
    g.play(notes);
    return g.context.currentTime;
  }, notes);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { guitarTest: { context: AudioContext } }).guitarTest.context
            .currentTime,
      ),
    )
    .toBeGreaterThan(start + seconds);
}
