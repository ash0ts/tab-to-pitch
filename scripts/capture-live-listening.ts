import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve('../tabtopitch-listening-live-captures');
await mkdir(dir, { recursive: true });
const session = JSON.parse(
  await readFile(resolve('../listening-implementation-baseline/demo-session.json'), 'utf8'),
);
const browser = await chromium.launch({ channel: 'chrome', headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 1,
    recordVideo: { dir, size: { width: 1440, height: 1050 } },
  }),
  page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5194');
const exchange = await context.request.post('http://127.0.0.1:5194/api/invitations/exchange', {
  data: { invitation: session.token },
  headers: { Origin: 'http://127.0.0.1:5194' },
});
if (!exchange.ok()) throw new Error(`Invitation exchange failed (${exchange.status()})`);
await expect(page.getByRole('button', { name: 'Play score', exact: true })).toBeEnabled({
  timeout: 30000,
});
await page.getByRole('button', { name: 'Choose a song' }).click();
await page.getByRole('button', { name: 'Four chords, one key' }).click();
const lesson = page.getByRole('region', { name: 'Listening lesson' }),
  teacher = page.getByRole('region', { name: 'Music teacher', exact: true });
await lesson.getByLabel('Listening difficulty').selectOption('recall');
await lesson.getByRole('button', { name: 'Try a listening question' }).click();
await lesson.getByRole('button', { name: 'Hear synthesized passage' }).click();
for (const [i, v] of ['D', 'G7', 'Cmaj7', 'Am7'].entries())
  await lesson.getByLabel(`Chord at change ${i + 1}`).selectOption(v);
await lesson.getByRole('button', { name: 'Check progression' }).click();
await lesson.getByRole('button', { name: 'Pause audio', exact: true }).click();
await teacher.getByRole('button', { name: 'Open teacher', exact: true }).click();
await teacher.locator('summary').filter({ hasText: 'Lesson context and cloud access' }).click();
await teacher.getByRole('checkbox', { name: 'Use the experimental Forge teacher' }).check();
const rows = [];
for (const [i, prompt] of [
  'I chose D instead of Dm7 at the first change. My roots matched but the chord quality did not. Explain one difference to listen for.',
  'Give me one useful listening activity with this progression before showing the chord names.',
  'Help me find this same harmony between frets 5 and 9, with four voices. Keep the chord identities.',
].entries()) {
  await teacher.getByRole('textbox', { name: 'Your question', exact: true }).fill(prompt);
  const responsePromise = page.waitForResponse((r) => r.url().endsWith('/api/teacher/next'), {
    timeout: 70000,
  });
  const start = Date.now();
  await teacher.getByRole('button', { name: 'Ask teacher', exact: true }).click();
  const response = await responsePromise,
    body = await response.json();
  await expect(teacher.getByRole('button', { name: 'Ask teacher', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await teacher.evaluate((e) =>
    window.scrollTo({ top: scrollY + e.getBoundingClientRect().top - 20, behavior: 'instant' }),
  );
  await teacher.locator('.teacher-conversation').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.waitForTimeout(1300);
  await page.screenshot({ path: resolve(dir, `${i + 1}-hosted-turn.png`) });
  rows.push({
    turn: i,
    question: prompt,
    source: body.source,
    fallbackReason: body.fallbackReason,
    traceId: body.traceId,
    elapsedMs: Date.now() - start,
    review: body.review,
    actions: body.actions,
    message: body.message,
  });
}
const video = page.video();
await context.close();
if (video) await video.saveAs(resolve(dir, 'live-teacher-workflow.webm'));
await browser.close();
await writeFile(
  resolve(dir, 'capture-receipt.json'),
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      mode: 'Real application route, invited ephemeral loopback session, actual Forge actor and critic. Original CC0 music and scripted answer. No mocks, no learner-effectiveness evidence.',
      rows,
      errors,
    },
    null,
    2,
  ),
);
if (errors.length) throw new Error(errors.join('\n'));
console.info(rows.map(({ message, actions, ...row }) => row));
