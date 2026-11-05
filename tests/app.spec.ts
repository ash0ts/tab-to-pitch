import { test, expect, type Page } from '@playwright/test';
import * as alphaTab from '@coderline/alphatab';
import { DEMO_ALPHATEX } from '../src/player/demo';
import { localCoach } from '../src/shared/coach';
import { readFile } from 'node:fs/promises';

const panel = (page: Page) =>
  page.locator('.learning-panel:visible, .inline-practice:visible').first();
async function open(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A shape, two meanings', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await expect(page.locator('.score-loading')).toHaveCount(0);
}
async function attempts(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabtopitch');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<{ outcome: string; assisted: boolean; response: string }[]>(
      (resolve, reject) => {
        const request = database.transaction('attempts').objectStore('attempts').getAll();
        request.onsuccess = () => {
          database.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      },
    );
  });
}

test('playback, loops, mixer and keyboard note inspection work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
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
  await page.getByLabel('Playback speed', { exact: true }).selectOption('0.5');
  await page.getByRole('button', { name: 'Loop off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Loop on', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Loop start bar').selectOption('1');
  await page.getByRole('button', { name: 'Open track mixer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mute', exact: true }).first().click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Mute', exact: true }).first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  // Playback advances selection. Reset before asserting the opening chord,
  // independently of how far the audio clock ran on this machine.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Next note', exact: true }).click();
  await expect(page.locator('.note-navigation [aria-live]')).toContainText('Selected');
  await page.getByRole('button', { name: 'Previous note', exact: true }).focus();
  await page.keyboard.press('Enter');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open practice details' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inside G/B', exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Hear it as minor' }).filter({ visible: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('guided answer becomes masked recall; reveal and self-report persist separately', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  const visible = panel(page);
  const cue = await visible.locator('.teaching-cue strong').innerText();
  await visible.getByRole('textbox', { name: 'Type a note name' }).fill(cue);
  await visible.getByRole('button', { name: 'Submit typed answer' }).click();
  await expect(visible.getByText('This was a guided answer.', { exact: false })).toBeVisible();
  await visible.getByRole('button', { name: 'Next question', exact: true }).click();
  await expect(visible.locator('.teaching-cue')).toHaveCount(0);
  await expect(page.locator('.tuning-strip')).toContainText('Tuning names hidden for recall');
  await expect(page.locator('.alphatab-host')).not.toContainText('Standard Tuning');
  await expect(visible.getByRole('textbox', { name: 'Type a note name' })).toHaveValue('');
  await page.getByTestId('score-viewport').scrollIntoViewIfNeeded();
  await expect(
    page.locator('.alphatab-host svg text').filter({ hasText: /^[A-G][#b]?(?:\d)?(?:·\d+)?$/ }),
  ).toHaveCount(0);
  await expect(
    page.locator('.alphatab-host svg text').filter({ hasText: /^\?$/ }).first(),
  ).toBeVisible();
  await visible.getByRole('button', { name: 'Show me the answer', exact: true }).click();
  await visible.getByRole('button', { name: 'I tried it', exact: true }).click();
  await expect.poll(async () => (await attempts(page)).length).toBe(3);
  const history = await attempts(page);
  expect(history.filter((a) => a.outcome === 'correct' && !a.assisted)).toHaveLength(0);
  expect(history.some((a) => a.outcome === 'revealed')).toBe(true);
  expect(history.some((a) => a.outcome === 'self-reported')).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled();
  expect((await attempts(page)).length).toBe(3);
});

test('all four exercise families are available without a cloud account', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  const visible = panel(page);
  for (const value of ['note-name', 'note-location', 'interval', 'triad-role']) {
    await visible.getByLabel('Your focus', { exact: true }).selectOption(value);
    await expect(visible.getByTestId('exercise-card')).toBeVisible();
    await expect(visible.locator('.answer-options button').first()).toBeEnabled();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});

test('valid import survives reload; malformed replacement preserves the current score', async ({
  page,
}) => {
  await open(page);
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(
    DEMO_ALPHATEX.replace('A shape, two meanings', 'My original fixture'),
  );
  const bytes = new alphaTab.exporter.Gp7Exporter().export(score, new alphaTab.Settings());
  await page.getByLabel('Import Guitar Pro file', { exact: true }).setInputFiles({
    name: 'original.gp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });
  await expect(
    page.getByRole('heading', { name: 'My original fixture', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Imported and saved on this device.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open your library' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /original.gp/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'My original fixture', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Import Guitar Pro file', { exact: true }).setInputFiles({
    name: 'broken.gp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('malformed'),
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'My original fixture', exact: true }),
  ).toBeVisible();
});

test('local recommendation opens an eligible exercise', async ({ page }) => {
  await open(page);
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open practice details' }).click();
  const guide = page.locator('.coach-card:visible').first();
  await guide.getByRole('button', { name: 'Suggest a practice step' }).click();
  await expect(
    guide.getByText('Selected on your device. Works offline.', { exact: true }),
  ).toBeVisible();
  await guide.getByRole('button', { name: 'Start this exercise' }).click();
  await expect(page.getByTestId('exercise-card')).toHaveCount(1);
  await expect(page.getByTestId('exercise-card')).toBeVisible();
});

test('invalid cloud output falls back; withdrawing consent discards an in-flight response', async ({
  page,
}) => {
  test.skip(
    test.info().project.name === 'mobile',
    'Same request-state logic; mobile local guide is covered above.',
  );
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { authenticated: true, cloudEnabled: true } }),
  );
  let release: () => void = () => {};
  let waiting = false;
  await page.route('**/api/coach/next', async (route) => {
    const request = route.request().postDataJSON();
    if (waiting)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    const proposal = localCoach(request.context);
    proposal.proposal.candidateId = 'invented-id';
    await route.fulfill({ json: proposal }).catch(() => {});
  });
  await open(page);
  const guide = page.locator('.coach-card:visible');
  await guide.locator('summary').click();
  const consent = guide.getByRole('checkbox');
  await consent.check();
  await guide.getByRole('button', { name: 'Suggest a practice step' }).click();
  await expect(
    guide.getByText('Using your on-device practice guide.', { exact: true }),
  ).toBeVisible();
  await consent.uncheck();
  await consent.check();
  waiting = true;
  const started = page.waitForRequest('**/api/coach/next');
  await guide.getByRole('button', { name: 'Suggest a practice step' }).click();
  await started;
  await consent.uncheck();
  release();
  await expect(guide.getByRole('button', { name: 'Suggest a practice step' })).toBeEnabled();
  await expect(guide.getByRole('button', { name: 'Start this exercise' })).toHaveCount(0);
});

test('storage failure preserves active feedback and offers an export warning', async ({ page }) => {
  test.skip(
    test.info().project.name === 'mobile',
    'Storage errors share one browser persistence path.',
  );
  await page.addInitScript(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'attempts')
        throw new DOMException('Test quota failure', 'QuotaExceededError');
      return add.apply(this, args);
    };
  });
  await open(page);
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  const visible = panel(page);
  const cue = await visible.locator('.teaching-cue strong').innerText();
  await visible.getByRole('textbox', { name: 'Type a note name' }).fill(cue);
  await visible.getByRole('button', { name: 'Submit typed answer' }).click();
  await expect(page.getByRole('alert')).toContainText('Export your progress before closing');
  await expect(page.locator('.local-status')).toContainText('Local storage needs attention');
  await expect(visible.getByRole('button', { name: 'Next question' })).toBeEnabled();
  await page.getByRole('button', { name: 'Settings and progress' }).click();
  await page.getByLabel('Import progress backup', { exact: true }).setInputFiles({
    name: 'empty-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ schemaVersion: 1, exportedAt: new Date(0).toISOString(), attempts: [] }),
    ),
  });
  await expect(page.getByText('Imported 0 practice records.', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export progress', exact: true }).click();
  const backup = await download;
  expect(backup.suggestedFilename()).toBe('tabtopitch-progress.json');
  expect(JSON.parse(await readFile((await backup.path())!, 'utf8')).attempts).toHaveLength(1);
});

test('responsive panels own one coach and one question at a time', async ({ page }) => {
  await open(page);
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open practice details' }).click();
  await expect(page.locator('.coach-card')).toHaveCount(1);
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await expect(page.getByTestId('exercise-card')).toHaveCount(1);
  if (test.info().project.name === 'mobile') {
    await page.getByRole('textbox', { name: 'Type a note name' }).fill('B');
    await page.getByRole('button', { name: 'Open practice details' }).click();
    await expect(page.getByTestId('exercise-card')).toHaveCount(1);
    await expect(page.getByRole('dialog').getByTestId('exercise-card')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Type a note name' })).toHaveValue('B');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(page.getByRole('textbox', { name: 'Type a note name' })).toHaveValue('B');
  } else {
    await page.getByRole('button', { name: 'Practice guide', exact: true }).click();
    await expect(page.getByTestId('exercise-card')).toHaveCount(0);
    await expect.poll(async () => (await attempts(page)).length).toBe(1);
    await page.getByRole('tab', { name: 'Play', exact: true }).click();
    expect((await attempts(page)).map((attempt) => attempt.outcome)).toEqual(['interrupted']);
  }
});

test('a delayed earlier file read cannot replace the latest import', async ({ page }) => {
  test.skip(
    test.info().project.name === 'mobile',
    'File reads use the same loader on both layouts.',
  );
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      const bytes = await original.call(this);
      if (this.name === 'slow.gp') {
        const testWindow = window as typeof window & {
          releaseRead?: () => void;
          slowReadDone?: boolean;
        };
        await new Promise<void>((resolve) => {
          testWindow.releaseRead = resolve;
        });
        testWindow.slowReadDone = true;
      }
      return bytes;
    };
  });
  await open(page);
  const file = (title: string) =>
    Buffer.from(
      new alphaTab.exporter.Gp7Exporter().export(
        alphaTab.importer.ScoreLoader.loadAlphaTex(
          DEMO_ALPHATEX.replace('A shape, two meanings', title),
        ),
        new alphaTab.Settings(),
      ),
    );
  const input = page.getByLabel('Import Guitar Pro file', { exact: true });
  await input.setInputFiles({
    name: 'slow.gp',
    mimeType: 'application/octet-stream',
    buffer: file('Earlier selection'),
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as typeof window & { releaseRead?: () => void }).releaseRead),
      ),
    )
    .toBe(true);
  await input.setInputFiles({
    name: 'latest.gp',
    mimeType: 'application/octet-stream',
    buffer: file('Latest selection'),
  });
  await expect(page.getByRole('heading', { name: 'Latest selection', exact: true })).toBeVisible();
  await page.evaluate(() =>
    (window as typeof window & { releaseRead?: () => void }).releaseRead?.(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as typeof window & { slowReadDone?: boolean }).slowReadDone),
      ),
    )
    .toBe(true);
  await expect(page.getByRole('heading', { name: 'Latest selection', exact: true })).toBeVisible();
  await expect(page.getByText('Imported and saved on this device.', { exact: true })).toBeVisible();
});

test('stored attempts are immutable and equivalent backups are idempotent', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'IndexedDB contract is shared by both layouts.');
  await open(page);
  await page.getByRole('tab', { name: 'Practice', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Show me the answer', exact: true }).click();
  await expect.poll(async () => (await attempts(page)).length).toBe(1);
  const result = await page.evaluate(async (path) => {
    const storage = await import(path);
    const [original] = await storage.getAttempts();
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    const makeBackup = (records: unknown[]) =>
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: new Date(0).toISOString(),
        attempts: records,
      });
    const added = await storage.importProgress(makeBackup([reordered]));
    let rewriteRejected = false;
    try {
      await storage.saveAttempt({ ...original, response: 'rewritten' });
    } catch {
      rewriteRejected = true;
    }
    let transactionRejected = false;
    try {
      await storage.importProgress(
        makeBackup([
          { ...original, id: 'new-entry' },
          { ...original, response: 'rewritten' },
        ]),
      );
    } catch {
      transactionRejected = true;
    }
    return {
      added,
      rewriteRejected,
      transactionRejected,
      records: await storage.getAttempts(),
      original,
    };
  }, '/src/storage.ts');
  expect(result.added).toBe(0);
  expect(result.rewriteRejected).toBe(true);
  expect(result.transactionRejected).toBe(true);
  expect(result.records).toEqual([result.original]);
  await page.getByRole('button', { name: 'Settings and progress' }).click();
  await page.getByLabel('Import progress backup', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid'),
  });
  await expect(page.getByRole('alert')).toContainText('That progress file is invalid');
  await expect(page.locator('.local-status')).toContainText('Local storage ready');
});
