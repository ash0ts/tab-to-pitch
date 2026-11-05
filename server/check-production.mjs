import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

// Run against an isolated production build with cloud coaching disabled.
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3199');
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname),
  'Smoke checks require a loopback server',
);
for (let attempt = 0; ; attempt++) {
  try {
    const health = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(1000) });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).cloudEnabled, false);
    break;
  } catch (error) {
    if (attempt === 59) throw error;
    await delay(250);
  }
}
const html = await (await fetch(base)).text();
const entry = html.match(/<script[^>]+src="([^"]+\.js)"/u)?.[1];
assert(entry, 'Built entry script is present');
const entrySource = await (await fetch(new URL(entry, base))).text();
const audioAssets = [
  ...new Set(entrySource.match(/\/assets\/alphaTab\.(?:worker|worklet)-[\w-]+\.js/gu)),
];
assert.equal(audioAssets.length, 2, 'Worker and worklet are bundled');
for (const asset of [...audioAssets, '/sw.js']) {
  const response = await fetch(new URL(asset, base));
  assert.equal(response.status, 200, asset);
  assert.match(
    response.headers.get('content-type') ?? '',
    /(?:text|application)\/javascript/u,
    asset,
  );
  assert(!(await response.text()).startsWith('<!'), 'JavaScript is never an HTML fallback');
}
const soundfont = await fetch(new URL('/soundfont/sonivox.sf2', base));
assert.equal(soundfont.status, 200);
assert.doesNotMatch(soundfont.headers.get('content-type') ?? '', /text\/html/u);
const bytes = Buffer.from(await soundfont.arrayBuffer());
assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
assert.equal(bytes.subarray(8, 12).toString(), 'sfbk');
for (const path of ['/assets/missing.js', '/soundfont/missing.sf2', '/api/missing']) {
  assert.equal((await fetch(new URL(path, base))).status, 404, path);
}
const session = await fetch(new URL('/api/session', base));
assert.equal(session.headers.get('cache-control'), 'no-store');

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium' });
const context = await browser.newContext();
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(base.href);
  const play = page.getByRole('button', { name: 'Play score', exact: true });
  await expect(play).toBeEnabled({ timeout: 30_000 });
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Service worker did not install')), 30_000),
      ),
    ]);
  });
  // The first installed worker controls the next navigation; updates stay user-triggered.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 })
    .toBe(true);
  await expect(play).toBeEnabled({ timeout: 30_000 });
  const slider = page.getByRole('slider', { name: 'Playback position' });
  const initialTick = Number(await slider.inputValue());
  await play.click();
  await expect
    .poll(async () => Number(await slider.inputValue()))
    .toBeGreaterThan(initialTick + 120);
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'A shape, two meanings', exact: true }),
  ).toBeVisible();
  await expect(play).toBeEnabled({ timeout: 30_000 });
  const offlineTick = Number(await slider.inputValue());
  await play.click();
  await expect
    .poll(async () => Number(await slider.inputValue()))
    .toBeGreaterThan(offlineTick + 120);
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await expect(page.locator('.learning-panel:visible').getByTestId('exercise-card')).toBeVisible();
  assert.deepEqual(errors, []);
  console.info(
    'Production checks passed: cloud disabled, asset MIME/signatures, real audio clock, offline reload/playback/practice.',
  );
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await context.tracing.stop({ path: 'test-results/production-trace.zip' });
  throw error;
} finally {
  await browser.close();
}
