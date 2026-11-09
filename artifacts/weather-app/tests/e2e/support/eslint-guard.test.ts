import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/*
 * Regression proof for the type-aware async guard in eslint.config.mjs.
 *
 * These tests run the REAL configured ESLint (not a regex simulation) over the
 * deliberately-invalid fixtures in tests/e2e/lint-fixtures. The fixtures are
 * excluded from the `lint:e2e` CLI target via flat-config ignores, but they
 * still typecheck through tsconfig.e2e.json; the ESLint API is invoked with
 * `ignore: false` so the configured rules run on them here.
 *
 * A single ESLint instance is created in beforeAll because type-aware linting
 * builds a TypeScript program on first use; the per-test timeout is raised to
 * keep this off the default 5s Vitest budget on slow CI runners.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// tests/e2e/support -> artifact root.
const appRoot = path.resolve(here, '../../..');
const fixtureDir = path.join(appRoot, 'tests/e2e/lint-fixtures');

const NO_FLOATING_PROMISES = '@typescript-eslint/no-floating-promises';
const NO_MISUSED_PROMISES = '@typescript-eslint/no-misused-promises';

/** Fixtures that are invalid on purpose, and the rule each one must trigger. */
const INVALID_FIXTURES = [
  { name: 'floating-click', ruleId: NO_FLOATING_PROMISES, description: 'alias-based un-awaited click' },
  { name: 'floating-matcher', ruleId: NO_FLOATING_PROMISES, description: 'un-awaited matcher call' },
  { name: 'floating-goto', ruleId: NO_FLOATING_PROMISES, description: 'un-awaited page.goto' },
  { name: 'floating-multiline-assertion', ruleId: NO_FLOATING_PROMISES, description: 'un-awaited multiline assertion' },
  { name: 'floating-poll', ruleId: NO_FLOATING_PROMISES, description: 'un-awaited expect.poll' },
  { name: 'floating-void', ruleId: NO_FLOATING_PROMISES, description: 'void-marked floating promise (ignoreVoid: false)' },
  { name: 'misused-promise-callback', ruleId: NO_MISUSED_PROMISES, description: 'async callback assigned to () => void' },
] as const;

function fixturePath(name: string): string {
  return path.join(fixtureDir, `${name}.fixture.ts`);
}

function relativeFixture(name: string): string {
  return path.relative(appRoot, fixturePath(name));
}

/** Default ignore handling, i.e. exactly what `eslint tests/e2e` does. */
let cliEslint: ESLint;
/** lint overlays: the API needs `ignore: false` to reach fixture-directory files. */
let fixtureEslint: ESLint;

beforeAll(() => {
  cliEslint = new ESLint({ cwd: appRoot });
  fixtureEslint = new ESLint({ cwd: appRoot, ignore: false });
});

/**
 * Lint one deliberately-invalid fixture with the configured ESLint instance.
 *
 * Uses the `ignore: false` instance so the fixture directory's normal ignore
 * rules do not apply here, and runs the real `eslint.config.mjs` so the guard
 * proves the async rules fire rather than trusting the configuration.
 *
 * @param name Fixture basename without the `.fixture.ts` suffix.
 * @returns ESLint's result for that fixture, including its rule violations.
 * @throws Error when ESLint returns no result (for example the fixture was
 * renamed or moved), so fixture drift fails the guard instead of passing.
 */
async function lintFixture(name: string): Promise<ESLint.LintResult> {
  const [result] = await fixtureEslint.lintFiles([relativeFixture(name)]);
  if (!result) throw new Error(`ESLint returned no result for fixture "${name}"`);
  return result;
}

describe('type-aware ESLint async guard', () => {
  it('configures the required rules as errors with ignoreVoid disabled', { timeout: 30_000 }, async () => {
    const config = await fixtureEslint.calculateConfigForFile(relativeFixture('valid-async'));
    expect(config?.rules?.[NO_FLOATING_PROMISES]).toEqual([2, { ignoreVoid: false }]);
    expect(config?.rules?.[NO_MISUSED_PROMISES]).toEqual([2]);
    expect(config?.languageOptions?.parserOptions?.project).toBe('./tsconfig.e2e.json');
  });

  it('reports the expected rule for every deliberately-invalid fixture', { timeout: 60_000 }, async () => {
    for (const { name, ruleId, description } of INVALID_FIXTURES) {
      const result = await lintFixture(name);
      const ruleIds = result.messages.map((message) => message.ruleId);
      expect(
        ruleIds,
        `${name} (${description}) should report ${ruleId}; got ${JSON.stringify(ruleIds)}`,
      ).toContain(ruleId);
      expect(result.errorCount, `${name} should be an error`).toBeGreaterThan(0);
    }
  });

  it('reports no problems for the valid fixture', { timeout: 30_000 }, async () => {
    const result = await lintFixture('valid-async');
    expect(result.messages).toEqual([]);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it('keeps the fixtures out of the normal lint target and the rules scoped to tests/e2e', { timeout: 30_000 }, async () => {
    // `eslint tests/e2e` (no ignore overrides) skips the fixtures...
    expect(await cliEslint.isPathIgnored(fixturePath('floating-click'))).toBe(true);
    // ...while the API instance used above intentionally lints them.
    expect(await fixtureEslint.isPathIgnored(fixturePath('floating-click'))).toBe(false);
    // And the guard is scoped: app source files get no async-safety rules.
    const sourceConfig = await fixtureEslint.calculateConfigForFile('src/main.tsx');
    expect(sourceConfig?.rules?.[NO_FLOATING_PROMISES]).toBeUndefined();
    expect(sourceConfig?.rules?.[NO_MISUSED_PROMISES]).toBeUndefined();
  });
});
