import { defineConfig, devices } from '@playwright/test';

/** Separate config so screenshot generation never runs as part of the test suite. */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/screenshots.spec.ts'],
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'shots', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
