import { expect, test } from '../support/fixtures';

/*
 * INVALID BY DESIGN (see tests/e2e/support/eslint-guard.test.ts).
 *
 * An un-awaited web-first matcher call. Expected rule:
 * @typescript-eslint/no-floating-promises.
 */
test('un-awaited matcher call', async ({ page }) => {
  const temperature = page.getByTestId('text-current-temperature');
  expect(temperature).toBeVisible();
});
