import { test, expect, type Page } from '@playwright/test';
import { syntheticInput, play } from './guitar-input-fixture';
async function open(page: Page, fromStudio = false) {
  await page.goto(fromStudio ? '/#/studio' : '/#/stage/homework');
  if (fromStudio)
    await page.getByRole('button', { name: 'Continue practicing', exact: true }).click();
  const hw = page.getByRole('region', { name: 'Guitar homework', exact: true });
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await hw.getByRole('button', { name: 'Start guitar homework', exact: true }).click();
  await expect(hw.getByRole('heading', { name: 'Find C', exact: true })).toBeVisible();
  return hw;
}
async function data(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
}
test('unplugged playing preserves reports, help, first response and resume', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const hw = await open(page);
  await hw.getByRole('button', { name: 'Try without labels' }).click();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await expect(hw).toContainText('Play at your own pace');
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await hw.getByRole('button', { name: 'Needs another pass', exact: true }).click();
  await expect(hw).toContainText('You reported: Needs another pass');
  await hw.getByRole('button', { name: 'Hear example', exact: true }).click();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await hw.getByRole('button', { name: 'Felt secure', exact: true }).click();
  const saved = await data(page),
    answers = saved.lessonEvents.filter((e: any) => e.playing?.kind === 'self-report');
  expect(
    answers.map((e: any) => [e.playing.responseIndex, e.playing.selfReport, e.playing.assisted]),
  ).toEqual([
    [0, 'needs-another-pass', false],
    [1, 'felt-secure', true],
  ]);
  expect(new Set(answers.map((e: any) => e.playing.episodeId)).size).toBe(1);
  expect(saved.lessonEvents.filter((e: any) => e.live?.attempt)).toHaveLength(0);
  await hw.getByRole('button', { name: 'Next musical step' }).click();
  await expect(hw.getByRole('heading', { name: 'Find F', exact: true })).toBeVisible();
  await expect(hw.getByText('Homework saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(hw.getByRole('heading', { name: 'Find F', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await hw.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await page.screenshot({ path: `../guitar-homework-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
test('optional input stays in the assignment and uncertainty remains unassessed', async ({
  page,
}) => {
  await syntheticInput(page);
  const hw = await open(page);
  await hw.getByLabel('Response method').selectOption('live');
  await hw.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(hw.getByText('● Listening locally', { exact: true })).toBeVisible();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await play(page, [60]);
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await expect(hw.getByText('Supported match', { exact: true })).toBeVisible();
  await play(page, [], 0.2);
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await expect(hw.getByText('Could not assess', { exact: true })).toBeVisible();
  const saved = await data(page);
  const refs = saved.lessonEvents.filter((e: any) => e.playing?.performanceAttemptId);
  const attempts = saved.lessonEvents.flatMap((e: any) =>
    e.live?.attempt ? [e.live.attempt] : [],
  );
  expect(refs).toHaveLength(2);
  expect(attempts.map((a: any) => a.outcome)).toEqual(['match', 'unassessed']);
  expect(refs.map((e: any) => e.playing.performanceAttemptId)).toEqual(
    attempts.map((a: any) => a.id),
  );
  expect(attempts.every((a: any) => !a.positionVerified && !a.timingGraded)).toBe(true);
  await hw.getByLabel('Response method').selectOption('self-report');
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await hw.getByRole('button', { name: 'Not sure', exact: true }).click();
  const reports = (await data(page)).lessonEvents.filter(
    (e: any) => e.playing?.kind === 'self-report',
  );
  expect(reports[0].playing.responseIndex).toBe(2);
  expect(reports[0].playing.episodeId).toBe(attempts[0].episodeId);
});
test('a derived F to E study plays backing and preserves the live homework attempt from Studio', async ({
  page,
}) => {
  await syntheticInput(page);
  const hw = await open(page, true);
  await hw.getByText('Choose a different task', { exact: true }).click();
  await hw.getByRole('button', { name: 'Authored connection · G7 → Cmaj7', exact: true }).click();
  await hw.getByLabel('Response method').selectOption('live');
  await hw.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(hw.getByText('● Listening locally', { exact: true })).toBeVisible();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await play(page, [], 0.4);
  await expect(hw.getByRole('button', { name: 'Finish attempt', exact: true })).toBeEnabled();
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await expect(hw.getByText('Could not assess', { exact: true })).toBeVisible();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await play(page, [65]);
  await play(page, [], 0.2);
  await play(page, [64]);
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await expect(hw.getByText('Supported match', { exact: true })).toBeVisible();
  const attempts = (await data(page)).lessonEvents.flatMap((e: any) =>
    e.live?.attempt ? [e.live.attempt] : [],
  );
  expect(attempts.map((a: any) => a.outcome)).toEqual(['unassessed', 'match']);
  expect(attempts[1].episodeId).toBe(attempts[0].episodeId);
  expect(attempts[1].responseIndex).toBe(1);
});
test('teacher help precedes exposure and uses the v5 homework context', async ({ page }) => {
  const hw = await open(page);
  await hw.getByRole('button', { name: 'Try without labels' }).click();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await page.getByRole('button', { name: 'Open music teacher', exact: true }).click();
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await expect(teacher.getByRole('textbox', { name: 'Your question', exact: true })).toHaveCount(0);
  await teacher.getByRole('button', { name: 'Ask for help and show the conversation' }).click();
  expect((await data(page)).lessonEvents.some((e: any) => e.playing?.support === 'teacher')).toBe(
    true,
  );
  await teacher
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill('Stop quizzing me. I just want to play.');
  await teacher.getByRole('button', { name: 'Ask on-device guide', exact: true }).click();
  await expect(teacher.getByRole('log')).toContainText(/play|explor/i);
  await expect(teacher.getByText('The teacher request is invalid', { exact: false })).toHaveCount(
    0,
  );
});
test('source changes and reload interrupt an attempt without replacing its first response', async ({
  page,
}) => {
  const hw = await open(page);
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await expect(hw.getByText('Homework saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(hw.getByText('Attempt interrupted', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await hw.getByRole('button', { name: 'Felt secure', exact: true }).click();
  const events = (await data(page)).lessonEvents.filter(
    (e: any) => e.playing && ['interrupted', 'self-report'].includes(e.playing.kind),
  );
  expect(events.map((e: any) => [e.playing.kind, e.playing.responseIndex])).toEqual([
    ['interrupted', 0],
    ['self-report', 1],
  ]);
});

test('reloading active USB homework links the interrupted performance and leaves capture stopped', async ({
  page,
}) => {
  await syntheticInput(page);
  const hw = await open(page);
  await hw.getByLabel('Response method').selectOption('live');
  await hw.getByRole('button', { name: 'Connect guitar', exact: true }).click();
  await expect(hw.getByText('● Listening locally', { exact: true })).toBeVisible();
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await expect(hw.getByText('Homework saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(hw.getByText('Attempt interrupted', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(hw.getByText('Input stopped', { exact: true })).toBeVisible();
  const saved = await data(page),
    attempts = saved.lessonEvents.flatMap((e: any) => (e.live?.attempt ? [e.live.attempt] : [])),
    refs = saved.lessonEvents.flatMap((e: any) =>
      e.playing?.performanceAttemptId ? [e.playing] : [],
    );
  expect(attempts).toHaveLength(1);
  expect(attempts[0].outcome).toBe('interrupted');
  expect(refs).toHaveLength(1);
  expect(refs[0].performanceAttemptId).toBe(attempts[0].id);
  expect(refs[0].responseIndex).toBe(0);
});

test('a bookmark restores the selected region and constraints into the shared workspace', async ({
  page,
}) => {
  await page.goto('/#/stage/homework');
  await expect(
    page.getByRole('button', { name: 'Start guitar homework', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await page.evaluate(() => {
    location.hash = '/stage/progression';
  });
  await page.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
  await page.evaluate(() => {
    location.hash = '/stage/homework';
  });
  const hw = page.getByRole('region', { name: 'Guitar homework', exact: true });
  await hw.getByRole('button', { name: 'Start guitar homework', exact: true }).click();
  await expect(hw.getByText('Homework saved on this device', { exact: true })).toBeVisible();
  const before = (await data(page)).lessons.find((l: any) => l.homework?.playing)?.homework;
  expect(before.region).toEqual({ minFret: 5, maxFret: 9 });
  await page.getByRole('button', { name: 'Save for next time', exact: true }).first().click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save for next time', exact: true })
    .click();
  await page.reload();
  await expect(page.locator('.resume-line')).toContainText('Find C · frets 5–9');
  await page.getByRole('button', { name: 'Continue practicing', exact: true }).click();
  await expect(hw.getByRole('button', { name: 'Play along', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await expect(hw.getByRole('alert')).toHaveCount(0);
  await hw.getByRole('button', { name: 'Play along', exact: true }).click();
  await hw.getByRole('button', { name: 'Finish attempt', exact: true }).click();
  await hw.getByRole('button', { name: 'Felt secure', exact: true }).click();
  const after = (await data(page)).lessons.find((l: any) => l.homework?.playing)?.homework;
  expect(after.contextVersion).toBe(before.contextVersion);
  expect(after.playing.workspace.options.minFret).toBe(5);
});
