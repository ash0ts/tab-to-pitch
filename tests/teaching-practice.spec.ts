import { test, expect, type Page } from '@playwright/test';

async function data(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
}
test('a learner can revise a phrase, choose help, and resume a goal without reading chat', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  const workspace = page.getByRole('region', { name: 'Practice workspace', exact: true });
  await workspace
    .getByRole('button', { name: 'Make something with this idea', exact: true })
    .click();
  await workspace.getByRole('button', { name: 'Build a phrase', exact: true }).click();
  await expect(page.locator('.music-workspace')).toBeHidden();
  const task = page.getByTestId('musicianship-task');
  await task.getByRole('button', { name: 'Check my response', exact: true }).click();
  await expect(task).toContainText('use at least three sounding notes');
  await task.getByText('Choose some help', { exact: true }).click();
  await task.getByRole('button', { name: 'Attention cue', exact: true }).click();
  let history = await data(page);
  expect(
    history.lessonEvents.filter((e: { kind: string }) => e.kind === 'practice-support'),
  ).toHaveLength(1);
  await expect(task).toContainText('Choose the destination first');
  await task.getByRole('combobox', { name: 'Bar 1, beat 1', exact: true }).selectOption('55');
  await task.getByRole('combobox', { name: 'Bar 1, beat 2', exact: true }).selectOption('53');
  await task.getByRole('combobox', { name: 'Bar 2, beat 1', exact: true }).selectOption('52');
  await task.getByRole('button', { name: 'Hear my response', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await task.getByRole('button', { name: 'Stop', exact: true }).click();
  await task.getByRole('button', { name: 'Try this revision', exact: true }).click();
  await expect(task).toContainText('meets all three constraints');
  history = await data(page);
  const attempts = history.lessonEvents.filter(
    (e: { kind: string }) => e.kind === 'practice-response',
  );
  expect(
    attempts.map((e: { practice: { evidence: unknown } }) => e.practice.evidence),
  ).toMatchObject([
    { firstResponse: true, outcome: 'incorrect', assisted: false },
    { firstResponse: false, outcome: 'correct', assisted: true },
  ]);
  expect(history.lessons[0].practice.episode.firstResponse.cells).toEqual(Array(16).fill(null));
  await workspace.getByText('Reflect & bookmark (optional)', { exact: true }).click();
  await workspace
    .getByRole('textbox', { name: 'What helped, or what would you try next?' })
    .fill('Leaving space helped me hear the arrival.');
  await workspace.getByRole('button', { name: 'Save reflection & bookmark', exact: true }).click();
  await page.reload();
  await expect(
    workspace.getByRole('heading', { name: 'Make a two-bar response', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(workspace).toContainText('Bookmark saved');
  expect(errors).toEqual([]);
});

test('rhythm and expression keep wrong answers masked and factual differences separate from preference', async ({
  page,
}) => {
  await page.goto('/');
  const workspace = page.getByRole('region', { name: 'Practice workspace', exact: true });
  await workspace
    .getByRole('button', { name: 'Play this passage more musically', exact: true })
    .click();
  await workspace.getByRole('button', { name: 'Rhythm & timing', exact: true }).click();
  await workspace.getByRole('button', { name: 'Hear original study', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await workspace.getByRole('button', { name: 'Stop', exact: true }).click();
  await workspace.getByRole('button', { name: 'Check my response', exact: true }).click();
  await expect(workspace).toContainText('pattern differs in bar 1');
  await expect(page.locator('.music-workspace')).toBeHidden();
  await workspace.getByRole('button', { name: 'Expression', exact: true }).click();
  for (const version of ['A', 'B']) {
    await workspace.getByRole('button', { name: `Hear version ${version}`, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
    await workspace.getByRole('button', { name: 'Stop', exact: true }).click();
  }
  await workspace.getByRole('radio', { name: 'articulation', exact: true }).check();
  await workspace
    .getByRole('textbox', { name: 'What would you choose, and why? (optional)' })
    .fill('I prefer the connected version for a calmer response.');
  await workspace.getByRole('button', { name: 'Check my response', exact: true }).click();
  await expect(workspace).toContainText('not a right or wrong artistic choice');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByText('Change goal', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Musical goal', exact: true }).fill('Hear the seventh');
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  await expect(
    workspace.getByRole('heading', { name: 'Hear the seventh', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('focused help does not reopen unrelated history, and stopping a question restores conversation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Make something with this idea', exact: true }).click();
  await page.getByRole('button', { name: 'Build a phrase', exact: true }).click();
  await page.getByRole('button', { name: 'Open teacher', exact: true }).click();
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  const help = teacher.getByRole('button', { name: 'Explain this question', exact: true });
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(teacher.getByRole('log')).toHaveCount(0);
  await expect(page.getByTestId('musicianship-task')).toContainText(
    'There are many valid responses.',
  );
  const history = await data(page);
  expect(
    history.lessonEvents.some(
      (e: { kind: string; practice?: { support: string } }) =>
        e.kind === 'practice-support' && e.practice?.support === 'answer',
    ),
  ).toBe(true);
  await teacher.getByRole('button', { name: 'Stop question and talk', exact: true }).click();
  await expect(teacher.getByRole('textbox', { name: 'Your question', exact: true })).toBeVisible();
  expect(
    (await data(page)).lessonEvents.some(
      (e: { kind: string; detail?: string }) =>
        e.kind === 'interrupted' && e.detail?.includes('stopped the question to talk'),
    ),
  ).toBe(true);
});
