import { describe, expect, it } from 'vitest';

import { describeNarrationError, describeRecognitionError } from './speech-errors';

describe('narration failure copy', () => {
  it('maps every stable narration failure to distinct, localized copy', () => {
    const codes = [
      'unsupported-language',
      'french-spanish-unavailable',
      'native-unavailable',
      'model-init-failed',
      'voice-asset-invalid',
      'synthesis-failed',
      'playback-failed',
      'offline-voice-unavailable',
      'unknown',
    ] as const;
    const english = codes.map((code) => describeNarrationError(code, 'en'));
    expect(new Set(english).size).toBe(codes.length);
    for (const locale of ['fr', 'es'] as const) {
      const localized = codes.map((code) => describeNarrationError(code, locale));
      expect(new Set(localized).size).toBe(codes.length);
      expect(localized.some((copy) => copy === english[0])).toBe(false);
    }
  });

  it('does not use a generic recognition error for narration failures', () => {
    expect(describeNarrationError('model-init-failed', 'en'))
      .not.toBe(describeRecognitionError('unknown', 'en'));
    expect(describeNarrationError('playback-failed', 'en'))
      .not.toBe(describeNarrationError('synthesis-failed', 'en'));
  });
});
