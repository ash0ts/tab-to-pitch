import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'homework-demo.spec.ts',
  outputDir: '../homework-demo-recording',
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: 'http://127.0.0.1:5196',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    viewport: { width: 1440, height: 1000 },
    video: { mode: 'on', size: { width: 1440, height: 1000 } },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --force --port 5196 --strictPort',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:5196',
    reuseExistingServer: false,
  },
});
