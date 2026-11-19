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

describe('localised location notices', () => {
  it('provides the Android denial guidance in every supported locale', async () => {
    const en = (await import('@/locales/en')).default;
    const fr = (await import('@/locales/fr')).default;
    const es = (await import('@/locales/es')).default;
    for (const dictionary of [en, fr, es]) {
      const message = dictionary['current.locationDeniedAndroid'];
      expect(message).toContain('{place}');
      expect(message).not.toContain('latitude');
      expect(message).not.toContain('longitude');
      expect(dictionary['current.locationRetry'].length).toBeGreaterThan(0);
    }
    expect(en['current.locationDeniedAndroid']).toContain('Android Settings');
  });

  it('never asks for high-accuracy or fine location', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('enableHighAccuracy: false');
    expect(app).not.toContain('enableHighAccuracy: true');
    expect(app).not.toContain('ACCESS_FINE_LOCATION');
  });
});
