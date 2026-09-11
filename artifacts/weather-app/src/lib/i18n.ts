import en, { type TranslationKey } from '@/locales/en';
import fr from '@/locales/fr';
import es from '@/locales/es';

/*
 * Lightweight localization core: typed dictionaries, locale detection and a
 * plain `translate()` function with no framework dependency. The React binding
 * lives in hooks/use-locale.tsx.
 *
 * The only thing persisted is the language code (`daymark.locale`), which is a
 * non-sensitive display preference — never location, queries or identity.
 */

export type Locale = 'en' | 'fr' | 'es';

export const LOCALES: Locale[] = ['en', 'fr', 'es'];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'daymark.locale';

/* Language tag used for SpeechSynthesisUtterance.lang and recognition.lang. */
export const SPEECH_LANGS: Record<Locale, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
};

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, fr, es };

export function isLocale(value: string): value is Locale {
  return value === 'en' || value === 'fr' || value === 'es';
}

export function resolveLocale(value?: string | string[] | null): Locale {
  const raw = Array.isArray(value) ? value[0] : value;
  const base = (raw ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

/* en-* → English, fr-* → French, es-* → Spanish, anything else → English. */
export function detectLocale(language: string | undefined = typeof navigator !== 'undefined' ? navigator.language : undefined): Locale {
  return resolveLocale(language);
}

export function readStoredLocale(): Locale | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored ? resolveLocale(stored) : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Display preference only — ignore storage failures (private mode, etc.).
  }
}

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: TranslationKey, params?: TranslateParams) => string;

export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

export function translate(locale: Locale, key: TranslationKey, params?: TranslateParams): string {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return interpolate(dictionary[key] ?? en[key], params);
}

/* Locale-aware percentage from a 0–100 input. */
export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value / 100);
}

export function formatDecimal(value: number, locale: Locale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export type { TranslationKey };
