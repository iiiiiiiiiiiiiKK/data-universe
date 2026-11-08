import { defineConfig, devices } from '@playwright/test';

/**
 * Runs the production suite against the live GitHub Pages deployment.
 * No local web server is started: the assertions must hold on the real URL.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/production.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'production', use: { channel: 'chrome' } }],
});
