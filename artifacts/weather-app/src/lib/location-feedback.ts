import type { TranslationKey } from '@/locales/en';

/** A user-visible reason why "Use my location" did not produce a fix. */
export type LocationFailure = 'denied' | 'timeout' | 'unavailable' | 'unsupported';

/**
 * Maps a GeolocationPositionError code to a stable failure kind.
 * Codes: 1 = permission denied, 2 = position unavailable, 3 = timeout.
 */
export function locationFailureFromCode(code: number | undefined, supported = true): LocationFailure {
  if (!supported) return 'unsupported';
  if (code === 1) return 'denied';
  if (code === 3) return 'timeout';
  return 'unavailable';
}

/**
 * Translation key for a failure. Android permission denial gets a dedicated
 * message that names the default place and explains how to recover; the web
 * message keeps the site-permission wording.
 */
export function locationFailureKey(failure: LocationFailure, androidNative: boolean): TranslationKey {
  switch (failure) {
    case 'denied':
      return androidNative ? 'current.locationDeniedAndroid' : 'current.locationDenied';
    case 'timeout':
      return 'current.locationTimeout';
    case 'unsupported':
      return 'current.locationUnsupported';
    default:
      return 'current.locationUnavailable';
  }
}

export const LOCATION_RETRY_KEY: TranslationKey = 'current.locationRetry';
export const LOCATION_TITLE_KEY: TranslationKey = 'current.locationTitle';
