import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.TTP_TEST_PORT ?? 5410);
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
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
