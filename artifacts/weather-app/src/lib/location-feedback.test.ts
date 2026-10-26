import { describe, expect, it } from 'vitest';
import {
  locationFailureFromCode,
  locationFailureKey,
} from './location-feedback';

describe('location failure feedback', () => {
  it('maps permission denial, unavailable and timeout codes', () => {
    expect(locationFailureFromCode(1)).toBe('denied');
    expect(locationFailureFromCode(2)).toBe('unavailable');
    expect(locationFailureFromCode(3)).toBe('timeout');
    expect(locationFailureFromCode(undefined)).toBe('unavailable');
  });

  it('maps an unsupported browser instead of treating it as a denial', () => {
    expect(locationFailureFromCode(undefined, false)).toBe('unsupported');
    expect(locationFailureKey('unsupported', false)).toBe('current.locationUnsupported');
  });

  it('uses an Android-specific denial message that names the default place and recovery', () => {
    expect(locationFailureKey('denied', true)).toBe('current.locationDeniedAndroid');
    expect(locationFailureKey('denied', false)).toBe('current.locationDenied');
  });

  it('keeps timeout and unavailable messages distinct', () => {
    expect(locationFailureKey('timeout', true)).toBe('current.locationTimeout');
    expect(locationFailureKey('unavailable', true)).toBe('current.locationUnavailable');
  });
});
