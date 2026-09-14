import { describe, expect, it } from 'vitest';

import { resolveDeepLink } from './deep-links';

describe('resolveDeepLink', () => {
  it('accepts Daymark app links and returns the local path', () => {
    expect(resolveDeepLink('https://daymark-weather.pages.dev/privacy')).toBe('/privacy');
    expect(resolveDeepLink('https://daymark-weather.pages.dev/fr/privacy?x=1')).toBe('/fr/privacy?x=1');
  });

  it('ignores the start URL', () => {
    expect(resolveDeepLink('https://daymark-weather.pages.dev/')).toBeNull();
  });

  it('rejects other hosts', () => {
    expect(resolveDeepLink('https://evil.example.com/privacy')).toBeNull();
    expect(resolveDeepLink('https://daymark-weather.pages.dev.evil.com/privacy')).toBeNull();
  });

  it('rejects malformed and empty input', () => {
    expect(resolveDeepLink(undefined)).toBeNull();
    expect(resolveDeepLink('')).toBeNull();
    expect(resolveDeepLink('not a url')).toBeNull();
  });
});
