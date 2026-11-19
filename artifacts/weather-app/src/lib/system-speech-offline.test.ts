import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Source guard for the Android System TTS offline voice selection.
 *
 * Non-English narration uses the platform TTS bridge, which must only use
 * voices that report `isNetworkConnectionRequired() == false`. There must be no
 * default-voice or online fallback, otherwise narration would silently depend
 * on the network and contradict the privacy story.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginPath = path.join(
  projectRoot,
  'android',
  'daymark-voice',
  'src',
  'main',
  'java',
  'io',
  'github',
  'sami_gor',
  'daymark',
  'voice',
  'SystemSpeechPlugin.java',
);

const plugin = readFileSync(pluginPath, 'utf8');

describe('system speech offline voice selection (source guard)', () => {
  it('file exists and is non-empty', () => {
    expect(plugin.length).toBeGreaterThan(0);
  });

  it('applies the offline gate to candidate voices', () => {
    expect(plugin).toContain('isNetworkConnectionRequired()');
  });

  it('checks installed-data availability', () => {
    expect(plugin).toContain('KEY_FEATURE_NOT_INSTALLED');
  });

  it('checks language availability', () => {
    expect(plugin).toContain('isLanguageAvailable');
  });

  it('rejects with the stable offline-unavailable string', () => {
    expect(plugin).toContain('system-tts-offline-unavailable');
  });

  it('does not fall back to the default voice', () => {
    expect(plugin).not.toContain('getDefaultVoice');
    expect(plugin).not.toContain('getDefaultEngine');
  });

  it('does not reference a remote speech or TTS endpoint', () => {
    expect(plugin).not.toMatch(/https?:\/\/|grpc\.googleapis|speech\.google\.com/i);
  });

  it('handles missing voices without crashing', () => {
    expect(plugin).toContain('getVoices()');
    // getVoices() must be invoked inside a try block so a runtime throw is caught.
    expect(plugin).toMatch(/try\s*\{[\s\S]{0,200}getVoices\(\)/);
  });
});