import { expect, test, type Page } from '@playwright/test';
async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Play with my guitar', exact: true }).click();
  return page.getByRole('region', { name: 'Play with my guitar', exact: true });
}
async function syntheticInput(page: Page) {
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
async function play(page: Page, notes: number[], seconds = 0.7) {
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
test('real worklet and worker capture a connection, mask feedback, preserve attempts and stop on reload', async ({
  page,
}, info) => {
  await syntheticInput(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const panel = await open(page);
  await panel.getByLabel('Playing task').selectOption('live-connection');
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(panel.getByText('● Listening locally', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Make an attempt' }).click();
  await panel.getByRole('button', { name: 'Start attempt' }).click();
  await play(page, [65]);
  await play(page, [], 0.15);
  await play(page, [64]);
  await expect(panel.locator('.live-detection')).toHaveCount(0);
  await expect(panel.locator('.live-targets')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Finish response' }).click();
  await expect(panel.getByText('Supported match', { exact: true })).toBeVisible();
  await play(page, [], 0.15);
  await panel.getByRole('button', { name: 'Start attempt' }).click();
  await panel.getByRole('button', { name: 'Attention cue' }).click();
  await play(page, [64]);
  await play(page, [], 0.15);
  await play(page, [65]);
  await panel.getByRole('button', { name: 'Finish response' }).click();
  await expect(panel.getByText('Supported discrepancy', { exact: true })).toBeVisible();
  await panel.getByText('Session evidence (2)', { exact: true }).click();
  const evidence = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    const storage = await import(path);
    return storage.getLessonData();
  });
  const attempts = evidence.lessonEvents.filter(
    (e: { kind: string }) => e.kind === 'live-response',
  );
  expect(attempts).toHaveLength(2);
  expect(attempts[0].live.attempt.responseIndex).toBe(0);
  expect(attempts[0].live.attempt.inputConfiguration).toMatchObject({
    provider: 'browser-audio',
    channel: 0,
    timingQualified: false,
    calibrationId: null,
  });
  expect(attempts[0].live.attempt.inputConfiguration.sampleRate).toBeGreaterThan(0);
  expect(attempts[1].live.attempt.assisted).toBe(true);
  expect(
    evidence.lessonEvents.findIndex((e: { kind: string }) => e.kind === 'live-support'),
  ).toBeLessThan(evidence.lessonEvents.indexOf(attempts[1]));
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `../live-guitar-${info.project.name}.png` });
  await page.reload();
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Play with my guitar', exact: true }).click();
  await expect(panel.getByText('Input stopped', { exact: true })).toBeVisible();
  await expect(panel.getByText('Session evidence (2)', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('permission denial is recoverable and never produces an incorrect answer', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        throw new DOMException('Input permission denied', 'NotAllowedError');
      },
    }),
  );
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Input permission denied');
  await expect(panel.getByRole('button', { name: 'Connect guitar', exact: true })).toBeEnabled();
  await expect(panel.getByText('Session evidence (0)', { exact: true })).toBeVisible();
});

test('input capture coexists with score playback and channel failure interrupts the attempt', async ({
  page,
}) => {
  await syntheticInput(page);
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(panel.getByText('● Listening locally', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play score', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await expect(panel.getByText('● Listening locally', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Stop listening' }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await panel.getByLabel('Guitar channel').selectOption('7');
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText(/channel/i);
  await expect(panel.getByText('Session evidence (0)', { exact: true })).toBeVisible();
});

test('reload reserves the first response and restores a stopped task', async ({ page }) => {
  await syntheticInput(page);
  let panel = await open(page);
  await panel.getByLabel('Playing task').selectOption('live-connection');
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(panel.getByText('● Listening locally', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Make an attempt' }).click();
  await panel.getByRole('button', { name: 'Start attempt' }).click();
  await play(page, [65]);
  await page.reload();
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Play with my guitar', exact: true }).click();
  panel = page.getByRole('region', { name: 'Play with my guitar', exact: true });
  await expect(panel.getByLabel('Playing task')).toHaveValue('live-connection');
  await expect(panel.getByText('Input stopped', { exact: true })).toBeVisible();
  await expect(panel.getByText('Session evidence (1)', { exact: true })).toBeVisible();
  const evidence = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
  expect(
    evidence.lessonEvents.find((e: { kind: string }) => e.kind === 'live-response').live.attempt,
  ).toMatchObject({ outcome: 'interrupted', responseIndex: 0 });
});

test('spectral chords remain experimental and unknown voicings stay unassessed', async ({
  page,
}) => {
  await syntheticInput(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Open ii–V–I study' }).click();
  await expect(
    page.getByRole('heading', { name: 'One progression, many places', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Play with my guitar', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Play with my guitar', exact: true });
  await panel.getByLabel('Playing task').selectOption('live-progression');
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(panel.getByText('● Listening locally', { exact: true })).toBeVisible();
  await play(page, [48, 52, 55]);
  await expect(panel.locator('.live-detection')).toHaveText('C');
  await play(page, [57, 60, 64, 67]);
  await expect(panel.locator('.live-detection')).toHaveText('Could not assess yet');
  await panel.getByRole('button', { name: 'Make an attempt' }).click();
  await play(page, [], 0.25);
  await panel.getByRole('button', { name: 'Start attempt' }).click();
  await play(page, [57, 60, 64, 67]);
  await panel.getByRole('button', { name: 'Finish response' }).click();
  await expect(panel.getByText('Could not assess', { exact: true })).toBeVisible();
});
