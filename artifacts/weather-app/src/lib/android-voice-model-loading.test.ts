import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the Android speech-model loading and failure handling.
 *
 * Parakeet is delivered as an install-time asset pack and materialised into the
 * app's private files directory. The runtime must treat a missing, truncated or
 * otherwise unusable model as a *controlled* error (no crash, no fallback to an
 * online recogniser, no audio/transcript leaving the device) and report a stable
 * reason code to the web layer.
 *
 * The check reads the Android sources from disk, in the same style as
 * `android-voice-implementation.test.ts`.
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
  'ParakeetSpeechRecognitionPlugin.java',
);
const assetsPath = path.join(
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
  'ParakeetModelAssets.java',
);

const plugin = readFileSync(pluginPath, 'utf8');
const assets = readFileSync(assetsPath, 'utf8');

describe('android speech model loading and failure handling', () => {
  it('ParakeetModelAssets declares the four model files', () => {
    expect(assets).toContain('MODEL_FILE_NAMES');
    expect(assets).toContain('encoder.int8.onnx');
    expect(assets).toContain('decoder.int8.onnx');
    expect(assets).toContain('joiner.int8.onnx');
    expect(assets).toContain('tokens.txt');
  });

  it('ParakeetModelAssets declares exact byte sizes', () => {
    expect(assets).toContain('MODEL_FILE_SIZES');
  });

  it('declares stable reason codes for missing / preparing / runtime-unavailable', () => {
    // Constants live in ParakeetModelAssets; the plugin references them.
    expect(assets).toContain('REASON_MODEL_MISSING');
    expect(assets).toContain('REASON_MODEL_PREPARING');
    expect(assets).toContain('REASON_RUNTIME_UNAVAILABLE');
    expect(assets).toContain('model-missing');
    expect(assets).toContain('model-preparing');
    expect(assets).toContain('runtime-unavailable');
    expect(plugin).toContain('ParakeetModelAssets.REASON_MODEL_MISSING');
    expect(plugin).toContain('ParakeetModelAssets.REASON_MODEL_PREPARING');
  });

  it('checks asset presence before use', () => {
    expect(plugin).toContain('assetsPresent()');
    expect(plugin).toContain('modelFilesPresent()');
  });

  it('materialises the model and verifies byte length after copy', () => {
    expect(plugin).toContain('materialiseModel()');
    expect(plugin).toContain('target.length() != expected');
  });

  it('reports controlled errors instead of throwing', () => {
    expect(plugin).toContain('catch (Throwable');
    // Rejection paths use stable reason codes, not raw exception messages.
    expect(plugin).toContain('finishWithError');
  });

  it('does not use Android SpeechRecognizer as a runtime recogniser', () => {
    // The word may appear in documentation explaining its absence; ensure there
    // is no import or instantiation of it.
    expect(plugin).not.toMatch(/import\s+android\.speech\.SpeechRecognizer/);
    expect(plugin).not.toMatch(/SpeechRecognizer\.create/);
    expect(plugin).not.toMatch(/createOnDeviceSpeechRecognizer|createSpeechRecognizer/);
  });

  it('does not reference a remote speech endpoint', () => {
    expect(plugin).not.toMatch(/speech\.google\.com|api\.speech|grpc\.googleapis\.com\/speech/i);
  });

  it('does not contain any http(s) URL (no remote service)', () => {
    expect(plugin).not.toMatch(/https?:\/\//);
  });

  it('does not persist captured audio to disk', () => {
    // Audio capture lives in SampleBuffer (in-memory); the only FileOutputStream
    // usage is materialising the model pack, which is not user audio.
    expect(plugin).toContain('final SampleBuffer samples = new SampleBuffer()');
    const audioWrites = plugin.match(/new FileOutputStream/g) ?? [];
    // Only the model materialisation writes a file; captured audio must never
    // be persisted (it lives in SampleBuffer, in-memory).
    expect(audioWrites.length).toBe(1);
  });
});