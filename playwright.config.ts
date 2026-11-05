import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'homework.spec.ts',
    'app.spec.ts',
    'exploration.spec.ts',
    'progression.spec.ts',
    'teacher.spec.ts',
    'listening.spec.ts',
    'teaching-practice.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5410',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5410 --strictPort',
    url: 'http://127.0.0.1:5410',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
