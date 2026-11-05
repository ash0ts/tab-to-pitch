import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { DEMO_PROMPTS } from '../research/connected-homework/protocol.js';
import { syntheticInput } from '../tests/guitar-input-fixture.js';
const directory = resolve(process.env.TTP_DEMO_DIRECTORY ?? '../connected-homework-demo-001');
const destination = join(directory, 'capture');
await mkdir(destination, { recursive: true });
const hosted = process.env.TTP_DEMO_SOURCE !== 'local';
const origin = 'http://127.0.0.1:5420';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1080 },
  recordVideo: { dir: destination, size: { width: 1600, height: 1080 } },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
await syntheticInput(page);
const errors: string[] = [],
  scenes: { name: string; elapsedMs: number }[] = [],
  responses: unknown[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const start = performance.now();
async function scene(name: string) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(destination, `${name}.png`) });
  scenes.push({ name, elapsedMs: performance.now() - start });
}
try {
  await page.goto(`${origin}/#/studio`);
  if (hosted) {
    const { token } = JSON.parse(await readFile(join(directory, 'demo-session.json'), 'utf8'));
    const exchange = await context.request.post(`${origin}/api/invitations/exchange`, {
      data: { invitation: token },
      headers: { Origin: origin },
    });
    if (!exchange.ok()) throw new Error(`Invitation exchange ${exchange.status()}`);
  }
  await expect(
    page.getByRole('button', { name: /^(Start|Continue) practicing$/, exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await scene('01-studio');
  await page.getByRole('button', { name: /^(Start|Continue) practicing$/, exact: true }).click();
  const hw = page.getByRole('region', { name: 'Guitar homework', exact: true });
  await hw.getByRole('button', { name: 'Start guitar homework', exact: true }).click();
  await expect(hw.getByRole('button', { name: 'Play along', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await hw
    .getByRole('region', { name: 'Suggested guitar locations', exact: true })
    .getByRole('button', { name: 'String 1, fret 0', exact: true })
    .click();
  await scene('02-hear-a-note');
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  async function ask(index: number) {
    await page.getByRole('button', { name: 'Open music teacher', exact: true }).click();
    if (hosted) {
      const settings = teacher
        .locator('details')
        .filter({ has: page.getByText('Lesson context and cloud access', { exact: true }) });
      if (!(await settings.evaluate((e: HTMLDetailsElement) => e.open)))
        await settings.locator('summary').click();
      await teacher.getByRole('checkbox', { name: 'Use the experimental Forge teacher' }).check();
      await settings.locator('summary').click();
    }
    await teacher
      .getByRole('textbox', { name: 'Your question', exact: true })
      .fill(DEMO_PROMPTS[index]!);
    const pending = hosted
      ? page.waitForResponse((r) => r.url().endsWith('/api/teacher/next'), {
          timeout: 70000,
        })
      : null;
    await teacher
      .getByRole('button', { name: hosted ? 'Ask teacher' : 'Ask on-device guide', exact: true })
      .click();
    if (pending) {
      const response = await pending,
        body = await response.json();
      responses.push({ index, status: response.status(), body });
      await writeFile(
        join(destination, 'teacher-responses.json'),
        JSON.stringify(responses, null, 2),
      );
      if (!response.ok()) throw new Error(`Teacher HTTP ${response.status()}`);
    }
    await expect(teacher.locator('.teacher-message.assistant').last()).toBeVisible({
      timeout: 10000,
    });
    await teacher.locator('.teacher-conversation').evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await scene(`0${3 + index * 2}-teacher-turn-${index}`);
    const highlight = teacher.getByRole('button', { name: /^Find the / }).first();
    if (await highlight.count()) {
      await highlight.click();
      await scene(`0${4 + index * 2}-teacher-action-${index}`);
    }
    const trace = teacher.getByText('How this response was checked', { exact: true });
    if (await trace.count()) {
      await trace.click();
      await scene(`trace-${index}`);
    }
    await page.getByRole('button', { name: 'Back to my task', exact: true }).click();
  }
  await ask(0);
  async function selectTask(name: string | RegExp) {
    const chooser = hw
      .locator('details')
      .filter({ has: page.getByText('Choose a different task', { exact: true }) });
    if (!(await chooser.evaluate((e: HTMLDetailsElement) => e.open)))
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
  await scene('08-caged-fragment');
  const steps = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await (await import(path)).getLessonData()).lessons.find(
      (l: any) => l.homework?.playing,
    )!.homework.playing.steps;
  });
  for (const step of steps.filter((s: any) => s.objective === 'progression')) {
    await selectTask(step.title);
    await hw.getByRole('button', { name: 'Play along', exact: true }).click();
    const strip = hw.getByRole('navigation', { name: 'Homework progression' });
    await expect(strip.getByRole('button', { name: 'F', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 20000 },
    );
    await scene(`09-progression-${step.region.minFret}`);
    await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
    await hw.getByRole('button', { name: 'Felt secure', exact: true }).click();
  }
  await selectTask('Authored connection · G7 → Cmaj7');
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await page.waitForTimeout(1500);
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await hw.getByRole('button', { name: 'Needs another pass', exact: true }).click();
  await scene('10-specific-retry');
  await ask(1);
  await hw.getByLabel('Response method').selectOption('live');
  await hw.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(hw.getByText('● Listening locally', { exact: true })).toBeVisible();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await page.waitForTimeout(600);
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await expect(hw.getByText('Could not assess', { exact: true })).toBeVisible();
  await scene('11-uncertain-simulated-input');
  await hw.getByLabel('Response method').selectOption('self-report');
  await ask(2);
  await hw.getByRole('button', { name: 'Wrap up session' }).click();
  await scene('12-recap');
  await page.screenshot({ path: join(destination, '12-recap-full.png'), fullPage: true });
  await page
    .getByRole('dialog', { name: 'Keep your next step.' })
    .getByRole('button', { name: 'Save for next time', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /Continue practicing/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Continue practicing/ })).toBeVisible({
    timeout: 30000,
  });
  await scene('13-resume');
  const evidence = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
  await writeFile(
    join(destination, 'lesson-evidence.json'),
    JSON.stringify({ synthetic: true, evidence }, null, 2),
  );
} catch (error) {
  await page.screenshot({ path: join(destination, 'capture-failure.png'), fullPage: true });
  await writeFile(join(destination, 'failure.txt'), String(error));
  throw error;
} finally {
  await writeFile(
    join(destination, 'receipt.json'),
    JSON.stringify(
      {
        scenes,
        responses,
        errors,
        originalStudy: true,
        teacherBackend: hosted ? 'forge' : 'local',
        simulatedLearner: true,
        syntheticInput: true,
        hardwareQualified: false,
      },
      null,
      2,
    ),
  );
  await context.close();
  await browser.close();
}
