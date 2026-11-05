import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const destination = resolve(process.argv[3] ?? '../live-guitar-demo');
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width: 1360, height: 1060 },
  recordVideo: { dir: destination, size: { width: 1360, height: 1060 } },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    value: async () => {
      const context = new AudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      let nodes = [];
      window.liveDemo = {
        play(notes) {
          nodes.forEach((n) => n.stop());
          nodes = [];
          for (const midi of notes) {
            const oscillator = context.createOscillator(),
              gain = context.createGain();
            oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
            gain.gain.value = 0.15;
            oscillator.connect(gain).connect(destination);
            oscillator.start();
            nodes.push(oscillator);
          }
        },
      };
      return destination.stream;
    },
  });
});
try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5394');
  await page.getByRole('button', { name: 'Play score', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fretboard homework', exact: true }).click();
  await page.getByRole('button', { name: 'Open C–F–G–C study', exact: true }).click();
  await page
    .getByRole('heading', { name: 'A familiar chord, a wider neck', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Play with my guitar', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Play with my guitar', exact: true });
  await page.evaluate(() => {
    const label = document.createElement('div');
    label.id = 'capture-label';
    label.textContent =
      'Application demonstration · synthetic audio input · not hardware qualification';
    label.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:1000;background:#123d38;color:white;text-align:center;padding:8px;font:13px sans-serif';
    document.body.append(label);
  });
  async function frame(name) {
    await panel.evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -45));
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(destination, `${name}.png`) });
  }
  async function play(notes) {
    await page.evaluate((notes) => window.liveDemo.play(notes), notes);
    await page.waitForTimeout(800);
  }
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await panel.getByText('● Listening locally', { exact: true }).waitFor();
  await play([60]);
  await frame('01-note');
  await play([]);
  await page.getByRole('button', { name: 'Fretboard homework', exact: true }).click();
  const homework = page.getByRole('region', { name: 'Fretboard homework', exact: true });
  await homework.getByRole('button', { name: 'C family', exact: true }).click();
  await homework.getByText('Choose a specific task', { exact: true }).click();
  await homework.getByRole('button', { name: 'Complete a fragment', exact: true }).click();
  await homework.getByRole('button', { name: 'Pause homework', exact: true }).click();
  await page.getByRole('button', { name: 'Play with my guitar', exact: true }).click();
  await panel.getByLabel('Playing task').selectOption('live-homework');
  // Use the notes shown to the learner, not a hidden grading key. This is a
  // disclosed synthetic walkthrough of the same task and capture pipeline.
  const names = await panel.locator('.live-targets span').allTextContents();
  const pitchClasses = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const fragment = names.map((name) => {
    if (!(name in pitchClasses)) throw new Error(`Unexpected demo note ${name}`);
    return 60 + pitchClasses[name];
  });
  if (fragment.length !== 3) throw new Error('Expected the visible three-note fragment');
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await panel.getByText('● Listening locally', { exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Make an attempt', exact: true }).click();
  await panel.getByRole('button', { name: 'Start attempt', exact: true }).click();
  for (const note of fragment) {
    await play([note]);
    await play([]);
  }
  await panel.getByRole('button', { name: 'Finish response', exact: true }).click();
  await panel.getByText('Supported match', { exact: true }).waitFor();
  await frame('02-fragment');
  await panel.getByLabel('Playing task').selectOption('live-progression');
  await panel.getByText('Input stopped', { exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await panel.getByText('● Listening locally', { exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Make an attempt', exact: true }).click();
  await panel.getByRole('button', { name: 'Start attempt', exact: true }).click();
  for (const notes of [
    [48, 52, 55],
    [53, 57, 60],
    [43, 47, 50],
    [48, 52, 55],
  ]) {
    await play(notes);
    await play([]);
  }
  await panel.getByRole('button', { name: 'Finish response', exact: true }).click();
  await panel.getByText('Supported match', { exact: true }).waitFor();
  await frame('03-progression');
  await panel.getByRole('button', { name: 'Start attempt', exact: true }).click();
  await play([57, 60, 64, 67]);
  await panel.getByRole('button', { name: 'Finish response', exact: true }).click();
  await panel.getByText('Could not assess', { exact: true }).waitFor();
  await frame('04-uncertain');
  await panel.getByLabel('Playing task').selectOption('live-connection');
  await panel.getByText('Input stopped', { exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await panel.getByText('● Listening locally', { exact: true }).waitFor();
  await panel.getByRole('button', { name: 'Start attempt', exact: true }).click();
  await play([65]);
  await play([]);
  await play([64]);
  await panel.getByRole('button', { name: 'Finish response', exact: true }).click();
  await panel.getByText('Supported match', { exact: true }).waitFor();
  await frame('05-connection');
  await page.getByRole('button', { name: 'Open teacher', exact: true }).click();
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await teacher
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill('What can we conclude from this response?');
  await teacher.getByRole('button', { name: 'Ask on-device guide', exact: true }).click();
  await teacher.locator('.teacher-message.assistant').last().waitFor();
  await frame('06-teacher');
  await panel.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await writeFile(
    resolve(destination, 'capture.json'),
    JSON.stringify(
      {
        source: 'actual local app',
        input: 'synthetic oscillator fixtures',
        hardwareQualified: false,
        forgeCalls: 0,
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await context.close();
  await browser.close();
}
