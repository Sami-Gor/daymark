import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Static Android compatibility guard.
 *
 * These are the values the build actually consumes. They are deliberately
 * checked here because changing minSdk, the shipped ABI or the WebView floor
 * would otherwise be a silent compatibility change. Runtime behaviour on an
 * emulator or phone is separate evidence, not established by this test.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const androidRoot = path.join(projectRoot, 'android');
const read = (...parts: string[]) => readFileSync(path.join(androidRoot, ...parts), 'utf8');

describe('Android platform compatibility contract', () => {
  it('keeps the API 29 minimum and the Android 36 build target', () => {
    const variables = read('variables.gradle');
    expect(variables).toMatch(/minSdkVersion\s*=\s*29\b/);
    expect(variables).toMatch(/compileSdkVersion\s*=\s*36\b/);
    expect(variables).toMatch(/targetSdkVersion\s*=\s*36\b/);
  });

  it('ships only the arm64 native ABI and Java 17 bytecode', () => {
    expect(read('app', 'build.gradle')).toMatch(/abiFilters\s+["']arm64-v8a["']/);
    const voice = read('daymark-voice', 'build.gradle');
    expect(voice).toMatch(/abiFilters\s+['"]arm64-v8a['"]/);
    expect(voice).toMatch(/sourceCompatibility\s+JavaVersion\.VERSION_17/);
    expect(voice).toMatch(/targetCompatibility\s+JavaVersion\.VERSION_17/);
  });

  it('does not raise the WebView floor to hide a compatibility failure', () => {
    const gate = read('app', 'src', 'main', 'java', 'io', 'github', 'sami_gor', 'daymark', 'WebViewCompatibility.java');
    expect(gate).toMatch(/MINIMUM_WEBVIEW_MAJOR\s*=\s*90\b/);
    expect(gate).toMatch(/isSupported\(Integer majorVersion\)/);
  });

  it('has localised native WebView fallback copy for every supported language', () => {
    for (const values of ['values', 'values-fr', 'values-es']) {
      const strings = read('app', 'src', 'main', 'res', values, 'strings.xml');
      expect(strings, values).toContain('name="webview_required_title"');
      expect(strings, values).toContain('name="webview_required_message"');
      expect(strings, values).toContain('name="webview_assets_missing_title"');
      expect(strings, values).toContain('name="webview_assets_missing_message"');
      expect(strings, values).toContain('name="webview_recovery_title"');
      expect(strings, values).toContain('name="webview_recovery_message"');
      expect(strings, values).toContain('name="webview_recovery_reload"');
    }
  });

  it('keeps the approved permission surface', () => {
    const manifest = read('app', 'src', 'main', 'AndroidManifest.xml');
    expect(manifest).toContain('android.permission.ACCESS_COARSE_LOCATION');
    expect(manifest).not.toContain('ACCESS_FINE_LOCATION');
    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    expect(manifest).toContain('android.permission.INTERNET');
  });

  it('checks the packaged web entry point before starting the bridge', () => {
    const activity = read('app', 'src', 'main', 'java', 'io', 'github', 'sami_gor', 'daymark', 'MainActivity.java');
    const screen = read('app', 'src', 'main', 'java', 'io', 'github', 'sami_gor', 'daymark', 'WebViewCompatibilityScreen.java');
    expect(activity).toContain('hasRequiredAssets');
    expect(activity).toContain('showMissingAssets');
    expect(activity).toContain('registerPlugin(DaymarkRecoveryPlugin.class)');
    expect(activity).toContain('new DaymarkWebViewClient');
    expect(screen).toContain('public/index.html');
    expect(screen).toContain('showRecovery');
  });

  it('keeps native recovery as an overlay and reloads the attached WebView in place', () => {
    const activity = read('app', 'src', 'main', 'java', 'io', 'github', 'sami_gor', 'daymark', 'MainActivity.java');
    const screen = read('app', 'src', 'main', 'java', 'io', 'github', 'sami_gor', 'daymark', 'WebViewCompatibilityScreen.java');
    expect(activity).not.toContain('setContentView(bridge.getWebView())');
    expect(activity).toContain('bridge.reload()');
    expect(screen).toContain('android.R.id.content');
    expect(screen).toContain('content.addView');
    expect(activity).toContain('removeView(overlay)');
  });

  it('keeps renderer death off the live-reload path and gates readiness on rendered content', () => {
    const client = read('app', 'src', 'main', 'java', 'io', 'github', 'sami_gor', 'daymark', 'DaymarkWebViewClient.java');
    const screen = read('app', 'src', 'main', 'java', 'io', 'github', 'sami_gor', 'daymark', 'WebViewCompatibilityScreen.java');
    expect(client).toContain('onWebViewRendererGone');
    expect(client).toContain("getElementById('root')");
    expect(client).toContain('childElementCount');
    expect(screen).toContain('showRendererUnavailable');
    expect(screen).toMatch(/showRendererUnavailable[\s\S]*?null\)/);
  });
});
