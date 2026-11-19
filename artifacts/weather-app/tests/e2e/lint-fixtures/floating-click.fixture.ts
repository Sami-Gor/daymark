import { test } from '../support/fixtures';

/*
 * INVALID BY DESIGN (see tests/e2e/support/eslint-guard.test.ts).
 *
 * A locator alias whose click is never awaited: the action races the rest of
 * the test or never runs to completion. Expected rule:
 * @typescript-eslint/no-floating-promises.
 */
test('un-awaited click through an alias', async ({ page }) => {
  const refreshButton = page.getByRole('button', { name: 'Refresh' });
  refreshButton.click();
});
