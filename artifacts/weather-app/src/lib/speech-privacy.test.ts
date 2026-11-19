import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Source-level boundary for the V2 speech path.
 *
 * The native recognition and narration engines run on the device. This test
 * pins the remaining data-flow expectations around the transcript: it may be
 * normalized and used to resolve a local weather intent, but it must not be
 * sent to a network client, persisted as history, or passed to telemetry/log
 * payloads.
 *
 * This is not a packet-level claim and does not replace a device run. The
 * separate Android voice and network-boundary tests cover the native bridge.
 */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const speechSources = [
  'src/lib/voice-input-native.ts',
  'src/hooks/use-speech-recognition.ts',
  'src/components/weather/AskDaymark.tsx',
  'src/hooks/use-daymark-speech.ts',
  'src/lib/speech-router.ts',
  'src/lib/speech-engine.ts',
  'src/lib/speech-ui-state.ts',
  'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/ParakeetSpeechRecognitionPlugin.java',
  'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/AudioSpeechCaptureDevice.java',
  'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/DaymarkVoicePlugin.java',
];

const read = (relative: string) => readFileSync(path.join(appRoot, relative), 'utf8');

describe('V2 speech privacy boundary', () => {
  it('has no network, analytics, or telemetry client in the speech path', () => {
    const forbidden = /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|axios|HttpURLConnection|OkHttp|URLConnection)\b|https?:\/\//i;
    const analytics = /firebase|sentry|analytics|telemetry|mixpanel|posthog|bugsnag|datadog|newrelic/i;
    const offenders = speechSources
      .map((file) => ({ file, text: read(file) }))
      .filter(({ text }) => forbidden.test(text) || analytics.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('does not persist transcript or audio content in the speech path', () => {
    const forbidden = /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/i;
    const offenders = speechSources
      .map((file) => ({ file, text: read(file) }))
      .filter(({ text }) => forbidden.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);

    // The only Android SharedPreferences use in the recognition plugin is the
    // microphone-prompt flag, not transcript/audio history.
    const native = read(speechSources[7]);
    expect(native).toContain('PERMISSION_PREFS = "daymark.permissions"');
    expect(native).toContain('MIC_REQUESTED_KEY = "microphone-requested"');
    expect(native).not.toMatch(/(?:transcript|audio|recognition).{0,40}(?:putString|FileOutputStream|writeBytes)/i);
  });

  it('does not log or serialize transcript or audio payloads', () => {
    const offenders = speechSources
      .map((file) => ({ file, text: read(file) }))
      .filter(({ text }) =>
        /(?:console\.(?:log|debug|info|warn|error)|Log\.[vdiew])[^\n]*(?:transcript|recognisedText|rawAudio|audioData)/i.test(text)
        || /JSON\.stringify\([^)]*(?:transcript|audio)/i.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('keeps the transcript flow inside intent resolution and UI state', () => {
    const ask = read('src/components/weather/AskDaymark.tsx');
    expect(ask).toContain('onTranscript: (transcript)');
    expect(ask).toContain('normalizeTranscript(transcript)');
    expect(ask).toContain('resolveIntentTranscripts(question)');
    expect(ask).not.toMatch(/(?:fetch|XMLHttpRequest|axios|localStorage|sendBeacon)/);
  });

  it('does not expose a browser speech fallback from the V2 hook', () => {
    const hook = read('src/hooks/use-speech-recognition.ts');
    expect(hook).toContain('createParakeetRecognitionController');
    expect(hook).not.toMatch(/new\s+SpeechRecognition|webkitSpeechRecognition|SpeechRecognition\./);
  });
});
