import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for the missing-await finding from the QA review.
 *
 * Playwright assertions and actions are asynchronous. An un-awaited assertion
 * such as `expect(locator).toBeVisible;` (or `expect(locator).toBeVisible()`)
 * either never executes or races the next step. This check statically scans the
 * E2E specs and page objects so the same class of mistake cannot return, and is
 * run by the normal Vitest unit-test layer in CI.
 *
 * Why a scanner when ESLint already enforces no-floating-promises? Type-aware
 * lint catches dropped promises, but not an un-invoked matcher reference: the
 * expression `expect(locator).toBeVisible;` is just a property access, not a
 * promise, so the compiler and the lint rule see nothing wrong. That shape is
 * exactly the original defect, so it keeps a dedicated static check here.
 *
 * Multiline statements are delimited with the TypeScript tokenizer (already a
 * workspace dependency) rather than raw character counting, so parentheses
 * inside strings, regex literals, comments and template text cannot corrupt the
 * statement boundary.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const e2eRoot = path.resolve(here, '..');

/**
 * Playwright matchers that return a promise and therefore need `await`.
 *
 * Kept in sync with the LocatorAssertions / PageAssertions / APIResponseAssertions
 * / FunctionAssertions surfaces of @playwright/test 1.63. Generic matchers that
 * resolve synchronously (`toBe`, `toEqual`, `toHaveLength`, `toHaveProperty`,
 * ...) are deliberately not listed: flagging them would create false positives.
 */
const ASYNC_MATCHERS = [
  'toBeAttached',
  'toBeChecked',
  'toBeDisabled',
  'toBeEditable',
  'toBeEmpty',
  'toBeEnabled',
  'toBeFocused',
  'toBeHidden',
  'toBeInViewport',
  'toBeOK',
  'toBeVisible',
  'toContainClass',
  'toContainText',
  'toHaveAccessibleDescription',
  'toHaveAccessibleErrorMessage',
  'toHaveAccessibleName',
  'toHaveAttribute',
  'toHaveClass',
  'toHaveCount',
  'toHaveCSS',
  'toHaveId',
  'toHaveJSProperty',
  'toHaveRole',
  'toHaveScreenshot',
  'toHaveText',
  'toHaveTitle',
  'toHaveURL',
  'toHaveValue',
  'toHaveValues',
  'toMatchAriaSnapshot',
  'toPass',
] as const;

/** Playwright page/context/browser methods that return a promise. */
const ASYNC_ACTIONS = [
  'goto',
  'reload',
  'goBack',
  'goForward',
  'setViewportSize',
  'setContent',
  'addInitScript',
  'addScriptTag',
  'addStyleTag',
  'evaluate',
  'evaluateAll',
  'evaluateHandle',
  'route',
  'unroute',
  'routeFromHAR',
  'waitForLoadState',
  'waitForURL',
  'waitForTimeout',
  'waitForSelector',
  'waitForEvent',
  'waitForFunction',
  'waitForRequest',
  'waitForResponse',
  'waitForPopup',
  'waitForDownload',
  'screenshot',
  'click',
  'dblclick',
  'fill',
  'press',
  'selectOption',
  'check',
  'uncheck',
  'hover',
  'focus',
  'blur',
  'dragAndDrop',
  'setInputFiles',
  'scrollIntoViewIfNeeded',
  'setChecked',
  'clear',
  'type',
  'tap',
  'newPage',
  'newContext',
  'close',
  'storageState',
] as const;

export type Violation = { line: number; text: string; reason: string };

// Anchor to a real identifier position so `something.expect(...)` cannot match.
const EXPECT_STATEMENT_PATTERN = /(?:^|[^.\w$])expect(?:\.(?:soft|poll))?\s*\(/;
const ASYNC_MATCHER_PATTERN = new RegExp(`\\.(${ASYNC_MATCHERS.join('|')})(?![A-Za-z0-9_$])`);
const ASYNC_ACTION_PATTERN = new RegExp(
  `\\b(?:page|browser|context|dashboard|sections|search|voice|alerts|privacy|promo|api|geo|speech)\\.[\\w$]+\\(`,
);

function isComment(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function isAwaited(trimmed: string): boolean {
  return /(^|[\s(])await\s+/.test(trimmed) || /^(return|void)\s+/.test(trimmed);
}

/**
 * Net number of syntactic parentheses on each source line.
 *
 * Counting raw `(`/`)` characters is wrong: parentheses inside strings, regex
 * literals, comments and template text are not syntax and corrupt the balance.
 * A `)` in `page.getByText(')')` closes a multiline `expect(` early, while a
 * `(` in a string or comment leaves it open and merges the next assertion into
 * the statement. The TypeScript parser already separates lexical tokens from
 * syntax, so walk its token stream and count only `OpenParenToken` and
 * `CloseParenToken`: string, comment, regex and template text tokens cannot
 * contribute, while `${...}` template expressions are tokenized normally and
 * therefore do count.
 */
function parenBalanceByLine(source: string): number[] {
  const balances = new Array<number>(source.split('\n').length).fill(0);
  const sourceFile = ts.createSourceFile(
    'e2e-snippet.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TS,
  );
  // `getChildren()` exposes the full token stream; `forEachChild()` skips
  // punctuation tokens such as the parentheses around a parenthesized expression.
  const stack: ts.Node[] = [...sourceFile.getChildren(sourceFile)];
  let node = stack.pop();
  while (node) {
    const isOpen = node.kind === ts.SyntaxKind.OpenParenToken;
    if (isOpen || node.kind === ts.SyntaxKind.CloseParenToken) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      if (line < balances.length) balances[line] += isOpen ? 1 : -1;
    } else {
      stack.push(...node.getChildren(sourceFile));
    }
    node = stack.pop();
  }
  return balances;
}

/**
 * Collect the full assertion statement starting at `start`.
 *
 * A matcher chain can continue on the next line (`.toBeVisible();`) even when
 * the `expect(...)` call itself is balanced, so both the token-aware parenthesis
 * balance and a leading-dot continuation are used to decide whether the
 * statement continues.
 */
function collectAssertionStatement(lines: string[], start: number, lineBalance: number[]): string {
  let text = lines[start].trim();
  let balance = lineBalance[start] ?? 0;
  let index = start;
  while (index + 1 < lines.length) {
    const next = lines[index + 1].trim();
    if (balance <= 0 && !next.startsWith('.')) break;
    index += 1;
    text += `\n${next}`;
    balance += lineBalance[index] ?? 0;
  }
  return text;
}

/** Detect un-awaited or un-invoked Playwright async assertions in a source string. */
export function findUnawaitedAssertions(source: string): Violation[] {
  const lines = source.split('\n');
  const lineBalance = parenBalanceByLine(source);
  const violations: Violation[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || isComment(trimmed)) continue;
    if (!EXPECT_STATEMENT_PATTERN.test(trimmed)) continue;
    if (isAwaited(trimmed)) continue;

    const statement = collectAssertionStatement(lines, index, lineBalance);

    // Any un-awaited expect.poll is a defect regardless of which matcher follows.
    if (/\bexpect\.poll\s*\(/.test(statement)) {
      violations.push({ line: index + 1, text: trimmed, reason: 'un-awaited expect.poll' });
      continue;
    }

    const matcher = statement.match(ASYNC_MATCHER_PATTERN);
    if (!matcher) continue;
    const invoked = new RegExp(`\\.${matcher[1]}\\s*\\(`).test(statement);
    violations.push({
      line: index + 1,
      text: trimmed,
      reason: invoked
        ? `un-awaited Playwright assertion (.${matcher[1]})`
        : `un-invoked Playwright assertion (.${matcher[1]} is referenced but never called)`,
    });
  }
  return violations;
}

/** Detect un-awaited Playwright async actions (excluding synchronous event subscriptions). */
export function findUnawaitedActions(source: string): Violation[] {
  const lines = source.split('\n');
  const violations: Violation[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || isComment(trimmed)) return;
    if (isAwaited(trimmed)) return;
    if (trimmed.startsWith('.') || trimmed.startsWith('}') || trimmed.startsWith(')')) return;
    if (/^\s*(const|let|var)\s/.test(trimmed)) return;
    if (/^\s*[\w$.]+\s*=\s*/.test(trimmed)) return;
    if (/\.(on|off|once|addListener|removeListener)\(/.test(trimmed)) return;
    if (!ASYNC_ACTION_PATTERN.test(trimmed)) return;
    if (!/\);?\s*$/.test(trimmed)) return;
    const action = [...trimmed.matchAll(/\.([a-zA-Z0-9_$]+)\(/g)]
      .map((match) => match[1])
      .find((method) => (ASYNC_ACTIONS as readonly string[]).includes(method));
    if (!action) return;
    violations.push({
      line: index + 1,
      text: trimmed,
      reason: `un-awaited Playwright action (.${action}())`,
    });
  });
  return violations;
}

function walkTypeScriptFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'test-results') continue;
      files.push(...walkTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Collect scanner findings for every TypeScript file under the given directories. */
export function collectViolations(directories: string[]): string[] {
  const problems: string[] = [];
  for (const directory of directories) {
    for (const file of walkTypeScriptFiles(directory)) {
      const relative = path.relative(e2eRoot, file);
      const source = readFileSync(file, 'utf8');
      for (const violation of [...findUnawaitedAssertions(source), ...findUnawaitedActions(source)]) {
        problems.push(`${relative}:${violation.line} ${violation.reason}\n    ${violation.text}`);
      }
    }
  }
  return problems;
}

describe('async assertion scanner', () => {
  it('flags a missing invocation', () => {
    const violations = findUnawaitedAssertions("expect(page.getByTestId('text-current-temperature')).toBeVisible;");
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(1);
    expect(violations[0].reason).toContain('un-invoked');
    expect(violations[0].reason).toContain('toBeVisible');
  });

  it('flags a missing await', () => {
    const violations = findUnawaitedAssertions("expect(page.getByTestId('x')).toHaveText('y');");
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('un-awaited');
  });

  it('accepts awaited assertions, including multiline ones', () => {
    expect(findUnawaitedAssertions("await expect(page.getByTestId('x')).toBeVisible();")).toEqual([]);
    expect(findUnawaitedAssertions('await expect\n  .poll(async () => 1)\n  .toBe(1);')).toEqual([]);
    expect(findUnawaitedAssertions("await expect(page.getByTestId('x'))\n  .toBeVisible();")).toEqual([]);
  });

  it('flags a multiline un-awaited assertion', () => {
    const violations = findUnawaitedAssertions(
      "expect(page.getByTestId('text-current-temperature'))\n  .toBeVisible();",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(1);
    expect(violations[0].reason).toContain('toBeVisible');
  });

  it('flags an un-awaited expect.poll', () => {
    expect(findUnawaitedAssertions('expect.poll(async () => 1).toBe(1);')).toHaveLength(1);
    expect(findUnawaitedAssertions('expect.poll(async () => 1)\n  .toBe(1);')).toHaveLength(1);
  });

  it('flags un-awaited expect.soft assertions', () => {
    expect(findUnawaitedAssertions("expect.soft(page.getByTestId('x')).toBeVisible();")).toHaveLength(1);
    expect(findUnawaitedAssertions("expect.soft(page.getByTestId('x'))\n  .toHaveText('y');")).toHaveLength(1);
  });

  it('knows the newer async matchers', () => {
    expect(findUnawaitedAssertions("expect(page.getByTestId('x')).toMatchAriaSnapshot('- heading');")).toHaveLength(1);
    expect(findUnawaitedAssertions("expect(page.getByTestId('x')).toBeEmpty();")).toHaveLength(1);
    expect(findUnawaitedAssertions("expect(page.getByTestId('x')).toPass();")).toHaveLength(1);
  });

  it('ignores synchronous assertions and comments', () => {
    expect(findUnawaitedAssertions('expect(values).toEqual([1, 2]);')).toEqual([]);
    expect(findUnawaitedAssertions('expect(values).toHaveLength(2);')).toEqual([]);
    expect(findUnawaitedAssertions('expect(value).toBeTruthy();')).toEqual([]);
    expect(findUnawaitedAssertions("// expect(page.getByTestId('x')).toBeVisible;")).toEqual([]);
  });

  it('ignores a closing parenthesis inside a string when collecting a multiline assertion', () => {
    const source = [
      'expect(',
      "  page.getByText(')'),",
      ').toBeVisible;',
    ].join('\n');
    const violations = findUnawaitedAssertions(source);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(1);
    expect(violations[0].reason).toContain('un-invoked');
    expect(violations[0].reason).toContain('toBeVisible');
  });

  it('does not let a parenthesis inside a string merge the next assertion', () => {
    const source = [
      "expect('(').toEqual('(');",
      "expect(page.getByText('x')).toBeVisible;",
    ].join('\n');
    const violations = findUnawaitedAssertions(source);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(2);
    expect(violations[0].reason).toContain('un-invoked');
  });

  it('ignores parentheses inside regex literals and character classes', () => {
    // An escaped `)` in a regex must not close the multiline expect early; the
    // independent second assertion must still be reported.
    const escapedParen = [
      'expect(',
      '  page.getByText(/\\)/),',
      ').toBeVisible;',
      "expect(page.getByText('x')).toHaveText(/[()]/);",
    ].join('\n');
    const escapedViolations = findUnawaitedAssertions(escapedParen);
    expect(escapedViolations.map((violation) => violation.line)).toEqual([1, 4]);
    expect(escapedViolations[0].reason).toContain('un-invoked');
    expect(escapedViolations[1].reason).toContain('toHaveText');

    // A `(` in a character class must not merge the next assertion.
    const characterClass = [
      'expect(value).toMatch(/[(]/);',
      "expect(page.getByText('x')).toBeVisible;",
    ].join('\n');
    const classViolations = findUnawaitedAssertions(characterClass);
    expect(classViolations).toHaveLength(1);
    expect(classViolations[0].line).toBe(2);
  });

  it('ignores parentheses inside line and block comments', () => {
    // A `)` in a line comment must not close the multiline expect early.
    const lineComment = [
      'expect(',
      "  page.getByText('x'), // )",
      ').toBeVisible;',
    ].join('\n');
    const lineViolations = findUnawaitedAssertions(lineComment);
    expect(lineViolations).toHaveLength(1);
    expect(lineViolations[0].line).toBe(1);
    expect(lineViolations[0].reason).toContain('un-invoked');

    // A `(` in a block comment must not merge the next assertion.
    const blockComment = [
      'expect(value).toEqual(/* ( */ 1);',
      "expect(page.getByText('x')).toBeVisible;",
    ].join('\n');
    const blockViolations = findUnawaitedAssertions(blockComment);
    expect(blockViolations).toHaveLength(1);
    expect(blockViolations[0].line).toBe(2);
  });

  it('ignores template literal text but counts parentheses inside ${} expressions', () => {
    // A `)` in template text must not close the multiline expect early.
    const textCloseParen = [
      'expect(',
      '  page.getByText(`)`),',
      ').toBeVisible;',
    ].join('\n');
    const closeViolations = findUnawaitedAssertions(textCloseParen);
    expect(closeViolations).toHaveLength(1);
    expect(closeViolations[0].line).toBe(1);
    expect(closeViolations[0].reason).toContain('un-invoked');

    // A `(` in template text must not merge the next assertion.
    const textOpenParen = [
      'expect(value).toEqual(`(`);',
      "expect(page.getByText('x')).toBeVisible;",
    ].join('\n');
    const openViolations = findUnawaitedAssertions(textOpenParen);
    expect(openViolations).toHaveLength(1);
    expect(openViolations[0].line).toBe(2);

    // Parentheses inside a multiline `${...}` expression are syntactic and must
    // keep the expect call open even though the surrounding template text also
    // contains a parenthesis.
    const templateExpression = [
      'expect(',
      '  page.getByText(`) ${(',
      "    'x'",
      '  )}`),',
      ').toBeVisible;',
    ].join('\n');
    const expressionViolations = findUnawaitedAssertions(templateExpression);
    expect(expressionViolations).toHaveLength(1);
    expect(expressionViolations[0].line).toBe(1);
    expect(expressionViolations[0].reason).toContain('un-invoked');
  });

  it('flags un-awaited page actions', () => {
    expect(findUnawaitedActions("page.getByTestId('x').click();")).toHaveLength(1);
    expect(findUnawaitedActions("page.route('**', (route) => route.fulfill());")).toHaveLength(1);
  });

  it('accepts awaited actions and event subscriptions', () => {
    expect(findUnawaitedActions("await page.getByTestId('x').click();")).toEqual([]);
    expect(findUnawaitedActions("page.on('request', () => {});")).toEqual([]);
    expect(findUnawaitedActions("page.once('request', () => {});")).toEqual([]);
  });

  it('reports file:line for collected violations', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'daymark-awaits-'));
    try {
      const file = path.join(directory, 'offender.ts');
      writeFileSync(file, "page.getByTestId('x').click();\n");
      const problems = collectViolations([directory]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('offender.ts:1');
      expect(problems[0]).toContain('un-awaited Playwright action');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('E2E sources', () => {
  it('contain no un-awaited Playwright assertions or actions', () => {
    const problems = collectViolations([
      path.join(e2eRoot, 'specs'),
      path.join(e2eRoot, 'pages'),
    ]);
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
