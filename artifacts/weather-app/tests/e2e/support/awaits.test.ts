import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for the missing-await finding from the QA review.
 *
 * Playwright assertions and actions are asynchronous. An un-awaited assertion
 * such as `expect(locator).toBeVisible;` (or `expect(locator).toBeVisible()`)
 * either never executes or races the next step. This check statically scans the
 * E2E specs and page objects so the same class of mistake cannot return, and is
 * run by the normal Vitest unit-test layer in CI.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const e2eRoot = path.resolve(here, '..');

/** Playwright matchers that return a promise and therefore need `await`. */
const ASYNC_MATCHERS = [
  'toBeVisible',
  'toBeHidden',
  'toBeAttached',
  'toHaveText',
  'toContainText',
  'toHaveCount',
  'toHaveAttribute',
  'toHaveClass',
  'toHaveValue',
  'toBeChecked',
  'toBeEnabled',
  'toBeDisabled',
  'toBeEditable',
  'toBeFocused',
  'toBeInViewport',
  'toHaveCSS',
  'toHaveId',
  'toHaveJSProperty',
  'toHaveURL',
  'toHaveTitle',
  'toHaveScreenshot',
  'toHaveAccessibleName',
  'toHaveAccessibleDescription',
  'toHaveRole',
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

const ASYNC_MATCHER_PATTERN = new RegExp(`\\.(${ASYNC_MATCHERS.join('|')})\\s*\\(?`);
const ASYNC_ACTION_PATTERN = new RegExp(
  `\\b(?:page|browser|context|dashboard|sections|search|voice|alerts|privacy|promo|api|geo|speech)\\.[\\w$]+\\(`,
);

function isComment(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function isAwaited(trimmed: string): boolean {
  return /(^|[\s(])await\s+/.test(trimmed) || /^(return|void)\s+/.test(trimmed);
}

/** Detect un-awaited Playwright async assertions in a source string. */
export function findUnawaitedAssertions(source: string): Violation[] {
  const lines = source.split('\n');
  const violations: Violation[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || isComment(trimmed)) return;
    if (!/\bexpect(?:\.poll)?\s*\(/.test(trimmed)) return;
    if (isAwaited(trimmed)) return;

    // A same-line matcher is the common case (and the original defect).
    const sameLineMatcher = trimmed.match(ASYNC_MATCHER_PATTERN);
    if (sameLineMatcher) {
      violations.push({
        line: index + 1,
        text: trimmed,
        reason: `un-awaited Playwright assertion (.${sameLineMatcher[1]})`,
      });
      return;
    }

    // Any un-awaited expect.poll is a defect regardless of line shape.
    if (/\bexpect\.poll\s*\(/.test(trimmed)) {
      violations.push({ line: index + 1, text: trimmed, reason: 'un-awaited expect.poll' });
      return;
    }

    // Only scan following lines when the expect call itself is still open.
    const openParens = (trimmed.match(/\(/g) ?? []).length;
    const closeParens = (trimmed.match(/\)/g) ?? []).length;
    if (openParens <= closeParens) return;
    const window = lines.slice(index + 1, index + 4).join('\n');
    const matcher = window.match(ASYNC_MATCHER_PATTERN);
    if (!matcher) return;
    violations.push({
      line: index + 1,
      text: trimmed,
      reason: `un-awaited Playwright assertion (.${matcher[1]})`,
    });
  });
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

function collectViolations(directories: string[]): string[] {
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
  });

  it('flags a missing await', () => {
    expect(findUnawaitedAssertions("expect(page.getByTestId('x')).toHaveText('y');")).toHaveLength(1);
  });

  it('accepts awaited assertions, including multiline ones', () => {
    expect(findUnawaitedAssertions("await expect(page.getByTestId('x')).toBeVisible();")).toEqual([]);
    expect(findUnawaitedAssertions("await expect\n  .poll(async () => 1)\n  .toBe(1);")).toEqual([]);
  });

  it('ignores synchronous assertions and comments', () => {
    expect(findUnawaitedAssertions('expect(values).toEqual([1, 2]);')).toEqual([]);
    expect(findUnawaitedAssertions("// expect(page.getByTestId('x')).toBeVisible;")).toEqual([]);
  });

  it('flags un-awaited page actions', () => {
    expect(findUnawaitedActions("page.getByTestId('x').click();")).toHaveLength(1);
    expect(findUnawaitedActions("page.route('**', (route) => route.fulfill());")).toHaveLength(1);
  });

  it('accepts awaited actions and event subscriptions', () => {
    expect(findUnawaitedActions("await page.getByTestId('x').click();")).toEqual([]);
    expect(findUnawaitedActions("page.on('request', () => {});")).toEqual([]);
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
