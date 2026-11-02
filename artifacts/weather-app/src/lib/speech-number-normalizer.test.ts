import { describe, expect, it } from 'vitest';

import { normalizeNarrationText } from './speech-number-normalizer';

describe('normalizeNarrationText', () => {
  it('leaves English narration unchanged', () => {
    const text = 'It is 12 degrees with 25 km/h wind, 15 mph gusts and 70% humidity at 17:00.';
    expect(normalizeNarrationText(text, 'en-GB')).toBe(text);
  });

  it('normalises French temperatures, negatives, compounds and units', () => {
    expect(normalizeNarrationText('Il fait 12 degrés.', 'fr-FR')).toBe('Il fait douze degrés.');
    expect(normalizeNarrationText('Il fait -3 degrés.', 'fr-FR')).toBe('Il fait moins trois degrés.');
    expect(normalizeNarrationText('Le vent souffle à 25 km/h.', 'fr-FR')).toBe(
      'Le vent souffle à vingt-cinq kilomètres par heure.',
    );
    expect(normalizeNarrationText('Les rafales atteignent 15 mph.', 'fr-FR')).toBe(
      'Les rafales atteignent quinze miles par heure.',
    );
    expect(normalizeNarrationText('L’humidité est de 70 %.', 'fr-FR')).toBe(
      'L’humidité est de soixante-dix pour cent.',
    );
    expect(normalizeNarrationText('Il fait 12,5 degrés.', 'fr-FR')).toBe('Il fait douze virgule cinq degrés.');
  });

  it('normalises Spanish temperatures, negatives, compounds and units', () => {
    expect(normalizeNarrationText('Hace 12 grados.', 'es-419')).toBe('Hace doce grados.');
    expect(normalizeNarrationText('Hace -3 grados.', 'es-419')).toBe('Hace menos tres grados.');
    expect(normalizeNarrationText('El viento sopla a 25 km/h.', 'es-419')).toBe(
      'El viento sopla a veinticinco kilómetros por hora.',
    );
    expect(normalizeNarrationText('Las rachas alcanzan 15 mph.', 'es-419')).toBe(
      'Las rachas alcanzan quince millas por hora.',
    );
    expect(normalizeNarrationText('La humedad es del 70 %.', 'es-419')).toBe(
      'La humedad es del setenta por ciento.',
    );
    expect(normalizeNarrationText('Hace 12,5 grados.', 'es-419')).toBe('Hace doce coma cinco grados.');
  });

  it('uses 24-hour French time expressions', () => {
    expect(normalizeNarrationText('00:00, 12:00, 17:00.', 'fr-FR')).toBe(
      'minuit, midi, dix-sept heures.',
    );
    expect(normalizeNarrationText('17:30.', 'fr-FR')).toBe('dix-sept heures trente.');
  });

  it('uses natural Latin American Spanish 12-hour time expressions', () => {
    expect(normalizeNarrationText('00:00, 12:00, 17:00.', 'es-419')).toBe(
      'medianoche, mediodía, las cinco de la tarde.',
    );
    expect(normalizeNarrationText('17:30.', 'es-419')).toBe('las cinco y media de la tarde.');
  });

  it('handles French compound-number boundaries', () => {
    expect(normalizeNarrationText('21, 71, 80, 81, 90', 'fr-FR')).toBe(
      'vingt et un, soixante et onze, quatre-vingts, quatre-vingt-un, quatre-vingt-dix',
    );
  });

  it('handles Spanish compound-number boundaries', () => {
    expect(normalizeNarrationText('21, 25, 100, 101', 'es-419')).toBe(
      'veintiuno, veinticinco, cien, ciento uno',
    );
  });

  it('does not guess an ambiguous numeric date without source context', () => {
    expect(normalizeNarrationText('Le 12/05/2025 et le 2025-05-12.', 'fr-FR')).toBe(
      'Le 12/05/2025 et le 2025-05-12.',
    );
    expect(normalizeNarrationText('El 12/05/2025.', 'es-419')).toBe('El 12/05/2025.');
  });

  it('expands dates only when the source format is explicit', () => {
    expect(normalizeNarrationText('Le 12/05/2025.', 'fr-FR', { dateFormat: 'DMY' })).toBe(
      'Le douze mai deux mille vingt-cinq.',
    );
    expect(normalizeNarrationText('Le 05/12/2025.', 'fr-FR', { dateFormat: 'MDY' })).toBe(
      'Le douze mai deux mille vingt-cinq.',
    );
    expect(normalizeNarrationText('Le 05/12/2025.', 'fr-FR', { dateFormat: 'DMY' })).toBe(
      'Le cinq décembre deux mille vingt-cinq.',
    );
    expect(normalizeNarrationText('El 2025-05-12.', 'es-419', { dateFormat: 'YMD' })).toBe(
      'El doce de mayo de dos mil veinticinco.',
    );
  });

  it('preserves punctuation and sentence boundaries', () => {
    expect(normalizeNarrationText('Il fait 12 degrés. Il pleut.', 'fr-FR')).toBe(
      'Il fait douze degrés. Il pleut.',
    );
    expect(normalizeNarrationText('Hace 12 grados. Llueve.', 'es-419')).toBe(
      'Hace doce grados. Llueve.',
    );
  });

  it('leaves abbreviated weather terms intact while expanding attached values', () => {
    expect(normalizeNarrationText('AQI 33, UV 5, approx. 5 mm.', 'es-419')).toBe(
      'AQI treinta y tres, UV cinco, approx. cinco mm.',
    );
    expect(normalizeNarrationText('AQI 33, UV 5, approx. 5 mm.', 'fr-FR')).toBe(
      'AQI trente-trois, UV cinq, approx. cinq mm.',
    );
  });

  it('does not invent a fallback for unsupported locales', () => {
    const text = 'Es sind 12 Grad.';
    expect(normalizeNarrationText(text, 'de-DE')).toBe(text);
  });
});
