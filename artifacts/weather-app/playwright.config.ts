import { defineConfig } from '@playwright/test';

// E2E tests run against the production build served by `vite preview`.
// E2E_PORT lets parallel runs (e.g. one per suite group) use their own server
// instead of racing for the default port.
const port = Number(process.env.E2E_PORT ?? 5177);

export default defineConfig({
  testDir: './tests/e2e',
  // Only Playwright specs are collected; the support directory also contains
  // Vitest unit tests for the seeding helpers.
  testMatch: '**/*.spec.ts',
  timeout: 30000,
  expect: { timeout: 5000 },
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'pnpm run serve',
    port,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(port), BASE_PATH: '/', NODE_ENV: 'production' },
    timeout: 30000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
