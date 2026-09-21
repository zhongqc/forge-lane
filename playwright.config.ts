import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm dev:server',
          url: 'http://localhost:3001/api/health',
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
        {
          command: 'pnpm dev:web',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
      ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
  },
  timeout: 45000,
  workers: 1,
  reporter: 'list',
});
