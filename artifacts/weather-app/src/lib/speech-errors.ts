import { translate, type Locale } from './i18n';
import { normalizeRecognitionErrorCode } from './recognition-errors';

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

/**
 * Friendly, non-repeating copy for recognition failures, localized.
 *
 * Previously, an empty or failed decode shared the 'no-speech' copy, so a
 * failure could not be told apart from silence. They now have their own copy
 * (and their own codes); the silence copy is reserved for 'no-speech', where
 * nothing was decoded at all. An unsupported recognition language is its own
 * explicit state: recognition never silently runs a different language.
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
    case 'unsupported-language':
      return translate(locale, 'ask.error.unsupportedLanguage');
    case 'offline-unavailable':
    case 'api-unsupported':
      return translate(locale, 'ask.error.offlineUnavailable');
    case 'aborted':
      return translate(locale, 'ask.error.aborted');
    default:
      return translate(locale, 'ask.error.unknown');
  }
}
