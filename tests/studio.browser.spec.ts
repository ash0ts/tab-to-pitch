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
  await expect(page.getByRole('heading', { name: 'Sound check.' })).toBeVisible();
  await page.getByRole('button', { name: /^(Start|Continue) practicing$/ }).click();
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
  await page.getByRole('button', { name: /^(Start|Continue) practicing$/ }).click();
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
  await expect(page.getByRole('button', { name: /^(Start|Continue) practicing$/ })).toBeVisible();
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
  const guide = await page.locator('#exercise-guide').boundingBox();
  const lab = await page.locator('#forge-evidence').boundingBox();
  expect(guide!.y).toBeLessThan(lab!.y);
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

test('a practice round has a visible route, honest feedback, and a saved ending', async ({
  page,
}, info) => {
  await open(page, 'studio');
  await page.getByRole('button', { name: '5 min', exact: true }).click();
  await page.getByRole('button', { name: 'Start practicing', exact: true }).click();
  const hw = page.getByRole('region', { name: 'Guitar homework', exact: true });
  await expect(hw.getByRole('heading', { name: 'From a note to a progression.' })).toBeVisible();
  await hw.getByRole('button', { name: 'Start guitar homework', exact: true }).click();
  const route = hw.getByRole('navigation', { name: 'Homework learning route' });
  await expect(route.getByRole('button', { name: '01 Find notes' })).toHaveAttribute(
    'aria-current',
    'step',
  );
  await expect(hw.getByRole('button', { name: 'Play along', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await expect(hw.locator('.homework-feedback')).toBeFocused();
  await hw.getByRole('button', { name: 'Needs another pass', exact: true }).click();
  await expect(hw.getByText('You reported: Needs another pass', { exact: true })).toBeVisible();
  await expect(hw.locator('.homework-participation')).toContainText('1 of');
  await expect(hw.locator('.homework-participation')).toContainText('not a score');
  await route.getByRole('button', { name: '03 Play changes' }).click();
  await expect(hw.getByRole('navigation', { name: 'Homework progression' })).toBeVisible();
  await route.getByRole('button', { name: '04 Make music' }).click();
  await expect(hw.getByRole('heading', { name: 'Hear F resolve to E' })).toBeVisible();
  await hw.getByRole('button', { name: 'Finish session', exact: true }).click();
  const recap = page.getByRole('dialog');
  await expect(recap.getByRole('heading', { name: 'Keep your next step.' })).toBeVisible();
  await recap.getByRole('textbox').fill('Repeat F to E before trying another position.');
  await recap.getByRole('button', { name: 'Save for next time', exact: true }).click();
  await expect(page).toHaveURL(/#\/studio$/);
  await expect(
    page.getByRole('button', { name: 'Continue practicing', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue practicing', exact: true }).click();
  await expect(hw.getByRole('heading', { name: 'Hear F resolve to E' })).toBeVisible();
  const events = await data(page, 'lessonEvents');
  expect(events.filter((e: any) => e.playing?.kind === 'self-report')).toHaveLength(1);
  expect(events.filter((e: any) => e.live?.attempt)).toHaveLength(0);
  expect(await data(page, 'attempts')).toHaveLength(0);
  await page.screenshot({ path: `../pixel-practice-${info.project.name}.png` });
});

test('the room selects one setlist activity and retains optional bandmate preferences', async ({
  page,
}) => {
  await open(page, 'studio');
  const selection = page.locator('.setlist-choices');
  await selection.getByRole('button', { name: /One progression, many places/ }).click();
  await expect(
    selection.getByRole('button', { name: /One progression, many places/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.mission-goal')).toContainText('Move accompaniment');
  await page.getByRole('button', { name: 'Room settings & weekly intention' }).click();
  await page.getByLabel('Show the optional AI bandmate').uncheck();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('.bandmate-sprite')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start practicing', exact: true }).click();
  await expect(page).toHaveURL(/stage\/progression/);
  await page.getByRole('button', { name: 'Exit to studio' }).click();
  await page.reload();
  await expect(page.locator('.bandmate-sprite')).toHaveCount(0);
  await page.getByRole('link', { name: 'Songs & exercises', exact: true }).click();
  const card = page.locator('.activity-card').filter({
    has: page.getByRole('heading', { name: 'One progression, many places', exact: true }),
  });
  await card.getByRole('button', { name: 'Remove from set', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Add to set', exact: true })).toBeEnabled();
});

test('the Forge lab shows failed qualifications and keeps learning claims separate', async ({
  page,
}) => {
  await open(page, 'research');
  const lab = page.getByRole('region', { name: 'Forge experiment evidence' });
  await expect(lab).toContainText('11/144');
  await expect(lab).toContainText('35/144');
  await expect(
    lab.getByRole('link', { name: 'Inspect all 72 requests, trials and returned notes' }),
  ).toHaveAttribute('href', '/research/guitar-teacher/index.html');
  await expect(lab).toContainText('45 / 96');
  await expect(lab).toContainText('51 local fallbacks');
  await expect(lab).toContainText('52/60');
  await expect(lab).toContainText('40% of critical');
  await expect(lab).toContainText('Candidate not promoted');
  await expect(lab).toContainText('1 / 3');
  await expect(lab).toContainText('two local fallbacks');
  await expect(lab.getByRole('link', { name: 'Lens · accepted error' })).toHaveAttribute(
    'href',
    /conversations\/93c8126f/,
  );
  for (const path of [
    'evidence-audit.md',
    'listening-results.md',
    'ear-lab-results.md',
    'connected-homework.md',
  ]) {
    const response = await page.request.get(`/research/notebook/${path}`);
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain('<div id="root">');
  }
  await lab.getByText('Watch the connected homework session', { exact: true }).click();
  const video = lab.getByLabel('Original homework walkthrough with the on-device guide');
  await expect(video).toBeVisible();
  await video.evaluate((element: HTMLVideoElement) => element.load());
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth))
    .toBeGreaterThan(0);
  const hosted = await page.request.head('/demos/connected-homework/forge-walkthrough.mp4');
  expect(hosted.status()).toBe(200);
  expect(hosted.headers()['content-type']).toContain('video/mp4');
});
