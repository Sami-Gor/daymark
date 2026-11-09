import { expect, test } from '../support/fixtures';

/*
 * INVALID BY DESIGN (see tests/e2e/support/eslint-guard.test.ts).
 *
 * An un-awaited `expect.poll`, which is a promise-returning assertion.
 * Expected rule: @typescript-eslint/no-floating-promises.
 */
test('un-awaited expect.poll', async ({ page }) => {
  expect.poll(async () => page.title()).toBe('Daymark');
});
