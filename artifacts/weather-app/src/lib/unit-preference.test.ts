import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_UNIT,
  UNIT_STORAGE_KEY,
  readStoredUnit,
  resolveStoredUnit,
  storeUnit,
  unitToStorageValue,
} from './unit-preference';

afterEach(() => vi.unstubAllGlobals());

describe('temperature unit storage contract', () => {
  it('uses the committed key and only the C/F tokens', () => {
    expect(UNIT_STORAGE_KEY).toBe('daymark.unit');
    expect(unitToStorageValue('celsius')).toBe('C');
    expect(unitToStorageValue('fahrenheit')).toBe('F');
  });

  it('defaults to Celsius when no preference is stored', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    expect(readStoredUnit()).toBe('celsius');
    expect(DEFAULT_UNIT).toBe('celsius');
  });

  it('restores both accepted values', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'C'), setItem: vi.fn() });
    expect(readStoredUnit()).toBe('celsius');
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'F'), setItem: vi.fn() });
    expect(readStoredUnit()).toBe('fahrenheit');
  });

  it('treats any other stored value as Celsius', () => {
    for (const invalid of ['fahrenheit', 'F ', 'c', 'kelvin', '', '0', '{"unit":"F"}']) {
      expect(resolveStoredUnit(invalid)).toBe('celsius');
    }
    expect(resolveStoredUnit(undefined)).toBe('celsius');
    expect(resolveStoredUnit(null)).toBe('celsius');
  });

  it('writes only the chosen token under daymark.unit', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
    storeUnit('fahrenheit');
    storeUnit('celsius');
    expect(setItem).toHaveBeenNthCalledWith(1, 'daymark.unit', 'F');
    expect(setItem).toHaveBeenNthCalledWith(2, 'daymark.unit', 'C');
  });

  it('does not crash when storage is unavailable or throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    });
    expect(readStoredUnit()).toBe('celsius');
    expect(() => storeUnit('fahrenheit')).not.toThrow();
  });

  it('falls back to Celsius when localStorage does not exist at all', () => {
    expect(readStoredUnit()).toBe('celsius');
    expect(() => storeUnit('fahrenheit')).not.toThrow();
  });
});
