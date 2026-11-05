import { chromium } from '@playwright/test';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve(process.env.STUDIO_CAPTURE_DIR ?? '.context/studio-demo');
const url = process.env.STUDIO_URL ?? 'http://127.0.0.1:5204';
await mkdir(out, { recursive: true });
// Silent PCM exercises the real local pipeline's abstention path. It is not guitar data.
const fixture = resolve(out, 'silent-input.wav');
const samples = 48000 * 10;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24);
wav.writeUInt32LE(96000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples * 2, 40);
await writeFile(fixture, wav);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${fixture}`,
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: `${out}/studio-video`, size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const click = async (name) => page.getByRole('button', { name, exact: true }).click();
const pause = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await pause(500);
  await page.screenshot({ path: `${out}/${name}.png` });
};
await page.goto(url);
await page.getByRole('button', { name: 'Continue practicing' }).waitFor();
await pause(2000);
await shot('studio-final');
await click('Continue practicing');
await click('Start homework');
await pause(1000);
await page.locator('.homework-workspace').scrollIntoViewIfNeeded();
await shot('caged-final');
await pause(1800);
await page.getByText('Choose some help', { exact: true }).click();
await click('Root landmark');
await pause(1400);
await page.goto(`${url}/#/stage/progression`);
await click('Open ii–V–I study');
await pause(1000);
await click('Frets 5–9');
await page.locator('.progression-studio').scrollIntoViewIfNeeded();
await shot('progression-final');
await click('Preview variation');
await pause(3000);
await click('Original score');
await page.goto(`${url}/#/stage/timeline`);
await click('Play score');
await pause(3000);
await shot('rhythm-final');
await pause(1200);
await click('Pause playback');
await page.goto(`${url}/#/stage/listening`);
await click('Try a listening question');
await page.locator('.listening-panel').scrollIntoViewIfNeeded();
await shot('listening-final');
await pause(2000);
await page.goto(`${url}/#/stage/knowledge`);
await click('Try a knowledge challenge');
await page.getByRole('textbox', { name: 'Type a note name', exact: true }).fill('F#');
await click('Submit typed answer');
await pause(1000);
await shot('challenge-final');
await pause(1600);
await page.goto(`${url}/#/stage/live`);
await pause(2000);
await click('Connect guitar');
await page.getByText('● Listening locally', { exact: true }).waitFor({ timeout: 15000 });
await click('Make an attempt');
await click('Start attempt');
await pause(2000);
await click('Finish response');
await page.getByText('Could not assess', { exact: true }).waitFor();
await page.locator('.live-feedback').evaluate((el) => el.scrollIntoView({ block: 'center' }));
await shot('unassessed-silent-fixture');
await pause(1800);
await click('Stop listening');
await page.goto(`${url}/#/research/homework`);
await shot('research-final');
await pause(1000);
const video = page.video();
await context.close();
await copyFile(await video.path(), `${out}/studio-walkthrough.webm`);
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await mobile.goto(url);
await mobile.waitForTimeout(1000);
await mobile.screenshot({ path: `${out}/studio-mobile-final.png`, fullPage: true });
await browser.close();
console.log(JSON.stringify({ errors, video: `${out}/studio-walkthrough.webm` }));
