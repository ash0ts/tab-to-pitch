import { chromium, devices, expect, type Locator } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve('../tabtopitch-listening-captures-v2');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  recordVideo: { dir, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage(),
  errors: string[] = [],
  marks: Record<string, number> = {};
page.on('pageerror', (e) => errors.push(e.message));
const start = Date.now();
async function still(name: string, element: Locator) {
  await element.evaluate((e) =>
    window.scrollTo({ top: scrollY + e.getBoundingClientRect().top - 24, behavior: 'instant' }),
  );
  await page.waitForTimeout(1500);
  marks[name] = (Date.now() - start) / 1000;
  await page.screenshot({ path: resolve(dir, `${name}.png`) });
}
await page.goto('http://127.0.0.1:5194');
await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
  timeout: 30000,
});
await page.getByRole('button', { name: 'Choose a song' }).click();
await still('01-playlist', page.getByRole('region', { name: 'Learn from my songs' }));
await page.getByRole('button', { name: 'Four chords, one key' }).click();
const lesson = page.getByRole('region', { name: 'Listening lesson' }),
  teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
await lesson.getByLabel('Listening difficulty').selectOption('recall');
await lesson.getByRole('button', { name: 'Try a listening question' }).click();
await lesson.getByRole('button', { name: 'Hear synthesized passage' }).click();
await still('02-listen-before-labels', lesson);
for (const [i, value] of ['D', 'G7', 'Cmaj7', 'Am7'].entries())
  await lesson.getByLabel(`Chord at change ${i + 1}`).selectOption(value);
await lesson.getByRole('button', { name: 'Check progression' }).click();
await lesson.getByRole('button', { name: 'Pause audio', exact: true }).click();
await still('03-root-versus-quality', lesson.locator('.listening-feedback'));
await teacher.getByRole('button', { name: 'Open teacher', exact: true }).click();
await teacher
  .getByRole('textbox', { name: 'Your question', exact: true })
  .fill(
    'I missed the quality of the first chord. Help me hear the difference and find it on the guitar.',
  );
await teacher.getByRole('button', { name: 'Ask on-device guide' }).click();
await expect(teacher.getByRole('log')).toContainText('Your recorded roots matched');
await still('04-targeted-local-guide', teacher);
await lesson.getByRole('button', { name: 'Find this progression on the neck' }).click();
const studio = page.getByRole('region', { name: 'Progression studio', exact: true });
await studio.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
await expect(page.locator('.shape-navigation')).toContainText('variation 1');
await still('05-fretboard-application', studio);
await lesson.getByLabel('Listening difficulty').selectOption('transfer');
await expect(lesson).toContainText('Key: G major');
await still('06-transfer-key', lesson);
const video = page.video();
await context.close();
if (video) await video.saveAs(resolve(dir, 'listening-workflow.webm'));
const mobile = await browser.newPage({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
await mobile.goto('http://127.0.0.1:5194');
await expect(mobile.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
  timeout: 30000,
});
await mobile.getByRole('button', { name: 'Choose a song' }).click();
await mobile.getByRole('button', { name: 'Four chords, one key' }).click();
const ml = mobile.getByRole('region', { name: 'Listening lesson' });
await ml.getByRole('button', { name: 'Try a listening question' }).click();
await ml.evaluate((e) =>
  window.scrollTo({ top: scrollY + e.getBoundingClientRect().top - 12, behavior: 'instant' }),
);
await mobile.screenshot({ path: resolve(dir, '07-mobile-listening.png') });
await browser.close();
await writeFile(
  resolve(dir, 'capture-receipt.json'),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      url: 'http://127.0.0.1:5194',
      source: 'Original TabToPitch CC0 study',
      marks,
      errors,
      description:
        'Actual isolated application interactions. Scripted wrong answer and on-device guide, explicitly labeled. Video is silent; no popular-song audio redistributed. Screen answers demonstrate behavior, not learner outcomes.',
    },
    null,
    2,
  ),
);
if (errors.length) throw new Error(errors.join('\n'));
console.info({ dir, marks });
