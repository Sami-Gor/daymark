import { expect, test } from '../support/fixtures';

/*
 * VALID BY DESIGN (see tests/e2e/support/eslint-guard.test.ts).
 *
 * Awaiting, returning, or explicitly handling every promise is the shape the
 * E2E suite is expected to keep. This fixture must produce zero ESLint errors.
 */
test('awaits actions and assertions', async ({ page, dashboard }) => {
  await page.goto('/');
  await expect(dashboard.currentTemperature).toBeVisible();
  await expect.soft(dashboard.currentTemperature).toHaveText(/°C/);
  await expect.poll(() => page.title()).toContain('Daymark');
});

test('returns the promise instead of awaiting it', async ({ page }) => {
  return page.goto('/');
});

test('handles a rejection explicitly', async ({ page }) => {
  page.goto('/').catch(() => {});
  await page.goto('/');
});

test('synchronous assertions do not need await', () => {
  const values = [1, 2, 3];
  expect(values).toHaveLength(3);
  expect(values[0]).toBe(1);
});

test('event listeners are subscriptions, not floating promises', async ({ page }) => {
  page.on('request', () => {});
  page.on('response', (response) => {
    response.allHeaders().catch(() => {});
  });
  page.on('requestfailed', () => {
    // Nothing asynchronous to await in this listener.
  });
  await page.goto('/');
});

test('valid async Playwright test callback', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Daymark/);
});
