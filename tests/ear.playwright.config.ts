import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  outputDir: '../test-results/ear',
  testMatch: 'ear.browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5415',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      cwd: new URL('..', import.meta.url).pathname,
      command: 'node --import tsx server/index.ts',
      url: 'http://127.0.0.1:3415/healthz',
      reuseExistingServer: false,
      env: {
        PORT: '3415',
        PUBLIC_ORIGIN: 'http://127.0.0.1:5415',
        EAR_LAB_ENABLED: 'true',
        EAR_LAB_DATA_DIR: '.local/browser-ear',
        EAR_LAB_PYTHON: 'python3',
        CLOUD_COACH_ENABLED: 'false',
      },
    },
    {
      cwd: new URL('..', import.meta.url).pathname,
      command: 'npm run dev -- --port 5415 --strictPort',
      url: 'http://127.0.0.1:5415',
      reuseExistingServer: false,
      env: { TTP_API_ORIGIN: 'http://127.0.0.1:3415' },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
