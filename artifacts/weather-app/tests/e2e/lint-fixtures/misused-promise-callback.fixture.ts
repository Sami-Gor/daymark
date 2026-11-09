import { test } from '../support/fixtures';

/*
 * INVALID BY DESIGN (see tests/e2e/support/eslint-guard.test.ts).
 *
 * An async callback assigned where a `() => void` signature is expected: its
 * rejection cannot be observed by the caller. Expected rule:
 * @typescript-eslint/no-misused-promises.
 */
test('async callback where a void callback is expected', async () => {
  const onReady: () => void = async () => {
    await Promise.resolve();
  };
  onReady();
});
