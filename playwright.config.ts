import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ?? '3100';

/**
 * Browser tests run against a production build with its own embedded PostgreSQL
 * (.data/e2e, recreated on every run). No external services and no paid APIs.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
