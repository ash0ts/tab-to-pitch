import { chromium, devices, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(
  process.env.TABTOPITCH_CAPTURE_DIR ?? '../tabtopitch-progression-captures',
);
const url = process.env.TABTOPITCH_DEMO_URL ?? 'http://127.0.0.1:5190';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: directory, size: { width: 1440, height: 1080 } },
});
const page = await context.newPage();
const clock = Date.now();
const marks: Record<string, number> = {};
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
async function still(name: string, delay = 1400) {
  await page.waitForTimeout(delay);
  marks[name] = (Date.now() - clock) / 1000;
  await page.screenshot({ path: resolve(directory, `${name}.png`) });
}
async function focusStudio() {
  await page
    .locator('.progression-heading')
    .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 20));
}
await page.goto(url);
await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
  timeout: 30000,
});
await page.getByRole('tab', { name: 'Understand', exact: true }).click();
await page.getByRole('button', { name: 'Open ii–V–I study' }).click();
await expect(page.getByRole('button', { name: 'Preview variation', exact: true })).toBeVisible();
await page.locator('.alphatab-host').scrollIntoViewIfNeeded();
await expect(page.locator('.alphatab-host svg text').first()).toBeVisible();
await focusStudio();
marks.progressionStart = (Date.now() - clock) / 1000;
await still('01-original-progression');
await page.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
await expect(page.locator('.shape-navigation')).toContainText('variation 1 of 3');
await still('02-moved-progression');
await page.getByRole('button', { name: 'Add color', exact: true }).click();
await page.getByRole('combobox', { name: 'Chord color', exact: true }).selectOption('m9');
await expect(page.locator('.variation-detail')).toContainText('Omitted: fifth');
await page
  .locator('.variation-operation')
  .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 130));
await still('03-added-ninth', 2000);
await page.getByRole('button', { name: 'Preview variation', exact: true }).click();
await page.locator('.alphatab-host').scrollIntoViewIfNeeded();
await expect(page.locator('.alphatab-host svg text').first()).toBeVisible();
await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled();
await page.getByRole('button', { name: 'Play score', exact: true }).click();
await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
await still('04-derived-score-playing', 2400);
await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
marks.progressionEnd = (Date.now() - clock) / 1000;
await page.getByText('Describe a variation', { exact: true }).click();
await page
  .locator('.arrangement-prompt')
  .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 35));
marks.localStart = (Date.now() - clock) / 1000;
await still('05-local-request');
await page.getByRole('button', { name: 'Ask local planner', exact: true }).click();
await expect(page.locator('.proposal-result')).toContainText('Local planner · proposal');
await still('06-validated-local-proposal', 2400);
await page.getByRole('button', { name: 'Preview this proposal', exact: true }).click();
await focusStudio();
await still('07-proposal-controls');
marks.localEnd = (Date.now() - clock) / 1000;
await page.getByText('Recorded Forge research proposal', { exact: true }).click();
await expect(page.getByRole('region', { name: 'Validated recorded Forge voicing' })).toBeVisible();
await page
  .locator('.recorded-arrangement')
  .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 110));
marks.forgeStart = (Date.now() - clock) / 1000;
await still('10-recorded-forge-proposal', 2000);
await page
  .getByRole('group', { name: 'Recorded proposal chords' })
  .getByRole('button', { name: 'Gmaj7', exact: true })
  .click();
await still('11-recorded-forge-next-chord', 1600);
marks.forgeEnd = (Date.now() - clock) / 1000;

const video = page.video();
await context.close();
if (video) await video.saveAs(resolve(directory, 'progression-workflow.webm'));
const mobile = await browser.newPage({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
await mobile.goto(url);
await mobile.getByRole('tab', { name: 'Understand', exact: true }).click();
await mobile.getByRole('button', { name: 'Open ii–V–I study' }).click();
await mobile.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
await expect(mobile.locator('.shape-navigation')).toContainText('variation 1 of 3');
await mobile
  .locator('.shape-navigation')
  .evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 120));
await mobile.screenshot({ path: resolve(directory, '08-mobile-voicing.png') });
await mobile.getByRole('button', { name: 'Key, modes and practice', exact: true }).click();
await mobile.getByRole('combobox', { name: 'Scale mode', exact: true }).selectOption('dorian');
await mobile.screenshot({ path: resolve(directory, '09-mobile-mode-sheet.png') });
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
await writeFile(
  resolve(directory, 'capture-receipt.json'),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      url,
      source: 'Original TabToPitch CC0 progression study',
      workflow:
        'Actual browser interactions; local planner explicitly labeled, no cloud response mocked.',
      marks,
      errors,
    },
    null,
    2,
  ),
);
console.log({ directory, marks, errors });
