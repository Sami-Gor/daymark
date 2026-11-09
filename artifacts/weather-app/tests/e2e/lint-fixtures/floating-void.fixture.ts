import { test } from '../support/fixtures';

/*
 * INVALID BY DESIGN (see tests/e2e/support/eslint-guard.test.ts).
 *
 * `void` is the usual way a Promise is marked intentionally ignored. The
 * configured rule uses `ignoreVoid: false`, so this must still be reported.
 * Expected rule: @typescript-eslint/no-floating-promises.
 */
test('void does not silence a floating promise', async ({ page }) => {
  void page.goto('/');
});
