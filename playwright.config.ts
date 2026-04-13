import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for LitCrop.
 *
 * Tests intercept Cognito + API calls at the network layer so they
 * run without real AWS credentials. The Astro dev server is started
 * automatically via the webServer option.
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev -w src/frontend',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PUBLIC_API_BASE_URL: 'http://localhost:4321/api/v1',
      PUBLIC_COGNITO_REGION: 'ap-northeast-1',
      PUBLIC_COGNITO_CLIENT_ID: 'test-client-id',
    },
  },
});
