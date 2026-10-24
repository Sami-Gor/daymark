import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the Capacitor geolocation coarse-only rescue patch.
 *
 * Daymark's Android manifest declares only ACCESS_COARSE_LOCATION. Capacitor's
 * `BridgeWebChromeClient.onGeolocationPermissionsShowPrompt` requests
 * `{COARSE, FINE}` and treats the result as granted only when *all* requested
 * permissions are granted. Because FINE is not declared it is always
 * auto-denied, so the AND-callback reports failure. Upstream rescues a
 * coarse-only grant — but only on API >= 31 (`Build.VERSION.SDK_INT >= S`),
 * which denied WebView geolocation outright on API 24–30 even with coarse
 * granted (reproduced on an API 30 emulator: geolocation error code 1 with
 * `ACCESS_COARSE_LOCATION` granted; `pm grant ACCESS_FINE_LOCATION` throws
 * because the permission is undeclared).
 *
 * The repo therefore carries a pnpm patch that removes the API gate, so the
 * coarse-only rescue applies on every supported API level. These checks pin:
 *   1. the shipped patch file removes exactly that gate,
 *   2. pnpm-workspace.yaml wires the patch into installs,
 *   3. the installed @capacitor/android copy carries the ungated rescue,
 *   4. the Android build compiles the *patched* store copy — the generated
 *      `capacitor.settings.gradle` must reference the `patch_hash=` store
 *      directory and that directory must exist (a stale settings file would
 *      silently compile unpatched Capacitor).
 */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const patchFile = path.join(repoRoot, 'patches', '@capacitor__android@8.5.1.patch');
const workspaceFile = path.join(repoRoot, 'pnpm-workspace.yaml');
const bridgeClientFile = path.join(
  appRoot,
  'node_modules',
  '@capacitor',
  'android',
  'capacitor',
  'src',
  'main',
  'java',
  'com',
  'getcapacitor',
  'BridgeWebChromeClient.java',
);
const settingsGradleFile = path.join(appRoot, 'android', 'capacitor.settings.gradle');

function geolocationPromptBody(source: string): string {
  const start = source.indexOf('onGeolocationPermissionsShowPrompt');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('onShowFileChooser', start);
  return source.slice(start, end > start ? end : undefined);
}

describe('capacitor geolocation coarse-only rescue', () => {
  it('ships a pnpm patch that removes the API-31-only gate', () => {
    expect(existsSync(patchFile)).toBe(true);
    const patch = readFileSync(patchFile, 'utf8');
    // The patch must delete the SDK_INT gate from the geolocation prompt...
    expect(patch).toContain('-                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&');
    // ...and replace the guarded block with the unconditional coarse rescue.
    expect(patch).toContain('+                    if (PermissionHelper.hasPermissions(bridge.getContext(), coarsePermission)) {');
  });

  it('wires the patch into pnpm installs via patchedDependencies', () => {
    const workspace = readFileSync(workspaceFile, 'utf8');
    expect(workspace).toMatch(/patchedDependencies:/);
    expect(workspace).toContain(`'@capacitor/android@8.5.1': patches/@capacitor__android@8.5.1.patch`);
  });

  it('installed @capacitor/android rescues coarse-only grants on every API level', () => {
    expect(existsSync(bridgeClientFile)).toBe(true);
    const installed = readFileSync(bridgeClientFile, 'utf8');
    const body = geolocationPromptBody(installed);
    expect(body).toContain('PermissionHelper.hasPermissions(bridge.getContext(), coarsePermission)');
    expect(body).not.toContain('Build.VERSION.SDK_INT >= Build.VERSION_CODES.S');
  });

  it('the Android build compiles the patched Capacitor copy', () => {
    const settings = readFileSync(settingsGradleFile, 'utf8');
    const match = settings.match(/project\(':capacitor-android'\)\.projectDir = new File\('([^']+)'\)/);
    expect(match).not.toBeNull();
    const relative = match![1];
    // The generated reference must point at the pnpm *patched* store entry.
    expect(relative).toMatch(/@capacitor\+android@[^/]*patch_hash=[0-9a-f]+_/);
    const projectDir = path.resolve(appRoot, 'android', relative);
    expect(existsSync(projectDir)).toBe(true);
  });
});
