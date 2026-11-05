import { test, expect, type Page } from '@playwright/test';
async function open(page: Page) {
  await page.goto('/#/stage/homework');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', {name:'Explore or check the fretboard',exact:true}).click();
  const hw = page.getByRole('region', { name: 'Fretboard homework', exact: true });
  await hw.getByText('Workload, neck region & source', { exact: true }).click();
  await hw.getByRole('button', { name: 'Open C–F–G–C study' }).click();
  await expect(page.getByText('A familiar chord, a wider neck', { exact: true })).toBeVisible();
  await expect(hw.getByRole('button', { name: 'Start homework', exact: true })).toBeEnabled();
  return hw;
}
async function data(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
}
test('homework masks all cells, records assistance before reveal, keeps first answer and resumes', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const hw = await open(page);
  await hw.getByText('Choose a specific task', { exact: true }).click();
  await hw.getByRole('button', { name: 'Find a note', exact: true }).click();
  await expect(hw).toContainText('Find C on string 2');
  const board = hw.getByRole('region', { name: 'Homework interactive fretboard' });
  await expect(board.getByRole('button')).toHaveCount(36);
  await expect(
    board.locator('[class*="role-root"], [class*="role-third"], [class*="role-fifth"]'),
  ).toHaveCount(0);
  expect(await board.ariaSnapshot()).not.toMatch(/, [A-G](?:,|[0-9])/);
  await board.getByRole('button', { name: 'String 2, fret 0', exact: true }).click();
  await hw.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(hw).toContainText('Check the requested string and note');
  await hw.getByText('Choose some help', { exact: true }).click();
  await hw.getByRole('button', { name: 'Partial shape', exact: true }).click();
  let saved = await data(page);
  expect(
    saved.lessonEvents.some(
      (e: any) => e.homework?.kind === 'support' && e.homework.support === 'partial',
    ),
  ).toBe(true);
  await board.getByRole('button', { name: 'String 2, fret 1', exact: true }).click();
  await hw.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(hw).toContainText('meets the stated musical constraints');
  saved = await data(page);
  const answers = saved.lessonEvents
    .filter((e: any) => e.homework?.kind === 'answer')
    .map((e: any) => e.homework);
  expect(answers).toMatchObject([
    { correct: false, firstResponse: true, assisted: false },
    { correct: true, firstResponse: false, assisted: true },
  ]);
  const lesson = saved.lessons.find((l: any) => l.homework);
  expect(lesson.homework.responses[0].positions).toEqual([{ string: 2, fret: 0 }]);
  await hw.getByRole('button', { name: 'Pause homework' }).click();
  await hw.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(hw.locator('.selected-cell')).toHaveCount(0);
  await expect(hw.locator('.practice-feedback')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', {name:'Explore or check the fretboard',exact:true}).click();
  await hw.getByText('Workload, neck region & source', { exact: true }).click();
  await hw.getByRole('button', { name: 'Open C–F–G–C study' }).click();
  await expect
    .poll(
      async () =>
        (await data(page)).lessons.find((l: any) => l.homework)?.homework.responses.length,
    )
    .toBe(2);
  await hw.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.screenshot({ path: `../homework-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
test('application uses the shared player and saves a separate variation in two regions', async ({
  page,
}) => {
  const hw = await open(page);
  await hw.getByRole('button', { name: 'Apply', exact: true }).click();
  await hw.getByRole('button', { name: 'Use frets 5–9' }).click();
  await expect(hw.getByRole('button', { name: 'Preview in shared player' })).toBeEnabled({
    timeout: 20000,
  });
  await hw.getByRole('button', { name: 'Preview in shared player' }).click();
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play score', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await hw.getByRole('button', { name: 'Apply & save variation' }).click();
  await hw.getByRole('button', { name: 'Use frets 0–5' }).click();
  await expect(hw.getByRole('button', { name: 'Preview in shared player' })).toBeEnabled();
  await hw.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.alphatab-host .at-surface')).toHaveCount(1);
});

test('teacher help is marked before conversation becomes available', async ({ page }) => {
  const hw = await open(page);
  await hw.getByRole('button', { name: 'Start homework', exact: true }).click();
  const mobileTeacher = page.getByRole('button', { name: 'Open music teacher', exact: true });
  if (await mobileTeacher.isVisible()) await mobileTeacher.click();
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await expect(teacher.getByRole('textbox', { name: 'Your question', exact: true })).toHaveCount(0);
  await teacher.getByRole('button', { name: 'Ask for help and show the conversation' }).click();
  expect(
    (await data(page)).lessonEvents.some(
      (e: any) => e.homework?.kind === 'support' && e.homework.support === 'answer',
    ),
  ).toBe(true);
  await teacher
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill('An E shape always means E major, right?');
  await teacher.getByRole('button', { name: 'Ask on-device guide', exact: true }).click();
  await expect(teacher.getByRole('log')).toContainText('E-family shape can sound G major');
});

test('keyboard answers remain selectable; returning to Play pauses homework before exposure', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const hw = await open(page);
  await hw.getByText('Choose a specific task', { exact: true }).click();
  await hw.getByRole('button', { name: 'Find a note', exact: true }).click();
  const cell = hw.getByRole('button', { name: 'String 2, fret 1', exact: true });
  await cell.focus();
  await page.keyboard.press('Enter');
  await expect(hw).toContainText('Selected: S2:1');
  await hw.getByRole('button', { name: 'Check answer', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(hw).toContainText('meets the stated musical constraints');
  await page.getByRole('tab', { name: 'Play', exact: true }).click();
  await expect(hw).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible();
  const saved = await data(page);
  expect(saved.lessons.find((l: any) => l.homework)?.homework.status).toBe('paused');
  expect(saved.lessonEvents.some((e: any) => e.homework?.kind === 'interrupted')).toBe(true);
});

test('the teacher starts homework from exploration with the selected workload and region', async ({
  page,
}) => {
  const hw = await open(page);
  if (!(await hw.getByLabel('Suggested workload').isVisible())) await hw.getByText('Workload, neck region & source', { exact: true }).click();
  await hw.getByLabel('Suggested workload').selectOption('5');
  await hw.getByLabel('Homework neck region').selectOption('5');
  const trigger = page.getByRole('button', { name: 'Open music teacher', exact: true });
  if (await trigger.isVisible()) await trigger.click();
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await teacher
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill('Help me find C.');
  await teacher.getByRole('button', { name: 'Ask on-device guide' }).click();
  await teacher.getByRole('button', { name: 'Try locate homework' }).click();
  await expect(hw).toContainText('5 min workload');
  await expect(hw).toContainText('Find C on string 1');
  await expect(
    hw.getByRole('region', { name: 'Homework interactive fretboard' }).getByRole('button'),
  ).toHaveCount(30);
});
