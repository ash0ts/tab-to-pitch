import { expect, test, type Page } from '@playwright/test';

async function study(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Open ii–V–I study' }).click();
  await expect(
    page.getByRole('heading', { name: 'One progression, many places', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview variation', exact: true })).toBeVisible();
  return page.getByRole('region', { name: 'Progression studio', exact: true });
}

test('revoices seventh chords and ninth extensions without replacing the source; saves and restores a chosen path', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const studio = await study(page);
  await expect(studio.locator('.progression-strip strong')).toHaveText([
    'Dm7',
    'G7',
    'Cmaj7',
    'Am7',
  ]);
  await studio.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
  await expect(studio.locator('.shape-navigation')).toContainText('variation 1 of 3');
  await studio.getByRole('button', { name: 'Add color', exact: true }).click();
  await studio.getByRole('combobox', { name: 'Chord color', exact: true }).selectOption('m9');
  await expect(studio.locator('.variation-detail')).toContainText('Dm9');
  await expect(studio.locator('.variation-detail')).toContainText('Omitted: fifth');
  await studio.getByRole('button', { name: 'Next progression variation' }).click();
  await expect(studio.locator('.shape-navigation')).toContainText('variation 2 of 3');
  await studio.getByRole('button', { name: 'Apply & save', exact: true }).click();
  await expect(studio).toContainText('Variation saved on this device');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play score', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await studio.getByRole('button', { name: 'Original score', exact: true }).click();
  await page.locator('.alphatab-host').scrollIntoViewIfNeeded();
  await expect(
    page.locator('.alphatab-host svg text').filter({ hasText: /^F·1$/ }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Open ii–V–I study' }).click();
  await page.getByText('Saved variations (1)', { exact: true }).click();
  await page.locator('.saved-variation').click();
  await expect(page.locator('.shape-navigation')).toContainText('variation 2 of 3');
  expect(errors).toEqual([]);
});

test('separates modes, substitutions and constraints; no-match remains an explicit failure', async ({
  page,
}) => {
  const studio = await study(page);
  if (test.info().project.name === 'mobile')
    await studio.getByRole('button', { name: 'Key, modes and practice' }).click();
  const context =
    test.info().project.name === 'mobile'
      ? page.getByRole('dialog', { name: 'Key, modes and practice' })
      : studio;
  await context.getByRole('combobox', { name: 'Scale mode' }).selectOption('dorian');
  await expect(context.locator('.scale-note-list')).toContainText('Eb');
  if (test.info().project.name === 'mobile')
    await context.getByRole('button', { name: 'Back to the progression' }).click();
  await studio.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
  if (test.info().project.name === 'mobile')
    await studio.getByRole('button', { name: 'Key, modes and practice' }).click();
  await expect(context.getByRole('combobox', { name: 'Scale mode' })).toHaveValue('dorian');
  await context.getByRole('combobox', { name: 'Scale mode' }).selectOption('ionian');
  if (test.info().project.name === 'mobile')
    await context.getByRole('button', { name: 'Back to the progression' }).click();
  await studio.getByRole('button', { name: 'Try a substitution', exact: true }).click();
  await expect(
    studio.getByRole('combobox', { name: 'Substitution' }).locator('option'),
  ).toContainText(['Choose a confirmed major key first', 'F']);
  await studio.locator('.advanced-voicings summary').click();
  await studio.getByRole('spinbutton', { name: 'Minimum fret', exact: true }).fill('24');
  await studio.getByRole('spinbutton', { name: 'Maximum fret', exact: true }).fill('24');
  await expect(studio.getByRole('button', { name: 'Preview variation', exact: true })).toHaveCount(
    0,
  );
  await expect(studio.locator('.exploration-empty').first()).toBeVisible();
  await expect(studio.getByRole('spinbutton', { name: 'Minimum fret', exact: true })).toHaveValue(
    '24',
  );
});

test('uses a validated local arrangement proposal and hides exploration during recall', async ({
  page,
}) => {
  const studio = await study(page);
  await studio.getByText('Describe a variation', { exact: true }).click();
  await studio.getByRole('button', { name: 'Ask local planner', exact: true }).click();
  await expect(studio.locator('.proposal-result')).toContainText('Local planner · proposal');
  await studio.getByRole('button', { name: 'Preview this proposal', exact: true }).click();
  await studio.locator('.advanced-voicings summary').click();
  await expect(studio.getByRole('spinbutton', { name: 'Minimum fret', exact: true })).toHaveValue(
    '5',
  );
  await expect(studio.getByRole('spinbutton', { name: 'Maximum fret', exact: true })).toHaveValue(
    '9',
  );
  if (test.info().project.name === 'mobile')
    await studio.getByRole('button', { name: 'Key, modes and practice' }).click();
  await page.getByRole('button', { name: 'Practice chord tones', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Progression studio', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByTestId('exercise-card')).toBeVisible();
  await expect(page.getByTestId('exercise-card')).toContainText('In Dm7');
});

test('migrates version-one data without changing existing evidence', async ({ page }) => {
  const legacy = {
    id: 'legacy-evidence',
    exerciseId: 'triad-v1',
    scoreId: 'old-score',
    trackId: 'old-track',
    skillId: 'triad-role',
    kind: 'triad-role',
    noteIds: ['old-note'],
    response: 'third',
    outcome: 'correct',
    assisted: false,
    hintsUsed: [],
    startedAt: 1000,
    answeredAt: 2000,
    responseMs: 1000,
    mode: 'recall',
    partition: 'practice',
    evidence: 'answer',
  };
  await page.addInitScript((legacy) => {
    const request = indexedDB.open('tabtopitch', 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('files', { keyPath: 'id' });
      database.createObjectStore('attempts', { keyPath: 'id' }).add(legacy);
      database.createObjectStore('settings');
    };
    request.onsuccess = () => {
      request.result.close();
    };
  }, legacy);
  await study(page);
  const stored = await page.evaluate(
    () =>
      new Promise<{ version: number; stores: string[]; evidence: unknown }>((resolve, reject) => {
        const request = indexedDB.open('tabtopitch');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const evidence = database
            .transaction('attempts')
            .objectStore('attempts')
            .get('legacy-evidence');
          evidence.onsuccess = () => {
            resolve({
              version: database.version,
              stores: [...database.objectStoreNames],
              evidence: evidence.result,
            });
            database.close();
          };
        };
      }),
  );
  expect(stored).toEqual({
    version: 4,
    stores: [
      'attempts',
      'exerciseDefinitions',
      'files',
      'lessonEvents',
      'lessons',
      'listeningAttempts',
      'listeningExercises',
      'settings',
      'variations',
    ],
    evidence: legacy,
  });
});

test('keeps deterministic progression available when trained parameters are excluded', async ({
  page,
}) => {
  const studio = await study(page);
  const experiment = studio.locator('.recorded-choice');
  await experiment.locator('summary').click();
  const enable = experiment.getByRole('checkbox', {
    name: 'Enable experimental candidate ordering',
  });
  await expect(enable).not.toBeChecked();
  await studio.locator('.progression-strip button').nth(2).click();
  await studio.locator('.advanced-voicings summary').click();
  await studio.getByRole('combobox', { name: 'Number of voices' }).selectOption('5');
  const before = await studio.locator('.progression-strip strong').allTextContents();
  await enable.check();
  await expect(experiment.getByRole('status')).toContainText('not bundled');
  await expect(experiment.getByRole('combobox', { name: 'Experimental candidate' })).toHaveCount(0);
  await expect(studio.locator('.progression-strip strong')).toHaveText(before);
  await enable.uncheck();
});

test('validates the retained Forge proposal locally and auditions its chord change without cloud access', async ({
  page,
}) => {
  const cloudRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/arrangements/propose' || url.hostname.endsWith('coreweave.com'))
      cloudRequests.push(request.url());
  });
  const studio = await study(page);
  const originalChords = await studio.locator('.progression-strip strong').allTextContents();
  const recorded = studio.locator('.recorded-arrangement');
  await recorded.locator('summary').click();
  await expect(recorded).toContainText('46/64');
  await expect(recorded).toContainText('Live arrangement coaching remains disabled by default');
  await studio.locator('.arrangement-prompt summary').click();
  await expect(
    studio.getByRole('checkbox', { name: 'Use Forge for this request' }),
  ).not.toBeChecked();
  const board = recorded.getByRole('region', { name: 'Validated recorded Forge voicing' });
  await expect(board.getByRole('button')).toHaveCount(4);
  await expect(recorded).toContainText('F#: major third');
  const initialShape = await board
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  await recorded.getByRole('button', { name: 'Gmaj7', exact: true }).click();
  await expect(recorded.getByRole('button', { name: 'Gmaj7', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(board.getByRole('button')).toHaveCount(4);
  await expect(recorded).toContainText('F#: major seventh');
  const nextShape = await board
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(nextShape).not.toEqual(initialShape);
  await recorded.getByRole('button', { name: 'Hear the recorded voicing', exact: true }).click();
  await expect(studio.locator('.progression-strip strong')).toHaveText(originalChords);
  await expect(
    recorded.getByRole('link', { name: 'Open associated Agent Lens trace (private project)' }),
  ).toHaveAttribute(
    'href',
    'https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research/conversations/01a18ddf-1b8f-79f9-953a-3235fda19a25',
  );
  expect(cloudRequests).toEqual([]);
});

test('restores a saved path under unchanged controls and undoes a later neck-region change', async ({
  page,
}) => {
  const studio = await study(page);
  await studio.getByRole('button', { name: 'Apply & save', exact: true }).click();
  await expect(studio).toContainText('Variation saved on this device');
  const initialShape = await studio
    .locator('.variation-detail .fret.marked')
    .evaluateAll((notes) => notes.map((note) => note.getAttribute('aria-label')));
  await studio.getByRole('button', { name: 'Next progression variation' }).click();
  await expect(studio.locator('.shape-navigation')).toContainText('variation 2 of');
  await studio.locator('.saved-variations summary').click();
  await studio.locator('.saved-variation').click();
  await expect(studio.locator('.shape-navigation')).toContainText('variation 1 of');
  await expect
    .poll(() =>
      studio
        .locator('.variation-detail .fret.marked')
        .evaluateAll((notes) => notes.map((note) => note.getAttribute('aria-label'))),
    )
    .toEqual(initialShape);
  await studio.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
  await studio.getByRole('button', { name: 'Apply & save', exact: true }).click();
  await expect(studio).toContainText('Variation saved on this device');
  await studio.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(studio.getByRole('button', { name: 'Frets 0–5', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(studio.locator('.shape-navigation')).toContainText('variation 1 of');
  await expect
    .poll(() =>
      studio
        .locator('.variation-detail .fret.marked')
        .evaluateAll((notes) => notes.map((note) => note.getAttribute('aria-label'))),
    )
    .toEqual(initialShape);
  await expect(
    studio.getByRole('button', { name: 'Preview variation', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled();
});
