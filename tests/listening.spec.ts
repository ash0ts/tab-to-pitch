import { expect, test } from '@playwright/test';

test('song list to listening feedback to the shared fretboard, with masked first response', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Choose a song' }).click();
  await expect(page.getByRole('region', { name: 'Learn from my songs' })).toContainText(
    'Needs song/version confirmation',
  );
  await page.getByRole('button', { name: 'Four chords, one key' }).click();
  const lesson = page.getByRole('region', { name: 'Listening lesson' });
  await lesson.getByLabel('Listening difficulty').selectOption('recall');
  await lesson.getByRole('button', { name: 'Try a listening question' }).click();
  await expect(page.locator('.music-workspace')).toBeHidden();
  await expect(page.locator('.progression-studio')).toHaveCount(0);
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await teacher.getByRole('button', { name: 'Open teacher', exact: true }).click();
  await expect(teacher.getByRole('log')).toHaveCount(0);
  for (const [i, value] of ['D', 'G7', 'Cmaj7', 'Am7'].entries())
    await lesson.getByLabel(`Chord at change ${i + 1}`).selectOption(value);
  await lesson.getByRole('button', { name: 'Check progression' }).click();
  await expect(lesson).toContainText('The root matches; compare the chord quality.');
  await lesson.getByRole('button', { name: 'Find this progression on the neck' }).click();
  await expect(page.getByRole('region', { name: 'Progression studio', exact: true })).toBeVisible();
  await teacher
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill('Help me understand my missed chord quality.');
  await teacher.getByRole('button', { name: 'Ask on-device guide' }).click();
  await expect(teacher.getByRole('log')).toContainText('Your recorded roots matched');
  const records = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
  expect(records.listeningAttempts).toHaveLength(1);
  expect(records.listeningAttempts[0]).toMatchObject({
    assisted: false,
    outcome: 'answered',
    grade: { root: [true, true, true, true], quality: [false, true, true, true] },
  });
  expect(records.lessons.at(-1).source.kind).toBe('catalog-passage');
  expect(errors).toEqual([]);
});

test('teacher help is recorded before revealing answers; reload preserves evidence', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Choose a song' }).click();
  await page.getByRole('button', { name: 'Four chords, one key' }).click();
  const lesson = page.getByRole('region', { name: 'Listening lesson' });
  await lesson.getByRole('button', { name: 'Try a listening question' }).click();
  await lesson.getByRole('button', { name: 'Ask for teacher help' }).click();
  await expect(lesson).toContainText('This answer will count as assisted');
  await lesson.getByLabel('Chord at change 1').selectOption('Dm7');
  await lesson.getByRole('button', { name: 'Check progression' }).click();
  await expect(lesson).toContainText('The progression matches');
  await page.reload();
  await page.getByRole('button', { name: 'Choose a song' }).click();
  await page.getByRole('button', { name: 'Four chords, one key' }).click();
  await expect(lesson).toBeVisible();
  const records = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).getLessonData();
  });
  expect(records.listeningAttempts[0]).toMatchObject({ assisted: true, grade: { correct: true } });
  expect(
    records.lessonEvents.some((e: { kind: string }) => e.kind === 'listening-assistance'),
  ).toBe(true);
});

test('counts actual synthesized playback and transfers to another key', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Choose a song' }).click();
  await page.getByRole('button', { name: 'Four chords, one key' }).click();
  const lesson = page.getByRole('region', { name: 'Listening lesson' });
  await lesson.getByRole('button', { name: 'Try a listening question' }).click();
  await lesson.getByRole('button', { name: 'Hear synthesized passage' }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await lesson.getByLabel('Chord at change 1').selectOption('D');
  await lesson.getByRole('button', { name: 'Check progression' }).click();
  await expect(lesson).toContainText('1 playback starts');
  await lesson.getByLabel('Listening difficulty').selectOption('transfer');
  await expect(lesson).toContainText('The same relationships in G');
  await expect(lesson).toContainText('Key: G major');
  await expect(lesson.getByLabel('Listening difficulty')).toHaveValue('transfer');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeVisible();
});

test('visible recording preview coordinates ownership and reports unavailable video', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).YT = {
      Player: class {
        options: any;
        constructor(element: HTMLElement, options: any) {
          this.options = options;
          element.textContent = 'YouTube player API test double';
          (window as any).testRecording = this;
          queueMicrotask(() => options.events.onReady());
        }
        pauseVideo() {}
        destroy() {}
        playVideo() {
          this.options.events.onStateChange({ data: 1 });
        }
        cueVideoById() {}
      },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Play score', exact: true }).click();
  await page.getByRole('button', { name: 'Choose a song' }).click();
  await page.getByText('What is available?', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Preview recording · quiz pending' }).first().click();
  await page.evaluate(() => (window as any).testRecording.playVideo());
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeVisible();
  const preview = page.getByRole('region', { name: 'Recording preview' });
  await expect(preview.getByRole('button', { name: 'Replay recording excerpt' })).toBeDisabled();
  await page.evaluate(() => (window as any).testRecording.options.events.onError({ data: 150 }));
  await expect(preview).toContainText('This recording cannot play here');
});
