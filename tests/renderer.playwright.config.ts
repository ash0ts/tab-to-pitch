import { defineConfig } from '@playwright/test';
const port = Number(process.env.TTP_TEST_PORT ?? 5411);
export default defineConfig({
  outputDir: '../test-results/renderer',
  testDir: '.',
  testMatch: 'renderer.browser.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  },
  webServer: {
    command: `npx vite --force --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: process.cwd(),
    port,
    reuseExistingServer: !process.env.CI,
  },
});
