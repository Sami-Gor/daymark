import tseslint from 'typescript-eslint';

/*
 * Focused, type-aware ESLint config for the Daymark E2E suite.
 *
 * Playwright actions and assertions return promises. A missing `await` either
 * skips the step or races the next one, and the compiler cannot catch it
 * because the call is a legal expression statement. Type-aware lint can: with
 * the e2e tsconfig (which also covers page objects and fixtures) the parser
 * knows every call's return type.
 *
 * Scope is deliberately narrow: this file only configures TypeScript files
 * under `tests/e2e/`. It is not repo-wide lint enforcement, and the normal
 * `pnpm run build` / `typecheck` paths are untouched.
 *
 * The `tests/e2e/lint-fixtures/` directory holds deliberately-invalid fixtures
 * proving the rules fire (see `tests/e2e/support/eslint-guard.test.ts`). They
 * are ignored by the `lint:e2e` CLI target but still typecheck via
 * tsconfig.e2e.json; the guard test lints them through the ESLint API with
 * `ignore: false`.
 *
 * The config intentionally enables only the two async-safety rules. A broader
 * `@eslint/js`/`typescript-eslint` recommended baseline was evaluated and
 * produces pre-existing `no-unused-vars`/`no-empty-pattern` findings in specs
 * and support helpers that are outside this change's write scope, so those
 * rules are not enabled rather than being suppressed inline.
 */
export default [
  {
    name: 'daymark-e2e/ignores',
    ignores: ['tests/e2e/lint-fixtures/**'],
  },
  {
    name: 'daymark-e2e/typescript',
    files: ['tests/e2e/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // A dedicated project gives the whole e2e tree type information.
        // projectService would resolve the app's tsconfig.json instead, which
        // does not include the e2e tree, so the explicit project is required.
        project: './tsconfig.e2e.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // The two guards this config exists for. ignoreVoid is false so that
      // `void promise` cannot be used to silence a genuinely un-awaited step.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
];
