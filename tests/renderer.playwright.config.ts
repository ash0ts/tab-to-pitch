import { defineConfig } from '@playwright/test';
export default defineConfig({
  outputDir: '../test-results/renderer',
  testDir: '.',
  testMatch: 'renderer.browser.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5411',
    viewport: { width: 1280, height: 900 },
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  },
  webServer: {
    command: 'npx vite --force --host 127.0.0.1 --port 5411 --strictPort',
    cwd: process.cwd(),
    port: 5411,
    reuseExistingServer: !process.env.CI,
  },
});
