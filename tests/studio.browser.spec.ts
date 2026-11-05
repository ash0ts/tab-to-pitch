import { test, expect, type Page } from '@playwright/test';
async function open(page: Page, path = '') {
  await page.goto(`/#/${path}`);
  await expect(page.getByRole('link', { name: 'Studio', exact: true })).toBeVisible();
}
async function data(page: Page, store: string) {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('tabtopitch');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return await new Promise<unknown[]>((resolve, reject) => {
      const r = db.transaction(name).objectStore(name).getAll();
      r.onsuccess = () => {
        db.close();
        resolve(r.result);
      };
      r.onerror = () => {
        db.close();
        reject(r.error);
      };
    });
  }, store);
}
test('studio opens a focused CAGED task, records assistance and resumes a bookmark', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.getByRole('heading', { name: 'A little practice. More music.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue practicing' }).click();
  await page.getByRole('button', { name: 'Explore or check the fretboard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start homework', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start homework', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toBeVisible();
  await expect(page.locator('.homework-workspace button.fret')).not.toHaveCount(0);
  await page.getByText('Choose some help', { exact: true }).click();
  await page.getByRole('button', { name: 'Root landmark', exact: true }).click();
  await expect
    .poll(async () => JSON.stringify(await data(page, 'lessonEvents')))
    .toContain('landmark');
  await page.screenshot({ path: `../stage-homework-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Save for next time', exact: true }).first().click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save for next time', exact: true })
    .click();
  await page.reload();
  await page.getByRole('button', { name: 'Continue practicing' }).click();
  await page.getByRole('button', { name: 'Explore or check the fretboard', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fretboard homework', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('challenge preserves the first response and revealing help excludes ranking', async ({
  page,
}) => {
  await open(page, 'stage/knowledge');
  await page.getByRole('button', { name: 'Try a knowledge challenge' }).click();
  const panel = page.getByRole('region', { name: 'Knowledge task' });
  await expect(panel.locator('.teaching-cue')).toHaveCount(0);
  await panel.getByRole('textbox', { name: 'Type a note name' }).fill('F#');
  await panel.getByRole('button', { name: 'Submit typed answer' }).click();
  await expect.poll(async () => JSON.stringify(await data(page, 'attempts'))).toContain('F#');
  await panel.getByRole('button', { name: 'Next question', exact: true }).click();
  await panel.getByText('Choose some help', { exact: true }).click();
  await panel.getByRole('button', { name: 'Full explanation', exact: true }).click();
  await expect(page.locator('.challenge-bar')).toContainText('Assisted practice');
  const records = await data(page, 'attempts');
  expect(records.length).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(records)).toContain('revealed');
});
test('timeline uses the existing player and offers static, notation and recovery controls', async ({
  page,
}, info) => {
  await open(page, 'stage/timeline');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Play score', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await page.getByLabel('Static stage', { exact: true }).check();
  await expect(page.getByText('Static passage', { exact: true })).toBeVisible();
  await page.screenshot({ path: `../stage-timeline-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Original notation', exact: true }).click();
  await page.getByTestId('score-viewport').scrollIntoViewIfNeeded();
  await expect(page.locator('.alphatab-host svg').first()).toBeVisible();
  await page.getByRole('button', { name: 'Exit to studio' }).click();
  await expect(page.getByRole('button', { name: 'Continue practicing' })).toBeVisible();
});
test('listening and teaching references are reachable without exposing another task', async ({
  page,
}) => {
  await open(page, 'stage/listening');
  await expect(page.getByRole('button', { name: 'Try a listening question' })).toBeVisible();
  await page.getByRole('button', { name: 'Try a listening question' }).click();
  await expect(page.locator('.listening-question')).toBeVisible();
  await expect(page.locator('.alphatab-host')).not.toBeVisible();
  await page.getByRole('button', { name: 'Open music teacher', exact: true }).click();
  await expect(page.getByText('Your question is active.', { exact: true })).toBeVisible();
  await expect(page.locator('.teacher-conversation')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Why this exercise?', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How this teaches', exact: true })).toBeVisible();
  await expect(page.getByText('What it does not establish', { exact: true })).toBeVisible();
});
test('missing artwork, reduced motion and zoom leave functional navigation', async ({ page }) => {
  await page.route('**/art/**', (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await page.getByRole('link', { name: 'Songs & exercises', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find an exercise' }).fill('USB');
  await expect(
    page.getByRole('heading', { name: 'Play with my guitar', exact: true }),
  ).toBeVisible();
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Play with my guitar', exact: true }) })
    .getByRole('button', { name: 'Open activity', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Try a knowledge challenge' })).toHaveCount(0);
  await expect(page.locator('.live-guitar-panel')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

test('backup restores presentation atomically and the research index keeps its route', async ({
  page,
}, info) => {
  test.skip(
    info.project.name === 'mobile',
    'The persistence transaction is shared across layouts.',
  );
  await open(page, 'research/homework');
  await page.getByRole('link', { name: 'Learning approach', exact: true }).click();
  await expect(page).toHaveURL(/#\/research\/homework$/);
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.ts' as string);
    const contracts = await import('/src/studio/contracts.ts' as string);
    const studio = { ...contracts.defaultPracticeSet(), goal: 'Hear the seventh', workload: 5 };
    const backup = {
      schemaVersion: 4,
      exportedAt: new Date().toISOString(),
      attempts: [],
      variations: [],
      lessons: [],
      lessonEvents: [],
      exerciseDefinitions: [],
      studio,
      stageRuns: [],
    };
    await storage.importProgress(JSON.stringify(backup));
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'settings' && args[1] === 'stage-runs-v1')
        throw new DOMException('test quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    let failed = false;
    try {
      await storage.importProgress(
        JSON.stringify({ ...backup, studio: { ...studio, goal: 'Should roll back' } }),
      );
    } catch {
      failed = true;
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    return { failed, studio: await storage.readSetting('studio-v1', null) };
  });
  expect(result).toMatchObject({ failed: true, studio: { goal: 'Hear the seventh', workload: 5 } });
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await expect(page.getByRole('button', { name: '5 min', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
