import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { syntheticInput, play } from '../tests/guitar-input-fixture.js';

// Original study only. No cloud calls, physical playing claims or user browser tabs.
const destination = resolve(process.argv[2] ?? '../guitar-homework-walkthrough');
const origin = process.env.TTP_CAPTURE_ORIGIN ?? 'http://127.0.0.1:5419';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  recordVideo: { dir: destination, size: { width: 1440, height: 1080 } },
});
const page = await context.newPage();
await syntheticInput(page);
const errors: string[] = [];
const consoleMessages: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => consoleMessages.push(message.text()));
const scenes: { name: string; elapsedMs: number }[] = [];
const start = performance.now();
async function scene(name: string, caption: string) {
  await page.evaluate((text) => {
    let label = document.getElementById('capture-caption');
    if (!label) {
      label = document.createElement('div');
      label.id = 'capture-caption';
      Object.assign(label.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        zIndex: '99999',
        padding: '9px 24px',
        background: '#132420',
        color: '#fff',
        font: '16px sans-serif',
        pointerEvents: 'none',
      });
      document.body.append(label);
    }
    label.textContent = `Original-song walkthrough · simulated learner/input · ${text}`;
  }, caption);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: resolve(destination, `${name}.png`) });
  scenes.push({ name, elapsedMs: performance.now() - start });
}
try {
  await page.goto(`${origin}/#/studio`);
  await expect(page.getByRole('button', { name: 'Continue practicing', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await scene('01-studio', 'A short practice set. No interface required.');
  await page.getByRole('button', { name: 'Continue practicing', exact: true }).click();
  const hw = page.getByRole('region', { name: 'Guitar homework', exact: true });
  await hw.getByRole('button', { name: 'Start guitar homework', exact: true }).click();
  await hw.scrollIntoViewIfNeeded();
  await scene('02-find-c', 'Find C on the guitar; location checks remain separate.');
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await page.waitForTimeout(1200);
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await hw.getByRole('button', { name: 'Needs another pass', exact: true }).click();
  await scene('03-self-report', 'A self-report stays a self-report.');
  async function selectTask(name: string | RegExp) {
    const chooser = hw
      .locator('details')
      .filter({ has: page.getByText('Choose a different task', { exact: true }) });
    if (!(await chooser.evaluate((e) => (e as HTMLDetailsElement).open)))
      await chooser.locator('summary').click();
    await chooser
      .getByRole('button', { name, exact: typeof name === 'string' })
      .first()
      .click();
    await chooser.locator('summary').click();
    await hw.scrollIntoViewIfNeeded();
  }
  await selectTask(/family fragment/);
  await hw.getByRole('button', { name: 'Hear example', exact: true }).click();
  await scene('04-fragment', 'Pick a small CAGED fragment and name its chord roles.');
  const tasks = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    const lessons = (await import(path)).getMemoryLessonData().lessons;
    return lessons.find((l: { homework?: { playing?: unknown } }) => l.homework?.playing)!.homework
      .playing.steps;
  });
  const neighbors = tasks.filter((s: { family: string | null }) => s.family);
  if (neighbors.length > 1) {
    await selectTask(neighbors[1].title);
    await scene('05-neighbor', 'Same harmony, another CAGED landmark.');
  }
  for (const [index, step] of tasks
    .filter((s: { objective: string }) => s.objective === 'progression')
    .entries()) {
    await selectTask(step.title);
    await hw.getByRole('button', { name: 'Play along', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeEnabled({
      timeout: 15000,
    });
    const strip = hw.getByRole('navigation', { name: 'Homework progression' });
    await expect(strip.getByRole('button', { name: 'F', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 20000 },
    );
    await expect(strip.getByRole('button', { name: 'G', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 10000 },
    );
    await scene(
      `0${6 + index}-progression`,
      'Follow C–F–G–C with the backing; change the neck region.',
    );
    await expect(strip.getByRole('button', { name: 'C', exact: true }).last()).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 10000 },
    );
    await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
    await hw.getByRole('button', { name: 'Felt secure', exact: true }).click();
  }
  await selectTask('Authored connection · G7 → Cmaj7');
  await hw.getByLabel('Response method').selectOption('live');
  await hw.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(hw.getByText('● Listening locally', { exact: true })).toBeVisible();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await play(page, [], 0.3);
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await expect(hw.getByText('Could not assess', { exact: true })).toBeVisible();
  await hw.getByText('Could not assess', { exact: true }).scrollIntoViewIfNeeded();
  await scene('08-uncertain', 'Silence is unassessed. Isolate the notes and retry.');
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await play(page, [65]);
  await play(page, [], 0.2);
  await play(page, [64]);
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await expect(hw.getByText('Supported match', { exact: true })).toBeVisible();
  await hw.getByText('Supported match', { exact: true }).scrollIntoViewIfNeeded();
  await scene('09-connection', 'Synthetic F→E: sound supported; fingering and timing unverified.');
  await play(page, [], 0.2);
  await hw.getByLabel('Response method').selectOption('self-report');
  await page.getByRole('button', { name: 'Open music teacher', exact: true }).click();
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await teacher
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill(
      'The first response was uncertain. Help me isolate the change, without claiming you saw my fingering.',
    );
  await teacher.getByRole('button', { name: 'Ask on-device guide', exact: true }).click();
  await expect(teacher.getByRole('log')).not.toBeEmpty();
  await scene('10-local-guide', 'The local guide offers a follow-up; no paid model turn.');
  await page.getByRole('button', { name: 'Back to my task', exact: true }).click();
  await page.getByRole('button', { name: 'Save for next time', exact: true }).first().click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save for next time', exact: true })
    .click();
  await page.reload();
  await expect(page.locator('.resume-line')).toContainText('Authored connection');
  await scene('11-resume', 'Save the exact musical target and return when you choose.');
  const evidence = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
  await writeFile(
    resolve(destination, 'authored-evidence.json'),
    JSON.stringify({ simulated: true, scenes, errors, evidence }, null, 2),
  );
  if (errors.length) throw new Error(errors.join('\n'));
} catch (error) {
  await page.screenshot({ path: resolve(destination, 'failure.png') });
  await writeFile(
    resolve(destination, 'failure.json'),
    JSON.stringify(
      { errors, consoleMessages, message: String(error), scene: scenes.at(-1) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
