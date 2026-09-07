import { defineConfig } from '@playwright/test';

// E2E tests run against the production build served by `vite preview`
// (PORT/BASE_PATH defaults apply: port 5177, base '/').
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: 'http://localhost:5177',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'pnpm run serve',
    port: 5177,
    reuseExistingServer: !process.env.CI,
    env: { PORT: '5177', BASE_PATH: '/', NODE_ENV: 'production' },
    timeout: 30000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
