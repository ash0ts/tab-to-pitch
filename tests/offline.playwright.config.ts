import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'offline.browser.spec.ts',
  outputDir: '../test-results/offline',
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:5412',
    viewport: { width: 1440, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  // The caller builds first so this gate always exercises the production SW.
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 5412 --strictPort',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:5412',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
