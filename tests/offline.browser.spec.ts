import { test, expect, type Page } from '@playwright/test';

interface SavedAttempt {
  id: string;
  outcome: string;
  assisted: boolean;
  response: string;
}

async function attempts(page: Page): Promise<SavedAttempt[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabtopitch');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<SavedAttempt[]>((resolve, reject) => {
      const request = database.transaction('attempts').objectStore('attempts').getAll();
      request.onsuccess = () => {
        database.close();
        resolve(request.result);
      };
      request.onerror = () => {
        database.close();
        reject(request.error);
      };
    });
  });
}

async function ready(page: Page) {
  await expect(page.getByText('A shape, two meanings', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(page.locator('.score-loading')).toHaveCount(0);
  await expect(
    page.locator('.alphatab-host svg text').filter({ hasText: /^D·3$/ }).first(),
  ).toBeVisible();
}

test('production cache supports offline score, audio and durable practice without caching API responses', async ({
  page,
  context,
  baseURL,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  context.on('request', (request) => requests.push(request.url()));

  // Avoid a false pass from Chromium's ordinary HTTP cache. Cache Storage is
  // still available to the installed service worker while offline.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  await page.goto('/#/stage/notation');
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))))
    await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await ready(page);

  const cachedPaths = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys())
        paths.push(new URL(request.url).pathname);
    }
    return paths;
  });
  const worker = cachedPaths.find((path) => /^\/assets\/alphaTab\.worker-[\w-]+\.js$/.test(path));
  const worklet = cachedPaths.find((path) => /^\/assets\/alphaTab\.worklet-[\w-]+\.js$/.test(path));
  expect(worker).toBeDefined();
  expect(worklet).toBeDefined();
  expect(cachedPaths.some(path=>/^\/assets\/capture\.worklet-[\w-]+\.js$/.test(path))).toBe(true);
  expect(cachedPaths.some(path=>/^\/assets\/analysis\.worker-[\w-]+\.js$/.test(path))).toBe(true);
  expect(cachedPaths).toContain('/index.html');
  expect(cachedPaths).toContain('/art/studio.jpg');
  expect(cachedPaths).toContain('/art/bandmate.png');
  expect(cachedPaths).toContain('/soundfont/sonivox.sf2');
  expect(cachedPaths).toContain('/research/voicing-ranker-v1.json');
  expect(cachedPaths.some((path) => /^\/(?:api(?:\/|$)|healthz(?:\/|$))/.test(path))).toBe(false);

  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  const panel = page.locator('.stage-question:visible');
  const cue = await panel.locator('.teaching-cue strong').innerText();
  await panel.getByRole('textbox', { name: 'Type a note name' }).fill(cue);
  await panel.getByRole('button', { name: 'Submit typed answer' }).click();
  await expect.poll(async () => (await attempts(page)).length).toBe(1);
  const onlineHistory = await attempts(page);
  expect(onlineHistory[0]).toMatchObject({ outcome: 'correct', assisted: true, response: cue });

  await page.getByRole('tab', { name: 'Play', exact: true }).click();
  await page.goto('/#/stage/notation');
  await context.setOffline(true);
  const navigation = await page.reload();
  expect(navigation?.fromServiceWorker()).toBe(true);
  await page.goto('/#/stage/notation');
  await ready(page);
  expect(await attempts(page)).toEqual(onlineHistory);

  // Read each production asset with the network disabled. These are cache
  // responses, not mock URLs or JS strings injected into the test browser.
  const assets = [worker!, worklet!, '/soundfont/sonivox.sf2'];
  const responses = assets.map((path) =>
    page.waitForResponse((response) => new URL(response.url()).pathname === path),
  );
  const assetData = await page.evaluate(
    async (paths) =>
      Promise.all(
        paths.map(async (path) => {
          const response = await fetch(path, { cache: 'no-store' });
          const bytes = new Uint8Array(await response.arrayBuffer());
          return {
            path,
            status: response.status,
            size: bytes.length,
            header: String.fromCharCode(...bytes.slice(0, 12)),
          };
        }),
      ),
    assets,
  );
  for (const response of await Promise.all(responses))
    expect(response.fromServiceWorker()).toBe(true);
  for (const asset of assetData) {
    expect(asset.status).toBe(200);
    expect(asset.size).toBeGreaterThan(1000);
  }
  expect(assetData[2].header.slice(0, 4)).toBe('RIFF');
  expect(assetData[2].header.slice(8, 12)).toBe('sfbk');

  const initialTick = Number(
    await page.getByRole('slider', { name: 'Playback position' }).inputValue(),
  );
  await page.getByRole('button', { name: 'Play score', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      Number(await page.getByRole('slider', { name: 'Playback position' }).inputValue()),
    )
    .toBeGreaterThan(initialTick + 120);
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await panel.getByRole('button', { name: 'Show me the answer', exact: true }).click();
  await expect.poll(async () => (await attempts(page)).length).toBe(2);
  const offlineHistory = await attempts(page);
  expect(offlineHistory).toEqual(expect.arrayContaining(onlineHistory));
  expect(offlineHistory.filter((attempt) => attempt.outcome === 'revealed')).toHaveLength(1);

  await page.getByRole('tab', { name: 'Play', exact: true }).click();
  await page.goto('/#/stage/notation');
  await page.reload();
  await ready(page);
  expect(await attempts(page)).toEqual(offlineHistory);
  expect((await attempts(page)).filter((a) => a.outcome === 'revealed')).toHaveLength(1);

  await page.goto('/#/stage/progression');
  await page.getByRole('button', { name: 'Open ii–V–I study' }).click();
  const studio = page.getByRole('region', { name: 'Progression studio', exact: true });
  await studio.locator('.progression-strip button').nth(2).click();
  await studio.locator('.advanced-voicings summary').click();
  await studio.getByRole('combobox', { name: 'Number of voices' }).selectOption('5');
  await studio.locator('.recorded-choice summary').click();
  await studio.getByRole('checkbox', { name: 'Enable experimental candidate ordering' }).check();
  await expect(studio.locator('.recorded-choice').getByRole('status')).toContainText('not bundled');
  await studio.getByText('Recorded Forge research proposal', { exact: true }).click();
  await expect(
    studio.getByRole('region', { name: 'Validated recorded Forge voicing' }).getByRole('button'),
  ).toHaveCount(4);

  await page.getByRole('button', { name: 'Fretboard homework', exact: true }).click();
  const homework = page.getByRole('region', { name: 'Fretboard homework', exact: true });
  await homework.getByRole('button', { name: 'Open C–F–G–C study' }).click();
  await homework.getByText('Choose a specific task', { exact: true }).click();
  await homework.getByRole('button', { name: 'Find a note', exact: true }).click();
  await homework.getByRole('button', { name: 'String 2, fret 1', exact: true }).click();
  await homework.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(homework).toContainText('meets the stated musical constraints');
  await homework.getByRole('button', { name: 'Pause homework' }).click();
  await page.reload();
  await ready(page);
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Fretboard homework', exact: true }).click();
  await homework.getByRole('button', { name: 'Open C–F–G–C study' }).click();
  await expect(homework.getByRole('button', { name: 'Resume saved assignment' })).toBeEnabled();
  await homework.getByRole('button', { name: 'Resume saved assignment' }).click();
  await expect(homework).toContainText('First response saved.');

  const apiResult = await page.evaluate(async () => {
    try {
      await fetch('/api/offline-probe', { cache: 'no-store' });
      return 'unexpected response';
    } catch {
      return 'network unavailable';
    }
  });
  expect(apiResult).toBe('network unavailable');
  expect(
    requests.filter(
      (url) => /^https?:/.test(url) && new URL(url).origin !== new URL(baseURL!).origin,
    ),
  ).toEqual([]);
  expect(requests.filter((url) => new URL(url).pathname === '/api/coach/next')).toEqual([]);
  expect(errors).toEqual([]);
});
