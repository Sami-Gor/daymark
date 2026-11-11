import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  RECOGNITION_ERROR_CODES,
  classifyNativeStartFailure,
  isKnownRecognitionErrorCode,
  isSecurityRefusal,
  normalizeRecognitionErrorCode,
  recognitionErrorStage,
  recognitionOutcomeFor,
} from './recognition-errors';
import { describeRecognitionError } from './speech-errors';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';

/*
 * Previously, an empty or failed decode was reported as `no-speech`, so a
 * failure could not be distinguished from the user not speaking.
 *
 * These tests pin the app-facing contract: three decode outcomes that used to
 * be collapsed into `no-speech` or a generic failure are now distinct codes
 * with distinct user-visible copy, and `no-speech` is reserved for genuine
 * silence.
 */

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('recognition error contract', () => {
  it('keeps silence, empty decode, refusal and decode failure distinct', () => {
    const outcomes = ['no-speech', 'empty-transcript', 'model-rejected', 'decode-failed'];
    expect(new Set(outcomes).size).toBe(outcomes.length);
    for (const code of outcomes) {
      expect(isKnownRecognitionErrorCode(code)).toBe(true);
      expect(RECOGNITION_ERROR_CODES).toContain(code);
    }
  });

  it('classifies silence differently from a failure', () => {
    expect(recognitionOutcomeFor('no-speech')).toBe('silence');
    expect(recognitionOutcomeFor('model-rejected')).toBe('failure');
    expect(recognitionOutcomeFor('empty-transcript')).toBe('failure');
    expect(recognitionOutcomeFor('decode-failed')).toBe('failure');
    expect(recognitionOutcomeFor('aborted')).toBe('cancelled');
    expect(recognitionOutcomeFor('offline-unavailable')).toBe('unavailable');
    expect(recognitionOutcomeFor('')).toBe('none');
    expect(recognitionOutcomeFor(undefined)).toBe('none');
  });

  it('treats only model-rejected as a security refusal', () => {
    expect(isSecurityRefusal('model-rejected')).toBe(true);
    expect(isSecurityRefusal(' empty-transcript ')).toBe(false);
    expect(isSecurityRefusal('decode-failed')).toBe(false);
    expect(isSecurityRefusal('no-speech')).toBe(false);
    expect(isSecurityRefusal(undefined)).toBe(false);
  });

  it('normalises bridge codes without remapping unknown ones', () => {
    expect(normalizeRecognitionErrorCode('')).toBe('unknown');
    expect(normalizeRecognitionErrorCode(null)).toBe('unknown');
    expect(normalizeRecognitionErrorCode(undefined)).toBe('unknown');
    expect(normalizeRecognitionErrorCode('  model-rejected ')).toBe('model-rejected');
    // Forward compatibility: a newer native code is preserved, not flattened.
    expect(normalizeRecognitionErrorCode('some-future-code')).toBe('some-future-code');
  });

  it('maps stages like the Android plugin so the wire metadata cannot drift', () => {
    expect(recognitionErrorStage('no-speech')).toBe('capture');
    expect(recognitionErrorStage('audio-capture')).toBe('capture');
    expect(recognitionErrorStage('aborted')).toBe('capture');
    expect(recognitionErrorStage('empty-transcript')).toBe('decode');
    expect(recognitionErrorStage('model-rejected')).toBe('decode');
    expect(recognitionErrorStage('decode-failed')).toBe('decode');
    expect(recognitionErrorStage('timeout')).toBe('decode');
    expect(recognitionErrorStage('offline-unavailable')).toBe('model');
    expect(recognitionErrorStage('model-missing')).toBe('model');
    expect(recognitionErrorStage('session-busy')).toBe('session');
    expect(recognitionErrorStage('some-future-code')).toBe('unknown');
  });

  it('keeps decode codes through a rejected start promise', () => {
    expect(classifyNativeStartFailure('model-rejected')).toBe('model-rejected');
    expect(classifyNativeStartFailure('decode-refused')).toBe('model-rejected');
    expect(classifyNativeStartFailure('decode-failed')).toBe('decode-failed');
    expect(classifyNativeStartFailure('empty-transcript')).toBe('empty-transcript');
    // Existing mappings are unchanged.
    expect(classifyNativeStartFailure('permission-blocked')).toBe('permission-blocked');
    expect(classifyNativeStartFailure('permission-denied')).toBe('permission-denied');
    expect(classifyNativeStartFailure('not-allowed')).toBe('permission-blocked');
    expect(classifyNativeStartFailure('audio-capture')).toBe('audio-capture');
    expect(classifyNativeStartFailure('model-corrupt')).toBe('offline-unavailable');
    expect(classifyNativeStartFailure('aborted')).toBe('aborted');
    expect(classifyNativeStartFailure('who knows')).toBe('unknown');
  });

  it('gives each failure its own copy, distinct from the silence copy', () => {
    const silence = describeRecognitionError('no-speech', 'en');
    const empty = describeRecognitionError('empty-transcript', 'en');
    const rejected = describeRecognitionError('model-rejected', 'en');
    const failed = describeRecognitionError('decode-failed', 'en');

    for (const copy of [silence, empty, rejected, failed]) {
      expect(copy.length).toBeGreaterThan(0);
    }
    const copies = [silence, empty, rejected, failed];
    expect(new Set(copies).size).toBe(copies.length);
    // An unknown future code still gets generic failure copy, not silence copy.
    expect(describeRecognitionError('some-future-code', 'en')).not.toBe(silence);
  });

  it('ships the new failure copy in every locale', () => {
    for (const dictionary of [en, fr, es]) {
      const entries = dictionary as Record<string, string>;
      for (const key of [
        'ask.error.emptyTranscript',
        'ask.error.decodeFailed',
        'ask.error.modelRejected',
      ] as const) {
        expect(entries[key]?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('mirrors the Android code constants (contract drift guard)', () => {
    const java = readFileSync(
      path.join(
        appRoot,
        'android/daymark-voice/src/main/java/io/github/sami_gor/daymark/voice/RecognitionErrorCodes.java',
      ),
      'utf8',
    );
    const expected: Record<string, string> = {
      NO_SPEECH: 'no-speech',
      EMPTY_TRANSCRIPT: 'empty-transcript',
      MODEL_REJECTED: 'model-rejected',
      DECODE_FAILED: 'decode-failed',
      AUDIO_CAPTURE: 'audio-capture',
      NOT_ALLOWED: 'not-allowed',
      OFFLINE_UNAVAILABLE: 'offline-unavailable',
      ABORTED: 'aborted',
      SESSION_BUSY: 'session-busy',
      INVALID_SESSION: 'invalid-session',
    };
    for (const [constant, code] of Object.entries(expected)) {
      expect(java).toContain(`static final String ${constant} = "${code}";`);
      expect(RECOGNITION_ERROR_CODES).toContain(code);
    }
    // The three decode codes must be in the Java stage mapping as decode failures.
    expect(java).toMatch(/case EMPTY_TRANSCRIPT:[\s\S]*?case MODEL_REJECTED:[\s\S]*?case DECODE_FAILED:[\s\S]*?return Stage\.DECODE;/);
  });

  it('wires the distinction into the UI layer', () => {
    const ask = readFileSync(path.join(appRoot, 'src/components/weather/AskDaymark.tsx'), 'utf8');
    expect(ask).toContain('data-error-kind={recognition.errorKind}');
    expect(ask).toContain('data-error-code={recognition.errorCode}');
    expect(ask).toContain('{recognition.error}');

    const hook = readFileSync(path.join(appRoot, 'src/hooks/use-speech-recognition.ts'), 'utf8');
    expect(hook).toContain('errorKind: recognitionOutcomeFor(errorCode)');
    expect(hook).toContain('setErrorCode(code)');

    const bridge = readFileSync(path.join(appRoot, 'src/lib/voice-input-native.ts'), 'utf8');
    expect(bridge).toContain('normalizeRecognitionErrorCode(event.code)');
    expect(bridge).toContain('classifyNativeStartFailure(message)');
  });
});
