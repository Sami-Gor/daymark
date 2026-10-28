import { translate, type Locale } from './i18n';

/** Friendly, non-repeating copy for recognition failures, localized. */
export function describeRecognitionError(error: string | null | undefined, locale: Locale = 'en'): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return translate(locale, 'ask.error.blocked');
    case 'permission-denied':
      return translate(locale, 'ask.error.micDeniedAndroid');
    case 'permission-blocked':
      return translate(locale, 'ask.error.micBlockedAndroid');
    case 'no-speech':
      return translate(locale, 'ask.error.noSpeech');
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
