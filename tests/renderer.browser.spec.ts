import { test, expect } from '@playwright/test';

test('waits for alphaTab viewport initialization when the first animation frame is delayed', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let id = 0;
    window.requestAnimationFrame = (callback) => {
      pending.set(++id, callback);
      return id;
    };
    window.cancelAnimationFrame = (handle) => pending.delete(handle);
    Object.assign(window, {
      releaseInitialFrames: () => {
        window.requestAnimationFrame = request;
        window.cancelAnimationFrame = cancel;
        for (const callback of pending.values()) callback(performance.now());
        pending.clear();
      },
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A shape, two meanings', exact: true }),
  ).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page
    .getByRole('button', { name: 'Frets', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForTimeout(500);
  await expect(page.locator('.alphatab-host svg')).toHaveCount(0);
  await page.evaluate(() => {
    (window as typeof window & { releaseInitialFrames: () => void }).releaseInitialFrames();
  });
  await expect(page.locator('.score-loading')).toHaveCount(0);
  await expect(
    page.locator('.alphatab-host svg text').filter({ hasText: /^[A-G][#b]?(?:\d)?(?:·\d+)?$/ }),
  ).toHaveCount(0);
});

test('switching from pitch hints to frets replaces the previous engraving', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const labels = page
    .locator('.alphatab-host svg text')
    .filter({ hasText: /^[A-G][#b]?(?:\d)?(?:·\d+)?$/ });
  await expect(labels.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.score-loading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Frets', exact: true }).click();
  await expect(page.locator('.score-loading')).toHaveCount(0);
  await expect(labels).toHaveCount(0);
  await expect(page.locator('.alphatab-host .at-surface')).toHaveCount(1);
  await page.locator('.alphatab-host').scrollIntoViewIfNeeded();
  await expect(
    page.locator('.alphatab-host svg text').filter({ hasText: /^7$/ }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('real worker renders SPN and stable masks; audio transport starts; mobile scrolls', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/renderer.fixture.html');
  await expect(page.locator('#score svg text').filter({ hasText: /^D4$/ }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('#status')).toContainText('"ready":true', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Show fret hints' }).click();
  await expect(
    page
      .locator('#score svg text')
      .filter({ hasText: /^D4·3$/ })
      .first(),
  ).toBeVisible();
  const before = await page
    .locator('#score svg')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('height')));
  // Inspect painted pixels in the viewport. Full-page captures can omit
  // composited notation even though the visible viewport paints correctly.
  const label = page
    .locator('#score svg text')
    .filter({ hasText: /^D4·3$/ })
    .first();
  await label.scrollIntoViewIfNeeded();
  await expect
    .poll(
      async () => {
        const labelBox = await label.boundingBox();
        expect(labelBox).not.toBeNull();
        const captured = await page.screenshot({ path: '../renderer-desktop.png' });
        return page.evaluate(
          async ({ png, box }) => {
            const raster = new Image();
            raster.src = `data:image/png;base64,${png}`;
            await raster.decode();
            const canvas = document.createElement('canvas');
            canvas.width = raster.width;
            canvas.height = raster.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(raster, 0, 0);
            const pixels = context.getImageData(
              Math.floor(box.x),
              Math.floor(box.y),
              Math.ceil(box.width),
              Math.ceil(box.height),
            ).data;
            let ink = 0;
            for (let i = 0; i < pixels.length; i += 4)
              if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100) ink++;
            return ink;
          },
          { png: captured.toString('base64'), box: labelBox! },
        );
      },
      { timeout: 10000, message: 'The pitch label must paint in the visible viewport' },
    )
    .toBeGreaterThan(25);
  await page.getByRole('button', { name: 'Hide answers' }).click();
  await expect(page.locator('#score svg text').filter({ hasText: /^\?$/ }).first()).toBeVisible();
  await expect(page.locator('#score svg text').filter({ hasText: /^D4·3$/ })).toHaveCount(0);
  const after = await page
    .locator('#score svg')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('height')));
  expect(after).toEqual(before);
  const initialTick = JSON.parse(await page.locator('#status').innerText()).currentTick;
  await page.getByRole('button', { name: 'Play / pause' }).click();
  await expect(page.locator('#status')).toContainText('"playing":true');
  await expect
    .poll(async () => JSON.parse(await page.locator('#status').innerText()).currentTick)
    .toBeGreaterThan(initialTick + 120);
  await page.getByRole('button', { name: 'Play / pause' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Reveal pitch' }).click();
  await expect(page.locator('#score svg text').filter({ hasText: /^D4$/ }).first()).toBeVisible();
  await expect
    .poll(() =>
      page.locator('#viewport').evaluate((element) => element.scrollWidth > element.clientWidth),
    )
    .toBe(true);
  await page.screenshot({ path: '../renderer-mobile.png' });
  expect(errors).toEqual([]);
});

test('rapid score replacements discard obsolete worker bounds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tests/renderer.fixture.html');
  await expect(page.locator('#score svg')).not.toHaveCount(0);
  await page.evaluate(() => {
    const w = window as unknown as { testPlayer: { loadDemo(): void; loadHomeworkDemo(): void } };
    for (let i = 0; i < 8; i++) {
      w.testPlayer.loadDemo();
      w.testPlayer.loadHomeworkDemo();
    }
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { testDocument: { title: string } }).testDocument.title,
      ),
    )
    .toBe('A familiar chord, a wider neck');
  await expect(page.locator('#status')).toContainText('\"rendered\":true');
  await expect(page.locator('#score svg text').filter({ hasText: /^C3$/ }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#score svg')).not.toHaveCount(0);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as { rendererErrors: string[] }).rendererErrors),
  ).toEqual([]);
});
