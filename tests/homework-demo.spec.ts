import { test, expect, type Locator } from '@playwright/test';

test('original homework walkthrough: note, families, progression, seventh to third', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function hold(target: Locator, name: string) {
    await target.evaluate((node) => node.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `../homework-demo-${name}.png` });
  }
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Fretboard homework', exact: true }).click();
  const hw = page.getByRole('region', { name: 'Fretboard homework', exact: true });
  await hw.getByRole('button', { name: 'Open C–F–G–C study' }).click();
  await expect(hw.getByRole('button', { name: 'Start homework' })).toBeEnabled();
  await hw.getByText('Choose a specific task', { exact: true }).click();
  await hw.getByRole('button', { name: 'Find a note', exact: true }).click();
  await hold(hw, '01-recall');
  const board = hw.getByRole('region', { name: 'Homework interactive fretboard' });
  await board.getByRole('button', { name: 'String 2, fret 0', exact: true }).click();
  await hw.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(hw).toContainText('Check the requested string and note');
  await hw.getByText('Choose some help', { exact: true }).click();
  await hw.getByRole('button', { name: 'Attention cue', exact: true }).click();
  await hold(hw.locator('.homework-task-heading'), '02-help');
  await board.getByRole('button', { name: 'String 2, fret 1', exact: true }).click();
  await hw.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(hw).toContainText('meets the stated musical constraints');
  await page.waitForTimeout(1000);
  await hw.getByRole('button', { name: 'Pause homework' }).click();
  await hw.getByRole('button', { name: 'Explore', exact: true }).click();
  await hw.getByRole('button', { name: 'C family', exact: true }).click();
  await hold(hw.locator('.caged-families'), '03-c-family');
  await hw.getByRole('button', { name: 'A family', exact: true }).click();
  await hold(hw.locator('.caged-families'), '04-a-family');
  await hw.getByRole('button', { name: 'Apply', exact: true }).click();
  for (const [region, shot] of [
    ['0–5', '05-low-progression'],
    ['5–9', '06-high-progression'],
  ]) {
    await hw.getByRole('button', { name: `Use frets ${region}` }).click();
    await expect(hw.getByRole('button', { name: 'Preview in shared player' })).toBeEnabled();
    await hw.getByRole('button', { name: 'Preview in shared player' }).click();
    await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Play score', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
    await hold(board, shot!);
    await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  }
  await hw.getByRole('button', { name: 'Original', exact: true }).click();
  await hw.getByText('Choose a specific task', { exact: true }).click();
  await hw.getByRole('button', { name: 'Seventh → third', exact: true }).click();
  await hold(hw, '07-connection');
  await board.getByRole('button', { name: 'String 2, fret 6', exact: true }).click();
  await board.getByRole('button', { name: 'String 2, fret 5', exact: true }).click();
  await hw.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(hw).toContainText('Your pair satisfies both roles');
  await hold(hw.locator('.homework-task-heading'), '08-connection-answer');
  expect(errors).toEqual([]);
});
