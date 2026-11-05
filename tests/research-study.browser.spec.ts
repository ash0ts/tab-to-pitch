import { test, expect } from '@playwright/test';
test('measured research exposes trial outcomes, failures, provenance and stable case links', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/research/guitar-teacher/index.html');
  await expect(page.locator('#results')).toBeVisible();
  const data = await (await page.request.get('/research/guitar-teacher/results.json')).json();
  expect(data.cases).toHaveLength(72);
  expect(data.critic).toHaveLength(48);
  await expect(page.locator('#outcomes tr')).toHaveCount(3);
  await expect(page.locator('#responses article')).toHaveCount(5);
  await page.getByLabel('Task', { exact: true }).selectOption('move');
  await expect(page.locator('#case-count')).toContainText('36 of 72');
  const target = data.cases.find(
    (c: any) => c.kind === 'move' && c.rows.some((r: any) => r.failure),
  );
  await page.getByLabel('Passage and task').selectOption(target.id);
  await expect(page).toHaveURL(
    new RegExp('case=' + encodeURIComponent(target.id).replaceAll('.', '\\.')),
  );
  await expect(page.locator('#context')).toContainText(target.passage.recording);
  await expect(page.locator('#responses')).toContainText('Fallback');
  await page.reload();
  await expect(page.getByLabel('Passage and task')).toHaveValue(target.id);
  await page.getByText('Annotation provenance', { exact: true }).click();
  await expect(page.locator('#context pre')).toContainText(target.passage.sourceSha256);
  await expect(page.locator('#remote-links a')).toHaveCount(5);
  const response = await page.request.get('/research/guitar-teacher/evidence.json');
  expect(response.ok()).toBe(true);
  await page.getByLabel('Task', { exact: true }).selectOption('role');
  await page.getByLabel('Task', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Paired outcome')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#cases').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `../guitar-teacher-cases-${info.project.name}.png` });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `../guitar-teacher-report-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
