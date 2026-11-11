import type { Unit } from '@/lib/weather';

/*
 * Persistent temperature-unit display preference.
 *
 * Mirrors the language preference in lib/i18n.ts: a non-sensitive display
 * setting stored in web/PWA localStorage as 'C' or 'F' under `daymark.unit`.
 * Nothing else is written. When storage is unavailable, throws, or holds an
 * unexpected value, the app falls back to Celsius. Location, search queries,
 * weather payloads and transcripts are never stored here.
 */
export const UNIT_STORAGE_KEY = 'daymark.unit';
export const DEFAULT_UNIT: Unit = 'celsius';

export type StoredUnit = 'C' | 'F';

/* Only the two committed tokens are accepted; anything else means Celsius. */
export function resolveStoredUnit(value: string | null | undefined): Unit {
  return value === 'F' ? 'fahrenheit' : DEFAULT_UNIT;
}

export function unitToStorageValue(unit: Unit): StoredUnit {
  return unit === 'fahrenheit' ? 'F' : 'C';
}

export function readStoredUnit(): Unit {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_UNIT;
    return resolveStoredUnit(localStorage.getItem(UNIT_STORAGE_KEY));
  } catch {
    return DEFAULT_UNIT;
  }
}

export function storeUnit(unit: Unit): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(UNIT_STORAGE_KEY, unitToStorageValue(unit));
    }
  } catch {
    // Display preference only — ignore storage failures (private mode, etc.).
  }
}
