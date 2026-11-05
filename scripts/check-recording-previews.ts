import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve('../tabtopitch-recording-checks');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const title of ['With or Without You', 'Stand by Me', 'Let It Be']) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto('http://127.0.0.1:5194');
  await expect(page.getByRole('button', { name: 'Choose a song' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose a song' }).click();
  const row = page.locator('.song-row').filter({ has: page.getByText(title, { exact: true }) });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Preview recording · quiz pending' }).click();
  const region = page.getByRole('region', { name: 'Recording preview' });
  await region.scrollIntoViewIfNeeded();
  await page.waitForTimeout(12000);
  const frame = page.frames().find((f) => f.url().includes('youtube.com/embed/'));
  const text = frame
    ? await frame
        .locator('body')
        .innerText({ timeout: 4000 })
        .catch(() => 'Frame text unavailable')
    : '';
  results.push({
    title,
    iframeUrl: frame?.url(),
    visibleAppStatus: await region.innerText(),
    playerText: text,
    checkedAt: new Date().toISOString(),
    audioQualified: false,
    alignmentQualified: false,
  });
  await page.screenshot({ path: resolve(dir, `${title.replaceAll(' ', '-')}.png`) });
  await page.close();
}
await browser.close();
await writeFile(resolve(dir, 'receipt.json'), JSON.stringify(results, null, 2));
console.info(
  results.map((r) => ({
    title: r.title,
    iframe: !!r.iframeUrl,
    playerText: r.playerText.slice(0, 500),
    audioQualified: false,
    alignmentQualified: false,
  })),
);
