import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard for the Android voice-input implementation.
 *
 * Daymark V2 runs Parakeet TDT 0.6B v3 (int8) through sherpa-onnx on the
 * device. Android's own `SpeechRecognizer` must not come back, and no remote
 * recogniser may be registered, because either would change what the app
 * promises about voice input and about network traffic.
 *
 * The check reads the Android sources from disk, in the same style as
 * `storage-surface.test.ts`.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const androidRoot = path.join(projectRoot, 'android');

function collectJavaSources(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'build' || entry === '.gradle') continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) collectJavaSources(full, out);
    else if (entry.endsWith('.java')) out.push(full);
  }
  return out;
}

const javaSources = collectJavaSources(androidRoot);
const readAll = () => javaSources.map((file) => ({ file, text: readFileSync(file, 'utf8') }));

describe('android voice input implementation', () => {
  it('keeps the Parakeet model exclusively in the install-time asset pack', () => {
    // The base app source set must not carry a second copy. A duplicate base
    // copy is what caused the AAB asset collision.
    const baseModelDir = path.join(androidRoot, 'app/src/main/assets/parakeet');
    if (existsSync(baseModelDir)) {
      expect(readdirSync(baseModelDir).filter((name) => name.endsWith('.onnx') || name === 'tokens.txt'))
        .toEqual([]);
    }

    const packBuild = readFileSync(
      path.join(androidRoot, 'parakeet-assets/build.gradle'),
      'utf8',
    );
    expect(packBuild).toMatch(/deliveryType\s*=\s*["']install-time["']/);
    expect(packBuild).toMatch(/verifyParakeetAssets/);

    const appBuild = readFileSync(path.join(androidRoot, 'app/build.gradle'), 'utf8');
    expect(appBuild).toMatch(/verifyParakeetAssetOwnership/);
    expect(appBuild).toMatch(/assetPacks\s*=\s*\[":parakeet-assets"\]/);
  });

  it('finds the android sources to check', () => {
    expect(javaSources.length).toBeGreaterThan(0);
  });

  it('does not use Android\'s SpeechRecognizer anywhere', () => {
    const offenders = readAll()
      .filter(({ text }) =>
        text.includes('android.speech.SpeechRecognizer') ||
        text.includes('createOnDeviceSpeechRecognizer') ||
        text.includes('createSpeechRecognizer') ||
        text.includes('RecognizerIntent') ||
        text.includes('ACTION_RECOGNIZE_SPEECH'))
      .map(({ file }) => path.relative(androidRoot, file));
    expect(offenders).toEqual([]);
  });

  it('does not reference a remote speech recogniser', () => {
    const offenders = readAll()
      .filter(({ text }) => /speech\.google\.com|api\.speech|grpc\.googleapis\.com\/speech/i.test(text))
      .map(({ file }) => path.relative(androidRoot, file));
    expect(offenders).toEqual([]);
  });

  it('registers exactly one speech-recognition plugin', () => {
    const mainActivity = readFileSync(
      path.join(androidRoot, 'app', 'src', 'main', 'java', 'io', 'github', 'sami_gor', 'daymark', 'MainActivity.java'),
      'utf8',
    );
    const registrations = [...mainActivity.matchAll(/registerPlugin\((\w+)\.class\)/g)].map((match) => match[1]);
    expect(registrations).toContain('ParakeetSpeechRecognitionPlugin');
    expect(registrations.filter((name) => name.includes('SpeechRecognition'))).toEqual([
      'ParakeetSpeechRecognitionPlugin',
    ]);
    // V2 does not register a system-TTS fallback; French/Spanish narration is
    // explicitly unavailable until the planned V2.2 work.
    expect(registrations).not.toContain('SystemSpeechPlugin');
    // The plugin's own Capacitor name is the one the web layer calls.
    const plugin = readFileSync(
      path.join(
        androidRoot,
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
      ),
      'utf8',
    );
    expect(plugin).toContain('name = "ParakeetSpeechRecognition"');
  });

  it('does not ship a second implementation of the same Capacitor plugin name', () => {
    const pluginNames = readAll()
      .map(({ text }) => text.match(/@CapacitorPlugin\(\s*name\s*=\s*"([^"]+)"/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => match[1]);
    const duplicates = pluginNames.filter((name, index) => pluginNames.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });

  it('runs the model on the device with the evaluated configuration', () => {
    const plugin = readFileSync(
      path.join(
        androidRoot,
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
      ),
      'utf8',
    );
    expect(plugin).toContain('SAMPLE_RATE = 16000');
    expect(plugin).toContain('FEATURE_DIMENSION = 80');
    expect(plugin).toContain('setDecodingMethod("greedy_search")');
    expect(plugin).toContain('setModelType("nemo_transducer")');
    expect(plugin).toContain('setProvider("cpu")');
    // A fresh stream per utterance.
    expect(plugin).toContain('engine.createStream()');
  });

  it('does not log transcripts or audio', () => {
    // Flags a log statement that passes a transcript or recognised text as a
    // value. The word "text" inside a literal message is not a transcript.
    const offenders = readAll()
      .filter(({ text }) =>
        /Log\.[vdiew]\([^)]*(?:\+\s*|\(\s*|,\s*)(?:text|transcript|recognisedText)\b/.test(text))
      .map(({ file }) => path.relative(androidRoot, file));
    expect(offenders).toEqual([]);
  });
});
