import { chromium, devices, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(process.env.TABTOPITCH_CAPTURE_DIR ?? '../teaching-practice-captures');
const url = process.env.TABTOPITCH_DEMO_URL ?? 'http://127.0.0.1:5298';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  recordVideo: { dir: directory, size: { width: 1440, height: 1080 } },
});
const page = await context.newPage(),
  errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const marks: Record<string, number> = {},
  started = Date.now();
const workspace = page.getByRole('region', { name: 'Practice workspace', exact: true });
async function focus() {
  await workspace.evaluate((e) =>
    window.scrollTo({ top: scrollY + e.getBoundingClientRect().top - 24, behavior: 'instant' }),
  );
}
async function still(name: string) {
  await focus();
  await page.waitForTimeout(1600);
  marks[name] = (Date.now() - started) / 1000;
  await page.screenshot({ path: resolve(directory, `${name}.png`) });
}
try {
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await workspace
    .getByRole('button', { name: 'Play this passage more musically', exact: true })
    .click();
  await workspace
    .getByRole('combobox', { name: 'Approach', exact: true })
    .selectOption('Compare two versions');
  await workspace.getByRole('button', { name: 'Rhythm & timing', exact: true }).click();
  await workspace.getByRole('button', { name: 'Hear original study', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await still('01-hear-and-place-the-change');
  await workspace.getByRole('button', { name: 'Stop', exact: true }).click();
  await workspace.getByRole('button', { name: 'Check my response', exact: true }).click();
  await workspace.getByText('Choose some help', { exact: true }).click();
  await workspace.getByRole('button', { name: 'Attention cue', exact: true }).click();
  await still('02-a-cue-without-the-answer');
  await workspace.getByRole('button', { name: 'Build a phrase', exact: true }).click();
  await workspace
    .getByRole('combobox', { name: 'Approach', exact: true })
    .selectOption('Make and revise');
  await workspace.getByRole('button', { name: 'Check my response', exact: true }).click();
  await still('03-a-useful-next-attempt');
  for (const [label, pitch] of [
    ['Bar 1, beat 1', '55'],
    ['Bar 1, beat 2', '53'],
    ['Bar 2, beat 1', '52'],
  ])
    await workspace.getByRole('combobox', { name: label!, exact: true }).selectOption(pitch!);
  await workspace.getByRole('button', { name: 'Hear my response', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await page.waitForTimeout(2400);
  await workspace.getByRole('button', { name: 'Stop', exact: true }).click();
  await workspace.getByRole('button', { name: 'Try this revision', exact: true }).click();
  await still('04-another-valid-phrase');
  await workspace.getByText('Reflect & bookmark (optional)', { exact: true }).click();
  await workspace
    .getByRole('textbox', { name: 'What helped, or what would you try next?' })
    .fill(
      'Leaving a rest helped me hear the arrival. Next I want to find F → E higher on the neck.',
    );
  await workspace.getByRole('button', { name: 'Save reflection & bookmark', exact: true }).click();
  await still('05-reflection-and-bookmark');
  await page.getByRole('button', { name: 'Open teacher', exact: true }).click();
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await teacher
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill('I do not want to keep repeating it. Can we compare two versions instead?');
  await teacher.getByRole('button', { name: 'Ask on-device guide', exact: true }).click();
  await expect(teacher.locator('.teacher-message.assistant')).toBeVisible();
  await still('06-change-the-approach');
  const evidence = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
  await writeFile(resolve(directory, 'session-evidence.json'), JSON.stringify(evidence, null, 2));
  await context.close();
  const video = await page.video()?.path();
  const mobile = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const phone = await mobile.newPage();
  await phone.goto(url);
  await phone.getByRole('button', { name: 'Make something with this idea', exact: true }).click();
  await phone.getByRole('button', { name: 'Build a phrase', exact: true }).click();
  const task = phone.getByTestId('musicianship-task');
  await task.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: resolve(directory, '07-mobile-task.png') });
  await phone.getByRole('button', { name: 'Open teacher', exact: true }).click();
  await phone.screenshot({ path: resolve(directory, '08-mobile-teacher-masking.png') });
  await mobile.close();
  await writeFile(
    resolve(directory, 'capture.json'),
    JSON.stringify(
      {
        url,
        capturedAt: new Date().toISOString(),
        video,
        marks,
        errors,
        actor: 'authored on-device policy',
        cloudCalls: 0,
        audio: 'video capture has no audio; actual player-start events checked',
        originalMusic: true,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join('; '));
  console.log(JSON.stringify({ directory, video, marks, errors }));
} finally {
  await browser.close();
}
