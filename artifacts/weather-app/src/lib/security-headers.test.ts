import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for duplicated security headers.
 *
 * The production header set (public/_headers) and the Vite preview middleware
 * (vite.config.ts) intentionally carry the same headers because some hosts do
 * not read `_headers`. They drifted once (the microphone policy was updated in
 * one place only). This test compares the full Permissions-Policy strings from
 * both sources directly, so the policy is not restated in a third location.
 *
 * The intended directive contents are independently asserted against the
 * served header by the e2e security-headers test.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function productionPermissionsPolicy(): string {
  const match = read('public/_headers').match(/^\s*Permissions-Policy:\s*(.+?)\s*$/m);
  if (!match) throw new Error('Permissions-Policy not found in public/_headers');
  return match[1];
}

function previewPermissionsPolicy(): string {
  const match = read('vite.config.ts').match(/'Permissions-Policy':\s*'([^']*)'/);
  if (!match) throw new Error('Permissions-Policy not found in vite.config.ts');
  return match[1];
}

describe('security header parity', () => {
  it('keeps the production and preview Permissions-Policy identical', () => {
    expect(previewPermissionsPolicy()).toBe(productionPermissionsPolicy());
  });
});
