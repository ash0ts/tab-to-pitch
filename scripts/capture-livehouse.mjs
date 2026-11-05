import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
// Isolated original-song demonstration. Never opens a recording device or calls inference.
const out = resolve(process.argv[2] ?? '../livehouse-walkthrough');
const origin = process.env.TTP_CAPTURE_ORIGIN ?? 'http://127.0.0.1:5419';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: out + '/video', size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await pause(450);
  await page.screenshot({ path: `${out}/${name}.png` });
};
await page.goto(`${origin}/#/studio`);
await page.getByRole('button', { name: 'Start practicing', exact: true }).waitFor();
await pause(800);
await shot('studio');
await pause(1200);
await page
  .locator('.setlist-choices')
  .getByRole('button', { name: /One progression/ })
  .click();
await pause(1000);
await page
  .locator('.setlist-choices')
  .getByRole('button', { name: /Find your way/ })
  .click();
await page.getByRole('button', { name: 'Start practicing', exact: true }).click();
await page.getByRole('button', { name: 'Use the original C–F–G–C study', exact: true }).click();
await page.getByRole('button', { name: 'Start guitar homework', exact: true }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await shot('find-c');
await pause(1000);
await page.getByRole('button', { name: 'Play along', exact: true }).click();
await pause(2000);
await page.getByRole('button', { name: 'Finish attempt', exact: true }).click();
await pause(800);
await page.getByRole('button', { name: 'Needs another pass', exact: true }).click();
await shot('feedback');
await pause(1000);
await page.getByRole('button', { name: '02 Connect shapes', exact: true }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await shot('caged');
await pause(1000);
await page.getByRole('button', { name: '03 Play changes', exact: true }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await shot('progression');
await pause(1000);
await page.getByRole('button', { name: '04 Make music', exact: true }).click();
await page.evaluate(() => window.scrollTo(0, 0));
await shot('connection');
await pause(1200);
await page.getByRole('button', { name: 'Wrap up session', exact: true }).click();
await page
  .getByRole('dialog')
  .getByRole('textbox')
  .fill('Play F to E in another position next time.');
await shot('recap');
await pause(1000);
await page
  .getByRole('dialog')
  .getByRole('button', { name: 'Save for next time', exact: true })
  .click();
await pause(500);
await page.reload();
await pause(700);
await shot('resume');
const video = page.video();
await ctx.close();
await copyFile(await video.path(), out + '/practice-flow.webm');
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  deviceScaleFactor: 1,
});
const m = await mobile.newPage();
m.on('pageerror', (e) => errors.push(e.message));
await m.goto(`${origin}/#/studio`);
await m.getByRole('button', { name: 'Start practicing', exact: true }).waitFor();
await m.waitForTimeout(500);
await m.screenshot({ path: out + '/mobile-studio.png', fullPage: true });
const width = await m.evaluate(() => ({
  viewport: innerWidth,
  document: document.documentElement.scrollWidth,
}));
await m.getByRole('button', { name: 'Start practicing', exact: true }).click();
await m.getByRole('button', { name: 'Start guitar homework', exact: true }).click();
await m.evaluate(() => window.scrollTo(0, 0));
await m.screenshot({ path: out + '/mobile-task.png', fullPage: true });
await mobile.close();
const research = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await research.goto(`${origin}/#/research`);
await research.getByRole('heading', { name: 'What the experiments actually showed' }).waitFor();
await research.getByRole('link', { name: 'Forge experiments', exact: true }).click();
await research.screenshot({ path: out + '/forge-evidence.png' });
await research.close();
await browser.close();
await writeFile(
  out + '/capture.json',
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      source: 'original authored C–F–G–C study',
      scriptedSelfReport: 'needs-another-pass',
      microphone: false,
      inferenceCalls: 0,
      pageErrors: errors,
      mobileWidth: width,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ pageErrors: errors, mobileWidth: width }));
