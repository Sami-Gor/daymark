import { translate, type Locale } from './i18n';

/** Friendly, stable copy for narration failures, localized. */
export function describeNarrationError(error: string | null | undefined, locale: Locale = 'en'): string {
  switch (error) {
    case 'unsupported-language':
      return translate(locale, 'voice.error.unsupportedLanguage');
    case 'french-spanish-unavailable':
      return translate(locale, 'voice.error.frenchSpanishUnavailable');
    case 'native-unavailable':
      return translate(locale, 'voice.error.nativeUnavailable');
    case 'model-init-failed':
      return translate(locale, 'voice.error.modelUnavailable');
    case 'voice-asset-invalid':
      return translate(locale, 'voice.error.assetUnavailable');
    case 'synthesis-failed':
      return translate(locale, 'voice.error.synthesisFailed');
    case 'playback-failed':
      return translate(locale, 'voice.error.playbackFailed');
    case 'offline-voice-unavailable':
      return translate(locale, 'voice.error.offlineUnavailable');
    default:
      return translate(locale, 'voice.error.unavailable');
  }
}

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
