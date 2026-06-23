import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E test configuration for Gitgram Web.
 *
 * Prerequisites:
 *   npx playwright install            # download browser binaries
 *
 * Running tests:
 *   npx playwright test               # all tests, headless
 *   npx playwright test --headed      # watch in a real browser
 *   npx playwright test --ui          # interactive UI mode
 *   npx playwright test --project=chromium  # single browser
 *   npx playwright test e2e/auth.spec.ts    # single spec file
 *
 * The tests expect:
 *   1. The backend API running at http://localhost:4000
 *   2. The Next.js dev server running at http://localhost:3000
 *      (or use the webServer block below to start it automatically)
 */
export default defineConfig({
  testDir: './e2e',

  /* Fail the build on CI if test.only is left in source code */
  forbidOnly: !!process.env.CI,

  /* Retry failed tests once on CI, never locally */
  retries: process.env.CI ? 1 : 0,

  /* Limit parallel workers on CI to avoid flakiness */
  workers: process.env.CI ? 2 : undefined,

  /* Reporter: HTML locally, line on CI */
  reporter: process.env.CI ? 'line' : 'html',

  /* Shared settings for all projects */
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',

    /* Capture trace on first retry for debugging */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on first retry */
    video: 'on-first-retry',

    /* Default navigation timeout */
    navigationTimeout: 30_000,

    /* Default action timeout */
    actionTimeout: 15_000,
  },

  /* Browser projects */
  projects: [
    /* Authentication setup project -- runs before all other tests */
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      teardown: 'teardown',
    },
    {
      name: 'teardown',
      testMatch: /global-teardown\.ts/,
    },

    /* Desktop browsers */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },

    /* Mobile viewports */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      dependencies: ['setup'],
    },
  ],

  /* Start Next.js dev server automatically if not already running */
  webServer: {
    command: process.env.CI
      ? 'npm run build && PORT=3000 HOSTNAME=127.0.0.1 node .next/standalone/server.js'
      : 'npx next dev --hostname 127.0.0.1 --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 180_000 : 120_000,
  },
})
