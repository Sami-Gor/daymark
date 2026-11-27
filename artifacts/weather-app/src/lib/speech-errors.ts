import { translate, type Locale } from './i18n';
import { normalizeRecognitionErrorCode } from './recognition-errors';

/**
 * Friendly, non-repeating copy for recognition failures, localized.
 *
 * Previously, an empty or failed decode shared the "no-speech" copy, so a
 * failure could not be told apart from silence.
 * They now have their own copy (and their own codes); the silence copy is
 * reserved for `no-speech`, where nothing was decoded at all.
 */
export function describeRecognitionError(error: string | null | undefined, locale: Locale = 'en'): string {
  switch (normalizeRecognitionErrorCode(error)) {
    case 'not-allowed':
    case 'service-not-allowed':
      return translate(locale, 'ask.error.blocked');
    case 'permission-denied':
      return translate(locale, 'ask.error.micDeniedAndroid');
    case 'permission-blocked':
      return translate(locale, 'ask.error.micBlockedAndroid');
    case 'no-speech':
      return translate(locale, 'ask.error.noSpeech');
    case 'empty-transcript':
      return translate(locale, 'ask.error.emptyTranscript');
    case 'model-rejected':
      return translate(locale, 'ask.error.modelRejected');
    case 'decode-failed':
      return translate(locale, 'ask.error.decodeFailed');
    case 'audio-capture':
      return translate(locale, 'ask.error.audio');
    case 'network':
      return translate(locale, 'ask.error.network');
    case 'timeout':
      return translate(locale, 'ask.error.noSpeech');
    case 'offline-unavailable':
    case 'api-unsupported':
      return translate(locale, 'ask.error.offlineUnavailable');
    case 'aborted':
      return translate(locale, 'ask.error.aborted');
    default:
      return translate(locale, 'ask.error.unknown');
  }
}
