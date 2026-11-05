import { chromium, devices, expect, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(process.env.TABTOPITCH_CAPTURE_DIR ?? '../tabtopitch-teacher-captures');
const url = process.env.TABTOPITCH_DEMO_URL ?? 'http://127.0.0.1:5190';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: directory, size: { width: 1440, height: 1080 } },
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const started = Date.now();
const marks: Record<string, number> = {};
async function focus(locator: Locator, offset = 20) {
  await locator.evaluate(
    (element, top) =>
      window.scrollTo({
        top: scrollY + element.getBoundingClientRect().top - top,
        behavior: 'instant',
      }),
    offset,
  );
}
async function still(name: string, locator?: Locator) {
  if (locator) await focus(locator);
  await page.waitForTimeout(1600);
  marks[name] = (Date.now() - started) / 1000;
  await page.screenshot({ path: resolve(directory, `${name}.png`) });
}
async function openStudy(target: Page) {
  await target.goto(url);
  await expect(target.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await target.getByRole('tab', { name: 'Understand', exact: true }).click();
  await target.getByRole('button', { name: 'Open ii–V–I study' }).click();
  await target.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
  await expect(target.locator('.shape-navigation')).toContainText('variation 1');
  await target.getByRole('button', { name: 'Open teacher', exact: true }).click();
}
await openStudy(page);
const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
const card = page.getByTestId('exercise-card');
async function ask(text: string) {
  const before = await teacher.locator('.teacher-message.assistant').count();
  await teacher.getByRole('textbox', { name: 'Your question', exact: true }).fill(text);
  await teacher.getByRole('button', { name: 'Ask on-device guide', exact: true }).click();
  await expect(teacher.locator('.teacher-message.assistant')).toHaveCount(before + 1);
  await teacher.locator('.teacher-conversation').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
}
await ask('Help me name the chord roles in this passage.');
await still('01-chord-role-conversation', teacher);
await teacher.getByRole('button', { name: 'Try this question', exact: true }).click();
await still('02-recall-with-conversation-hidden', card);
await card.getByRole('textbox', { name: 'Type your answer', exact: true }).fill('minor third');
await card.getByRole('button', { name: 'Submit typed answer' }).click();
await expect(card).toContainText('Correct.');
await still('03-role-feedback', card);
await card.getByRole('button', { name: 'Continue with teacher' }).click();
await teacher.getByRole('button', { name: 'Connect the chords', exact: true }).click();
await ask('Show me how G7 resolves to Cmaj7.');
await still('04-connection-conversation', teacher);
await teacher.getByRole('button', { name: 'Try this question', exact: true }).click();
await card
  .getByRole('textbox', { name: 'Type starting string:fret to ending string:fret' })
  .fill('2:6 -> 2:5');
await card.getByRole('button', { name: 'Submit typed answer' }).click();
await expect(card).toContainText('Correct.');
await still('05-exact-connection-feedback', card);
await card.getByRole('button', { name: 'Continue with teacher' }).click();
await teacher.getByRole('button', { name: 'Extensions and rootless chords', exact: true }).click();
await ask('What does adding a ninth change?');
await still('06-extension-conversation', teacher);
await teacher.getByRole('button', { name: 'Try this question', exact: true }).click();
await card.getByRole('textbox', { name: 'Type a note name', exact: true }).fill('E');
await card.getByRole('button', { name: 'Submit typed answer' }).click();
await expect(card).toContainText('Correct.');
await still('07-added-ninth-feedback', card);
await card.getByRole('button', { name: 'Continue with teacher' }).click();
await ask('Explain the rootless shape with and without the bass.');
await teacher.getByRole('button', { name: 'Hear the upper shape alone' }).click();
await teacher.locator('.teacher-conversation').evaluate((element) => {
  element.scrollTop = element.scrollHeight;
});
await still('08-rootless-context', teacher.locator('.teacher-conversation'));
await teacher.getByRole('button', { name: 'Hear with the bass' }).click();
await still('09-rootless-over-bass', teacher.locator('.teacher-actions'));
const video = page.video();
await context.close();
if (video) await video.saveAs(resolve(directory, 'teacher-workflow.webm'));
const mobile = await browser.newPage({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
await openStudy(mobile);
const mobileTeacher = mobile.getByRole('region', { name: 'Music teacher', exact: true });
await mobileTeacher
  .getByRole('textbox', { name: 'Your question', exact: true })
  .fill('Help me name the chord roles in this passage.');
await mobileTeacher.getByRole('button', { name: 'Ask on-device guide', exact: true }).click();
await expect(mobileTeacher.locator('.teacher-message.assistant')).toBeVisible();
await focus(mobileTeacher);
await mobile.screenshot({ path: resolve(directory, '10-mobile-conversation.png') });
await mobileTeacher.getByRole('button', { name: 'Try this question' }).click();
await expect(mobile.getByTestId('exercise-card')).toBeVisible();
await mobile.screenshot({ path: resolve(directory, '11-mobile-recall.png') });
await browser.close();
await writeFile(
  resolve(directory, 'capture-receipt.json'),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      url,
      source: 'Original TabToPitch CC0 progression study',
      workflow:
        'Actual isolated Playwright interactions with scripted correct answers. The on-device guide is explicitly labeled; no cloud response is mocked. These demonstrate grading, not learner outcomes. Audio is not included in the browser recording.',
      marks,
      errors,
    },
    null,
    2,
  ),
);
if (errors.length) throw new Error(errors.join('\n'));
console.log({ directory, marks, errors });
