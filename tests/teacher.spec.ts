import { expect, test, type Page } from '@playwright/test';
import { localTeacher } from '../src/engine/teacher';
import { executeArrangementIntent } from '../src/shared/arrangements';
import type { TeacherRequest } from '../src/shared/teacher';

async function showTeacher(page: Page) {
  const trigger = page.getByRole('button', { name: 'Open music teacher', exact: true });
  if (await trigger.isVisible()) await trigger.click();
  const open = page
    .getByRole('region', { name: 'Music teacher', exact: true })
    .getByRole('button', { name: 'Open teacher', exact: true });
  if (await open.isVisible()) await open.click();
}
async function showTask(page: Page) {
  const close = page.getByRole('button', { name: 'Back to my task', exact: true });
  if (await close.isVisible()) await close.click();
}
async function study(page: Page) {
  await page.goto('/#/stage/progression');
  await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Open ii–V–I study' }).click();
  const studio = page.getByRole('region', { name: 'Progression studio', exact: true });
  await expect(
    studio.getByRole('button', { name: 'Preview variation', exact: true }),
  ).toBeVisible();
  await studio.getByRole('button', { name: 'Frets 5–9', exact: true }).click();
  await expect(studio.locator('.shape-navigation')).toContainText('variation 1');
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await page.getByRole('button', { name: 'Open music teacher', exact: true }).click();
  return { teacher, studio };
}

async function ask(page: Page, text: string) {
  await showTeacher(page);
  const teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
  await teacher.getByRole('textbox', { name: 'Your question', exact: true }).fill(text);
  await teacher.getByRole('button', { name: /^(Ask on-device guide|Ask teacher)$/ }).click();
  await expect(teacher.locator('.teacher-message.assistant').last()).toBeVisible();
}

async function records(page: Page, store = 'attempts') {
  return page.evaluate(async (name) => {
    const modulePath = '/src/storage.ts';
    const storage = await import(modulePath);
    if (name === 'attempts') return storage.getAttempts();
    return storage.getLessonData();
  }, store);
}

test('teaches roles, exact chord connections and extensions through the shared practice UI', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { teacher } = await study(page);
  await ask(page, 'Help me name the chord roles.');
  await teacher.getByRole('button', { name: 'Try this question', exact: true }).click();
  await showTask(page);
  const card = page.getByTestId('exercise-card');
  await expect(card).toContainText('What role does F have in Dm7?');
  await card.getByRole('textbox', { name: 'Type your answer', exact: true }).fill('minor third');
  await card.getByRole('button', { name: 'Submit typed answer' }).click();
  await expect(card).toContainText('Correct.');
  await card.getByRole('button', { name: 'Continue with teacher' }).click();
  await showTeacher(page);
  await teacher.getByRole('button', { name: 'Connect the chords', exact: true }).click();
  await ask(page, 'Show me how G7 resolves to Cmaj7.');
  await teacher.getByRole('button', { name: 'Try this question', exact: true }).click();
  await showTask(page);
  await expect(card).toContainText('down 1 semitone');
  await card
    .getByRole('textbox', { name: 'Type starting string:fret to ending string:fret' })
    .fill('2:6 -> 2:5');
  await card.getByRole('button', { name: 'Submit typed answer' }).click();
  await expect(card).toContainText('Correct.');
  await card.getByRole('button', { name: 'Continue with teacher' }).click();
  await showTeacher(page);
  await teacher
    .getByRole('button', { name: 'Extensions and rootless chords', exact: true })
    .click();
  await ask(page, 'What does adding a ninth change?');
  await teacher.getByRole('button', { name: 'Try this question', exact: true }).click();
  await showTask(page);
  await expect(card).toContainText('Dm9');
  await card.getByRole('textbox', { name: 'Type a note name', exact: true }).fill('E');
  await card.getByRole('button', { name: 'Submit typed answer' }).click();
  await expect(card).toContainText('Correct.');
  await card.getByRole('button', { name: 'Continue with teacher' }).click();
  await showTeacher(page);
  await ask(page, 'Explain a rootless voicing over the bass.');
  await expect(teacher.getByRole('button', { name: 'Hear the upper shape alone' })).toBeVisible();
  await expect(teacher.getByRole('button', { name: 'Hear with the bass' })).toBeVisible();
  await teacher.getByRole('button', { name: 'Hear with the bass' }).click();
  await expect(teacher.getByRole('region', { name: 'Teacher demonstration' })).toBeVisible();
  const history = await records(page);
  expect(history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'chord-tone', outcome: 'correct', assisted: false }),
      expect.objectContaining({ kind: 'voice-connection', outcome: 'correct', assisted: false }),
      expect.objectContaining({ kind: 'changed-tone', outcome: 'correct', assisted: false }),
    ]),
  );
  expect(errors).toEqual([]);
});

test('hides conversation and diagrams during recall; help records assistance before revealing history', async ({
  page,
}) => {
  const { teacher } = await study(page);
  await ask(page, 'Help me name the chord roles.');
  await expect(teacher.locator('.teacher-message.assistant')).toContainText('minor third');
  await teacher.getByRole('button', { name: 'Try this question' }).click();
  await expect(teacher.locator('.teacher-conversation')).toHaveCount(0);
  await expect(teacher.locator('.teacher-actions')).toHaveCount(0);
  await expect(teacher.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('.progression-studio')).toHaveCount(0);
  await expect(page.locator('.teacher-panel')).toHaveCount(0);
  expect(await page.locator('body').ariaSnapshot()).not.toContain('minor third');
  await showTask(page);
  await page
    .getByTestId('exercise-card')
    .getByRole('button', { name: 'Ask teacher for help', exact: true })
    .click();
  await showTeacher(page);
  await expect(teacher.locator('.teacher-conversation')).toBeVisible();
  await expect
    .poll(() => records(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'revealed', assisted: true, hintsUsed: ['answer'] }),
      ]),
    );
  const data = await records(page, 'lessons');
  expect(data).toMatchObject({
    exerciseDefinitions: expect.arrayContaining([
      expect.objectContaining({ generatorVersion: 'teacher-curriculum-v1' }),
    ]),
  });
  await page.goto('/#/stage/progression');
  await page.reload();
  await page.getByRole('tab', { name: 'Understand', exact: true }).click();
  await page.getByRole('button', { name: 'Open ii–V–I study' }).click();
  await page.getByRole('button', { name: 'Open music teacher', exact: true }).click();
  await expect(teacher.locator('.teacher-message.user')).toContainText(
    'Help me name the chord roles.',
  );
});

test('validated teacher preview uses the same controls, player, save and undo as manual exploration', async ({
  page,
}) => {
  await page.route('**/api/teacher/next', async (route) => {
    const request = route.request().postDataJSON() as TeacherRequest;
    const intent = {
      action: 'propose' as const,
      reason: 'requested' as const,
      operation: 'move' as const,
      constraints: { ...request.context.constraints, minFret: 9, maxFret: 13 },
      targetQuality: null,
      substituteSymbol: null,
    };
    const execution = executeArrangementIntent(
      {
        requestId: request.requestId,
        contextVersion: request.contextVersion,
        request: request.request,
        context: request.context.music,
        constraints: request.context.constraints,
      },
      intent,
    );
    const candidate = execution.result!.variations[0]!;
    await route.fulfill({
      json: {
        ...localTeacher(request),
        source: 'forge',
        fallbackReason: undefined,
        message: 'Here is a valid version in frets 9–13. Preview it in the same player.',
        actions: [{ type: 'preview', intent, candidateId: candidate.id }],
        review: { status: 'passed', reasons: [] },
        versions: { ...localTeacher(request).versions, model: 'test-fixture' },
      },
    });
  });
  const { teacher, studio } = await study(page);
  await teacher.locator('.teacher-settings summary').click();
  await teacher.getByRole('checkbox', { name: 'Use the experimental Forge teacher' }).check();
  await ask(page, 'Move this progression to frets 9 to 13.');
  await teacher.getByRole('button', { name: 'Preview this voicing' }).click();
  await showTask(page);
  await studio.locator('summary').filter({ hasText: 'Customize' }).click();
  await expect(studio.getByRole('spinbutton', { name: 'Minimum fret', exact: true })).toHaveValue(
    '9',
  );
  await expect(
    studio.getByRole('button', { name: 'Preview variation', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await studio.getByRole('button', { name: 'Apply & save', exact: true }).click();
  await expect(studio).toContainText('Variation saved on this device');
  await studio.getByRole('button', { name: 'Original score', exact: true }).click();
  await page.goto('/#/stage/notation');
  await page.locator('.alphatab-host').scrollIntoViewIfNeeded();
  await expect(
    page.locator('.alphatab-host svg text').filter({ hasText: /^F·1$/ }).first(),
  ).toBeVisible();
  await expect(page.locator('.alphatab-host')).toHaveCount(1);
});

test('keeps teacher questions and history in memory when browser storage fails', async ({
  page,
}) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new Error('storage unavailable');
    };
  });
  const { teacher } = await study(page);
  await ask(page, 'Help me name the chord roles.');
  await expect(teacher.locator('.teacher-storage-warning')).toContainText('kept in memory');
  await teacher.getByRole('button', { name: 'Try this question' }).click();
  await showTask(page);
  await page
    .getByTestId('exercise-card')
    .getByRole('textbox', { name: 'Type your answer' })
    .fill('minor third');
  await page
    .getByTestId('exercise-card')
    .getByRole('button', { name: 'Submit typed answer' })
    .click();
  await expect(page.getByTestId('exercise-card')).toContainText('Correct.');
  const memory = await page.evaluate(async () => {
    const modulePath = '/src/storage.ts';
    return (await import(modulePath)).getMemoryLessonData();
  });
  expect(
    memory.lessons.some((lesson: { messages: unknown[] }) => lesson.messages.length >= 2),
  ).toBe(true);
  expect(memory.exerciseDefinitions).toHaveLength(1);
});

test('reserves a new neck position without exposing actor explanations before the answer', async ({
  page,
}) => {
  const rawExplanation = 'The hidden answer is F on string 1 fret 13.';
  await page.route('**/api/teacher/next', async (route) => {
    const request = route.request().postDataJSON() as TeacherRequest;
    await route.fulfill({
      json: {
        ...localTeacher(request),
        source: 'forge',
        fallbackReason: undefined,
        message: rawExplanation,
        actions: [
          {
            type: 'question',
            recipe: {
              kind: 'note-location',
              spanIndex: 0,
              degree: 'b3',
              region: { minFret: 12, maxFret: 17 },
              assessment: 'heldout',
            },
          },
        ],
        review: { status: 'passed', reasons: [] },
        versions: { ...localTeacher(request).versions, model: 'test-fixture' },
      },
    });
  });
  const { teacher } = await study(page);
  await teacher.locator('.teacher-settings summary').click();
  await teacher.getByRole('checkbox', { name: 'Use the experimental Forge teacher' }).check();
  await ask(page, 'Test a note location somewhere I have not explored.');
  await expect(teacher.locator('.teacher-message.assistant')).toContainText(
    'A reserved question is ready.',
  );
  expect(await teacher.textContent()).not.toContain(rawExplanation);
  expect(await teacher.ariaSnapshot()).not.toContain('string 1 fret 13');
  await teacher.getByRole('button', { name: 'Try this question' }).click();
  await showTask(page);
  const card = page.getByTestId('exercise-card');
  await expect(card).toContainText('Held-back question');
  await card.getByRole('textbox', { name: 'Type string:fret', exact: true }).fill('1:13');
  await card.getByRole('button', { name: 'Submit typed answer' }).click();
  await expect(card).toContainText('Correct.');
  await expect
    .poll(() => records(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note-location',
          mode: 'transfer',
          outcome: 'correct',
          assisted: false,
        }),
      ]),
    );
  const data = await records(page, 'lessons');
  expect(JSON.stringify(data.lessons)).not.toContain(rawExplanation);
});

test('ignores a pending cloud response when the neck constraints change', async ({ page }) => {
  let release!: () => void;
  let routeFinished!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    routeFinished = resolve;
  });
  await page.route('**/api/teacher/next', async (route) => {
    const request = route.request().postDataJSON() as TeacherRequest;
    await delayed;
    await route
      .fulfill({
        json: { ...localTeacher(request), message: 'This stale explanation must not appear.' },
      })
      .catch(() => {});
    routeFinished();
  });
  const { teacher, studio } = await study(page);
  await teacher.locator('.teacher-settings summary').click();
  await teacher.getByRole('checkbox', { name: 'Use the experimental Forge teacher' }).check();
  await teacher
    .getByRole('textbox', { name: 'Your question', exact: true })
    .fill('Give me a question here.');
  await teacher.getByRole('button', { name: 'Ask teacher', exact: true }).click();
  await expect(teacher.getByRole('button', { name: 'Working with the music…' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to my task', exact: true }).click();
  await studio.getByRole('button', { name: 'Frets 9–12', exact: true }).click();
  await page.getByRole('button', { name: 'Open music teacher', exact: true }).click();
  release();
  await finished;
  await showTeacher(page);
  await expect(teacher.getByRole('button', { name: 'Working with the music…' })).toHaveCount(0);
  await expect(teacher.locator('.teacher-message.assistant')).toHaveCount(0);
  await expect(teacher.locator('.teacher-actions')).toHaveCount(0);
  await teacher.locator('.teacher-settings summary').click();
  await teacher.getByRole('checkbox', { name: 'Use the experimental Forge teacher' }).uncheck();
  await ask(page, 'Help me understand this position.');
  await expect(teacher.locator('.teacher-message.assistant')).toBeVisible();
  expect(await teacher.textContent()).not.toContain('This stale explanation must not appear.');
});

test('invalidates a proposal when another tab updates the lesson', async ({ page }) => {
  const { teacher } = await study(page);
  await ask(page, 'Help me name the chord roles.');
  await page.evaluate(async () => {
    const modulePath = '/src/storage.ts';
    const data = await (await import(modulePath)).getLessonData();
    const lesson = data.lessons.find((item: { messages: unknown[] }) => item.messages.length >= 2);
    const channel = new BroadcastChannel('tabtopitch-lessons');
    channel.postMessage({
      writerId: crypto.randomUUID(),
      lessonId: lesson.id,
      revision: lesson.revision + 1,
    });
    channel.close();
  });
  await expect(teacher).toContainText('This lesson changed in another tab.');
  await expect(teacher.getByRole('button', { name: 'Try this question' })).toHaveCount(0);
  await teacher.getByRole('textbox', { name: 'Your question', exact: true }).fill('Continue.');
  await expect(teacher.getByRole('button', { name: 'Ask on-device guide' })).toBeDisabled();
});

test('grounds explanations in the current derived harmony and clears stale source-note facts in preview', async ({
  page,
}) => {
  const seen: TeacherRequest[] = [];
  await page.route('**/api/teacher/next', async (route) => {
    const request = route.request().postDataJSON() as TeacherRequest;
    seen.push(request);
    await route.fulfill({ json: localTeacher(request) });
  });
  const { teacher, studio } = await study(page);
  await page.getByRole('button', { name: 'Back to my task', exact: true }).click();
  await studio.getByRole('button', { name: 'Add color', exact: true }).click();
  await studio.getByRole('combobox', { name: 'Chord color', exact: true }).selectOption('m9');
  await showTeacher(page);
  await expect(teacher.locator('.teacher-context')).toContainText('Dm9');
  await teacher.locator('.teacher-settings summary').click();
  await teacher.getByRole('checkbox', { name: 'Use the experimental Forge teacher' }).check();
  await ask(page, 'Explain the chord I am looking at.');
  expect(seen.at(-1)?.context.music.spans[0]?.symbol).toBe('Dm9');
  expect(seen.at(-1)?.context.workspace).toEqual({
    view: 'proposal',
    sourceSymbols: ['Dm7', 'G7', 'Cmaj7', 'Am7'],
  });
  expect(seen.at(-1)?.context.selectedNotes?.[0]?.id).toBe('n0');
  await page.getByRole('button', { name: 'Back to my task', exact: true }).click();
  await studio.getByRole('button', { name: 'Preview variation', exact: true }).click();
  await page.getByRole('button', { name: 'Open music teacher', exact: true }).click();
  await expect(teacher.locator('.teacher-actions')).toHaveCount(0);
  if (test.info().project.name === 'mobile') {
    await teacher.locator('.teacher-settings summary').click();
    await teacher.getByRole('checkbox', { name: 'Use the experimental Forge teacher' }).check();
  }
  await ask(page, 'Explain this variation in the player.');
  await expect.poll(() => seen.length).toBe(2);
  expect(seen.at(-1)?.context.workspace?.view).toBe('preview');
  expect(seen.at(-1)?.context.selectedNotes).toEqual([]);
});

test('queued lesson saves cannot restore data after deletion', async ({ page }) => {
  await study(page);
  await ask(page, 'Help me name the chord roles.');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/storage.ts';
    const storage = await import(modulePath);
    const before = await storage.getLessonData();
    const generation = storage.getLessonWriteGeneration();
    const lesson = before.lessons.find(
      (item: { messages: unknown[] }) => item.messages.length >= 2,
    );
    await storage.clearLocalData();
    await storage.saveLessonSession(
      { ...lesson, revision: lesson.revision + 1 },
      [],
      [],
      generation,
    );
    return { memory: storage.getMemoryLessonData(), saved: await storage.getLessonData() };
  });
  expect(result.memory.lessons).toEqual([]);
  expect(result.saved.lessons).toEqual([]);
});
