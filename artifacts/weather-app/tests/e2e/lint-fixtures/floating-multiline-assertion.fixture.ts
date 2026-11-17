import { expect, test } from '../support/fixtures';

/*
 * INVALID BY DESIGN (see tests/e2e/support/eslint-guard.test.ts).
 *
 * A multiline assertion whose promise is dropped: the `expect(...)` call spans
 * lines, so a purely line-oriented scanner can miss it. Expected rule:
 * @typescript-eslint/no-floating-promises.
 */
test('un-awaited multiline assertion', async ({ page }) => {
  expect(page.getByTestId('text-current-temperature'))
    .toBeVisible();
});
