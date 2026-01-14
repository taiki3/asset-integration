import { defineConfig, devices } from '@playwright/test';

/**
 * E2E Test Configuration for ASIP
 *
 * This configuration is designed to run in Docker containers.
 * Base URL is set via PLAYWRIGHT_BASE_URL environment variable.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: '../playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:55000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // Timeout settings
  timeout: 30000,
  expect: {
    timeout: 10000,
  },

  // Output directory for artifacts
  outputDir: '../test-results',
});
