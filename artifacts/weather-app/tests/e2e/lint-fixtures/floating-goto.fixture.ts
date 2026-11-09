import { test } from '../support/fixtures';

/*
 * INVALID BY DESIGN (see tests/e2e/support/eslint-guard.test.ts).
 *
 * A navigation whose promise is dropped. Expected rule:
 * @typescript-eslint/no-floating-promises.
 */
test('un-awaited navigation', async ({ page }) => {
  page.goto('/');
});
