/*
 * Language propagation for Ask Daymark: the JS side must send a supported tag
 * and never fall back to English, and a French/Spanish transcript must reach
 * the same intent layer the UI uses.
 */
import { describe, expect, it } from 'vitest';
import { normalizeRecognitionLanguage } from './voice-input-native';
import { DAYMARK_INTENTS, resolveIntentTranscripts } from './weather-intents';

describe('recognition language propagation', () => {
  it('maps each supported interface locale to a BCP-47 tag', () => {
    expect(normalizeRecognitionLanguage('en')).toBe('en-GB');
    expect(normalizeRecognitionLanguage('en-GB')).toBe('en-GB');
    expect(normalizeRecognitionLanguage('fr')).toBe('fr-FR');
    expect(normalizeRecognitionLanguage('fr-CA')).toBe('fr-FR');
    expect(normalizeRecognitionLanguage('es')).toBe('es-ES');
    expect(normalizeRecognitionLanguage('es-419')).toBe('es-ES');
  });

  it('returns null instead of defaulting to English', () => {
    expect(normalizeRecognitionLanguage(undefined)).toBeNull();
    expect(normalizeRecognitionLanguage('')).toBeNull();
    expect(normalizeRecognitionLanguage('de-DE')).toBeNull();
  });
});

describe('multilingual weather understanding', () => {
  it('understands a compound French question', () => {
    const intents = resolveIntentTranscripts("Est-ce qu'il va pleuvoir et quel est le vent aujourd'hui ?");
    expect(intents).toContain(DAYMARK_INTENTS.rain);
    expect(intents).toContain(DAYMARK_INTENTS.wind);
  });

  it('understands a compound Spanish question', () => {
    const intents = resolveIntentTranscripts('¿Va a llover y cuál es la temperatura y el viento?');
    expect(intents).toContain(DAYMARK_INTENTS.rain);
    expect(intents).toContain(DAYMARK_INTENTS.current);
    expect(intents).toContain(DAYMARK_INTENTS.wind);
  });

  it('understands French tomorrow and Spanish temperature alone', () => {
    expect(resolveIntentTranscripts('Quel temps fera-t-il demain ?')).toContain(DAYMARK_INTENTS.tomorrow);
    expect(resolveIntentTranscripts('¿Cuál es la temperatura?')).toContain(DAYMARK_INTENTS.current);
  });
});
