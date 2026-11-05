import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: process.env.HOMEWORK_REGRESSION
    ? [
        'app.spec.ts',
        'exploration.spec.ts',
        'progression.spec.ts',
        'teacher.spec.ts',
        'listening.spec.ts',
        'homework.spec.ts',
      ]
    : 'homework.spec.ts',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:5413',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --force --port 5413 --strictPort',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:5413',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
