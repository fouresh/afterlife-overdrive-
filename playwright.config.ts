import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * Smoke tests in mobile emulation against the production build (vite preview).
 * Multiplayer tests run against `wrangler dev` (the real Worker + Durable Object + local D1),
 * which also serves the same build. WebGL runs on SwiftShader in headless Chromium.
 */
const WORKER_URL = 'http://127.0.0.1:8787';
const wrangler = 'pnpm --filter @ao/server exec wrangler';
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
  webServer: [
    {
      command: 'pnpm --filter @ao/client preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      // Fresh local D1/DO state every run (rate limits per IP would pile up across runs).
      command: `rm -rf apps/server/.wrangler/e2e && ${wrangler} d1 migrations apply DB --local --persist-to .wrangler/e2e && ${wrangler} dev --local --persist-to .wrangler/e2e --port 8787 --ip 127.0.0.1`,
      url: `${WORKER_URL}/api/health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { WRANGLER_SEND_METRICS: 'false', CI: '1' },
    },
  ],
  projects: [
    { name: 'android', use: { ...devices['Pixel 7 landscape'] }, testIgnore: /multiplayer/ },
    {
      name: 'iphone',
      use: {
        ...devices['iPhone 13 landscape'],
        defaultBrowserType: 'chromium',
        browserName: 'chromium',
      },
      testIgnore: /multiplayer/,
    },
    {
      name: 'multiplayer',
      testMatch: /multiplayer/,
      use: { ...devices['Pixel 7 landscape'], baseURL: WORKER_URL },
    },
  ],
});
