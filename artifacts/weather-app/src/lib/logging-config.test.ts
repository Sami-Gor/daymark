import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../capacitor.config';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('release logging configuration', () => {
  it('disables Capacitor console bridging explicitly (not via debug defaults)', () => {
    expect(config.android?.loggingBehavior).toBe('none');
  });

  it('keeps the shipped WebView settings safe', () => {
    expect(config.android?.allowMixedContent).toBe(false);
    expect(config.server?.androidScheme).toBe('https');
  });

  it('does not log recognition payloads from the web layer', () => {
    const source = readFileSync(path.join(appRoot, 'src/lib/voice-input-native.ts'), 'utf8');
    expect(source).not.toMatch(/console\.(log|debug|info)/);
  });

  it('does not log recognition payloads from the native plugin', () => {
    const plugin = readFileSync(
      path.join(
        appRoot,
        'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/ParakeetSpeechRecognitionPlugin.java',
      ),
      'utf8',
    );
    // The plugin reports results through notifyListeners, not the log.
    expect(plugin).not.toMatch(/Log\.[dviw]\([^)]*transcript/i);
    expect(plugin).not.toMatch(/Log\.[dviw]\([^)]*sessionId[^)]*\)/i);
  });
});
