import { test, expect } from '@playwright/test';
async function open(page: import('@playwright/test').Page) {
  await page.goto('/#/stage/ear-lab');
  await page.getByRole('button', { name: 'Open original listening study', exact: true }).click();
  return page.getByRole('region', { name: 'Work it out by ear' });
}
test('heard proposal, masked answer, frozen evidence, and confirmed derived progression', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ear = await open(page);
  await ear.getByRole('button', { name: 'Hear passage', exact: true }).click();
  await expect
    .poll(() => ear.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.1);
  await ear.getByRole('button', { name: 'Try without help', exact: true }).click();
  await expect(page.locator('.music-workspace')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Progression studio', exact: true })).toHaveCount(
    0,
  );
  await expect(ear.getByRole('heading', { name: 'Model hypothesis', exact: true })).toHaveCount(0);
  await ear.getByLabel('Your chord 1', { exact: true }).fill('G');
  await ear.getByLabel('Your chord 2', { exact: true }).fill('Cmaj7');
  await ear.getByRole('button', { name: 'Check my proposal' }).click();
  await expect(ear).toContainText('Root matches · quality differs');
  const stored = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
  const evidence = stored.lessonEvents.find(
    (e: { kind: string }) => e.kind === 'audio-response',
  ).audioEvidence;
  expect(evidence).toMatchObject({
    assisted: false,
    referenceVersion: 'authored-g7-cmaj7-v1',
    proposal: ['G', 'Cmaj7'],
    grade: [
      { root: true, quality: false },
      { root: true, quality: true },
    ],
  });
  await ear.getByLabel('Your chord 1', { exact: true }).fill('G7');
  await ear.getByRole('button', { name: 'Play my proposal across the neck' }).click();
  const studio = page.getByRole('region', { name: 'Progression studio', exact: true });
  await expect(studio).toBeVisible();
  await expect(studio).toContainText('G7');
  await expect(studio).toContainText('Cmaj7');
  expect(errors).toEqual([]);
});
test('help precedes exposure and reload retains the local audio source', async ({ page }) => {
  const ear = await open(page);
  await ear.getByRole('button', { name: 'Try without help', exact: true }).click();
  await ear.getByRole('button', { name: 'Get help · marks this attempt assisted' }).click();
  await expect(ear.getByRole('heading', { name: 'Investigate one uncertainty' })).toBeVisible();
  await ear.getByLabel('Your chord 1', { exact: true }).fill('G7');
  await ear.getByLabel('Your chord 2', { exact: true }).fill('Cmaj7');
  await ear.getByRole('button', { name: 'Check my proposal' }).click();
  await expect(ear).toContainText('Answer saved locally.');
  await page.reload();
  await expect(ear.getByLabel('Your chord 1', { exact: true })).toHaveValue('G7');
  const stored = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
  expect(
    stored.lessonEvents.find((e: { kind: string }) => e.kind === 'audio-response').audioEvidence
      .assisted,
  ).toBe(true);
  expect(stored.lessons.at(-1).source.kind).toBe('audio-excerpt');
});
