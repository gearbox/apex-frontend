import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report' }]],

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      grepInvert: /@desktop/,
    },
    // Keep iOS/Safari in the normal matrix. Playwright 1.57.0 is pinned because
    // 1.58+ drops macOS 13 WebKit support for local pre-commit testing.
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 15 Pro'],
        // The iOS install instructions are tested separately. Dismiss them for
        // regular app flows so the onboarding sheet cannot mask the interaction
        // the spec is exercising.
        storageState: 'tests/e2e/fixtures/mobile-safari-storage-state.json',
      },
      grepInvert: /@desktop/,
    },
  ],

  webServer: {
    command: 'pnpm build && pnpm preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
