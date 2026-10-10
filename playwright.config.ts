import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * Smoke tests in mobile emulation against the production build (vite preview).
 * WebGL runs on SwiftShader in headless Chromium.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }], ['list']] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'pnpm --filter @ao/client preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7 landscape'] } },
    {
      name: 'iphone',
      use: {
        ...devices['iPhone 13 landscape'],
        defaultBrowserType: 'chromium',
        browserName: 'chromium',
      },
    },
  ],
});
