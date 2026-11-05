import { expect, test, type Page } from '@playwright/test';
import * as alphaTab from '@coderline/alphatab';

async function open(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A shape, two meanings', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await expect(page.locator('.score-loading')).toHaveCount(0);
  await page.locator('.alphatab-host').scrollIntoViewIfNeeded();
}

async function explore(page: Page) {
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open practice details' }).click();
  await expect(page.locator('.note-identity h2')).toBeVisible();
  return page.locator('.note-exploration');
}

function notesInScore(page: Page, label: RegExp) {
  return page.locator('.alphatab-host svg text').filter({ hasText: label });
}

test('note names are the default; octave display is optional and survives reload', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('checkbox', { name: 'Octaves', exact: true })).not.toBeChecked();
  await expect(notesInScore(page, /^B·2$/).first()).toBeVisible();
  await expect(notesInScore(page, /^B2·2$/)).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Octaves', exact: true }).check();
  await expect(notesInScore(page, /^B2·2$/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: 'Octaves', exact: true })).toBeChecked();
  await page.locator('.alphatab-host').scrollIntoViewIfNeeded();
  await expect(notesInScore(page, /^B2·2$/).first()).toBeVisible();
  const inspector = await explore(page);
  await expect(inspector.locator('.note-identity h2')).toHaveText('B2');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('checkbox', { name: 'Octaves', exact: true }).uncheck();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Open practice details' }).click();
  await expect(inspector.locator('.note-identity h2')).toHaveText('B');
});

test('note exploration distinguishes any octave from the exact pitch and bounds the neck area', async ({
  page,
}) => {
  await open(page);
  const inspector = await explore(page);
  await expect(inspector.getByRole('button', { name: 'Any octave', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(inspector.locator('.exploration-board button')).toHaveCount(3);
  await inspector.getByRole('combobox', { name: 'Neck area', exact: true }).selectOption('all');
  const board = inspector.getByRole('region', { name: 'B locations, any octave', exact: true });
  await expect(board.getByRole('button')).toHaveCount(13);
  await expect(
    board.getByRole('button', { name: 'String 2, fret 0, B', exact: true }),
  ).toBeVisible();
  await expect(
    board.getByRole('button', { name: 'String 5, fret 2, B, source position', exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Exact pitch', exact: true }).click();
  await expect(inspector.locator('.exploration-board button')).toHaveCount(2);
  await expect(
    inspector.getByRole('button', { name: 'String 6, fret 7, B', exact: true }),
  ).toBeAttached();
  await inspector.getByRole('combobox', { name: 'Neck area', exact: true }).selectOption('9-12');
  await expect(inspector.locator('.exploration-board button')).toHaveCount(0);
  await expect(
    inspector.getByText('Try another neck area to find this note.', { exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Any octave', exact: true }).click();
  await expect(inspector.locator('.exploration-board button')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false,
  );
});

test('chord shapes honor strings, neck area and bass role and audition their actual notes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const testWindow = window as typeof window & { auditionFrequencies: number[] };
    testWindow.auditionFrequencies = [];
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = createOscillator.call(this);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = function (when?: number) {
        testWindow.auditionFrequencies.push(oscillator.frequency.value);
        start(when);
      };
      return oscillator;
    };
  });
  await open(page);
  const inspector = await explore(page);
  await inspector.getByRole('button', { name: 'Chord shapes', exact: true }).click();
  await inspector.getByRole('combobox', { name: 'Lowest note', exact: true }).selectOption('third');
  await expect(inspector.locator('.shape-navigation strong')).toHaveText('G/B');
  await expect(inspector.locator('.shape-navigation')).toContainText('first inversion');
  await inspector.getByRole('combobox', { name: 'Neck area', exact: true }).selectOption('5-9');
  await expect(
    inspector.getByText(/No complete three-note G shapes fit these filters/),
  ).toBeVisible();
  await inspector.getByRole('combobox', { name: 'Three strings', exact: true }).selectOption('2');
  await expect(inspector.locator('.shape-navigation strong')).toHaveText('G/B');
  await expect(
    inspector.getByRole('button', { name: 'String 4, fret 9, B, third', exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Hear this shape', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { auditionFrequencies: number[] }).auditionFrequencies.length,
      ),
    )
    .toBe(3);
  const pitches = await page.evaluate(() =>
    (window as typeof window & { auditionFrequencies: number[] }).auditionFrequencies
      .map((frequency) => Math.round(69 + 12 * Math.log2(frequency / 440)))
      .sort((a, b) => a - b),
  );
  expect(pitches).toEqual([59, 62, 67]);
  await inspector.getByRole('button', { name: 'Source G/B', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { auditionFrequencies: number[] }).auditionFrequencies.length,
      ),
    )
    .toBe(7);
  const sourcePitches = await page.evaluate(() =>
    (window as typeof window & { auditionFrequencies: number[] }).auditionFrequencies
      .slice(3)
      .map((frequency) => Math.round(69 + 12 * Math.log2(frequency / 440)))
      .sort((a, b) => a - b),
  );
  expect(sourcePitches).toEqual([47, 50, 55, 62]);
  await expect(inspector.locator('.source-chord .note-row')).toHaveCount(4);
  await expect(inspector.locator('.source-chord')).toContainText('B is the lowest note');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false,
  );
});

test('starting practice uses the selected note and the selected pitch-matching rule', async ({
  page,
}) => {
  await open(page);
  const inspector = await explore(page);
  await inspector.getByRole('button', { name: 'Exact pitch', exact: true }).click();
  await inspector.getByRole('button', { name: 'Practice finding this note', exact: true }).click();
  if (test.info().project.name === 'mobile')
    await expect(page.getByRole('dialog').getByTestId('exercise-card')).toBeVisible();
  else
    await expect(page.getByRole('tab', { name: 'Practice', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  await expect(page.getByLabel('Your focus', { exact: true })).toHaveValue('note-location');
  await expect(
    page.getByRole('checkbox', { name: 'Match the exact octave (advanced)', exact: true }),
  ).toBeChecked();
  await expect(page.getByTestId('exercise-card').getByRole('heading')).toHaveText(
    'Find another B2 at the same pitch. Start from string 5, fret 2.',
  );
  await expect(page.locator('.teaching-cue strong')).toHaveText('Try string 6, fret 7');
});

test('an exact pitch without another location does not silently start a different note', async ({
  page,
}) => {
  await open(page);
  // Original two-note fixture: E2 has no exact alternative; B2 does.
  const score = alphaTab.importer.ScoreLoader.loadAlphaTex(String.raw`\title "Low-string study"
\artist "TabToPitch original test fixture"
\tempo 92
\track "Guitar" \instrument 25 \tuning E4 B3 G3 D3 A2 E2
. 0.6.2 2.5.2`);
  const bytes = new alphaTab.exporter.Gp7Exporter().export(score, new alphaTab.Settings());
  await page.getByLabel('Import Guitar Pro file', { exact: true }).setInputFiles({
    name: 'low-string-study.gp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByRole('heading', { name: 'Low-string study', exact: true })).toBeVisible();
  await expect(page.locator('.score-loading')).toHaveCount(0);
  await page.locator('.alphatab-host').scrollIntoViewIfNeeded();
  const inspector = await explore(page);
  await expect(inspector.locator('.note-identity h2')).toHaveText('E');
  await inspector.getByRole('button', { name: 'Exact pitch', exact: true }).click();
  await expect(inspector.locator('.exploration-board button')).toHaveCount(1);
  await inspector.getByRole('button', { name: 'Practice finding this note', exact: true }).click();
  await expect(
    page.getByText(
      'This note has no other location under that matching rule. Choose Any octave to explore a different register.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(inspector.locator('.note-identity h2')).toHaveText('E');
  await expect(page.getByTestId('exercise-card')).toHaveCount(0);
  if (test.info().project.name === 'mobile')
    await expect(page.getByRole('dialog', { name: 'Inside the notes', exact: true })).toBeVisible();
  else
    await expect(page.getByRole('tab', { name: 'Understand', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  await inspector.getByRole('button', { name: 'Any octave', exact: true }).click();
  await inspector.getByRole('button', { name: 'Practice finding this note', exact: true }).click();
  await expect(page.getByTestId('exercise-card').getByRole('heading')).toHaveText(
    'Find another E in any octave. Start from string 6, fret 0.',
  );
  await expect(
    page.getByRole('checkbox', { name: 'Match the exact octave (advanced)', exact: true }),
  ).not.toBeChecked();
  await expect(page.locator('.teaching-cue strong')).toHaveText('Try string 1, fret 0');
});
