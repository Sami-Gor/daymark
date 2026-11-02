/*
 * Narration-only number, time, unit and date normalisation.
 *
 * The Android Kokoro G2P candidate does not read digits, so numeric weather
 * values must be expanded before phonemisation. English is deliberately left
 * byte-for-byte unchanged; the existing English Misaki path already handles
 * its own text.
 *
 * Numeric dates are intentionally not guessed. A caller that knows the source
 * format must pass `dateFormat`; without it, date-like strings are protected
 * from generic number expansion and preserved verbatim.
 *
 * This module is pure and independent of React, the native bridge and weather
 * intent generation. It only changes the text given to narration.
 */

const FRENCH_UNITS = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
  'dix-sept',
  'dix-huit',
  'dix-neuf',
];

const SPANISH_UNITS = [
  'cero',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
];

const SPANISH_TEENS = [
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
];

const SPANISH_TWENTIES = [
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
];

const SPANISH_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

const SPANISH_HUNDREDS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
];

const FRENCH_MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const NARRATION_NORMALIZATION_VERSION = 1;

export type NarrationDateFormat = 'DMY' | 'MDY' | 'YMD';

export type NarrationNormalizationOptions = {
  /**
   * Only set this when the source context establishes the numeric date order.
   * Without it, date-like strings are preserved rather than guessed.
   */
  dateFormat?: NarrationDateFormat;
};

function frenchBelow100(value: number): string {
  if (value < 20) return FRENCH_UNITS[value];
  if (value < 70) {
    const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][Math.floor(value / 10)];
    const unit = value % 10;
    if (unit === 0) return tens;
    if (unit === 1) return `${tens} et un`;
    return `${tens}-${FRENCH_UNITS[unit]}`;
  }
  if (value < 80) {
    if (value === 71) return 'soixante et onze';
    return `soixante-${FRENCH_UNITS[value - 60]}`;
  }
  if (value === 80) return 'quatre-vingts';
  return `quatre-vingt-${frenchBelow100(value - 80)}`;
}

function frenchInteger(value: number): string {
  if (value < 100) return frenchBelow100(value);
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    const prefix = hundreds === 1 ? 'cent' : `${FRENCH_UNITS[hundreds]} cent${remainder === 0 ? 's' : ''}`;
    return remainder === 0 ? prefix : `${prefix} ${frenchBelow100(remainder)}`;
  }
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1000);
    const remainder = value % 1000;
    const prefix = thousands === 1 ? 'mille' : `${frenchInteger(thousands)} mille`;
    return remainder === 0 ? prefix : `${prefix} ${frenchInteger(remainder)}`;
  }
  const millions = Math.floor(value / 1_000_000);
  const remainder = value % 1_000_000;
  const prefix = millions === 1 ? 'un million' : `${frenchInteger(millions)} millions`;
  return remainder === 0 ? prefix : `${prefix} ${frenchInteger(remainder)}`;
}

function spanishBelow100(value: number): string {
  if (value < 16) return SPANISH_UNITS[value];
  if (value < 20) return SPANISH_TEENS[value - 16];
  if (value < 30) return SPANISH_TWENTIES[value - 20];
  const tens = SPANISH_TENS[Math.floor(value / 10)];
  const unit = value % 10;
  return unit === 0 ? tens : `${tens} y ${SPANISH_UNITS[unit]}`;
}

function spanishInteger(value: number): string {
  if (value < 100) return spanishBelow100(value);
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    if (value === 100) return 'cien';
    const prefix = SPANISH_HUNDREDS[hundreds];
    return remainder === 0 ? prefix : `${prefix} ${spanishBelow100(remainder)}`;
  }
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1000);
    const remainder = value % 1000;
    const prefix = thousands === 1 ? 'mil' : `${spanishInteger(thousands)} mil`;
    return remainder === 0 ? prefix : `${prefix} ${spanishInteger(remainder)}`;
  }
  const millions = Math.floor(value / 1_000_000);
  const remainder = value % 1_000_000;
  const prefix = millions === 1 ? 'un millón' : `${spanishInteger(millions)} millones`;
  return remainder === 0 ? prefix : `${prefix} ${spanishInteger(remainder)}`;
}

function decimalWords(locale: 'fr' | 'es', raw: string): string {
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const separator = unsigned.includes(',') ? ',' : '.';
  const [wholeText, fractionText = ''] = unsigned.split(separator);
  const whole = Number.parseInt(wholeText, 10);
  const words = locale === 'fr' ? frenchInteger(whole) : spanishInteger(whole);
  const fraction = fractionText
    ? fractionText
        .split('')
        .map((digit) => (locale === 'fr' ? FRENCH_UNITS[Number(digit)] : SPANISH_UNITS[Number(digit)]))
        .join(' ')
    : '';
  const decimalMark = locale === 'fr' ? 'virgule' : 'coma';
  const result = fraction ? `${words} ${decimalMark} ${fraction}` : words;
  return negative ? `${locale === 'fr' ? 'moins' : 'menos'} ${result}` : result;
}

function frenchTime(hour: number, minute: number): string {
  if (hour === 0 && minute === 0) return 'minuit';
  if (hour === 12 && minute === 0) return 'midi';
  const hourText = hour === 1 ? 'une heure' : `${frenchInteger(hour)} heures`;
  return minute === 0 ? hourText : `${hourText} ${frenchInteger(minute)}`;
}

function spanishPeriod(hour: number): string {
  if (hour < 6) return 'de la madrugada';
  if (hour < 12) return 'de la mañana';
  if (hour < 13) return 'del mediodía';
  if (hour < 20) return 'de la tarde';
  return 'de la noche';
}

function spanishClock(hour12: number): string {
  return hour12 === 1 ? 'la una' : `las ${spanishInteger(hour12)}`;
}

function spanishTime(hour: number, minute: number): string {
  if (hour === 0 && minute === 0) return 'medianoche';
  if (hour === 12 && minute === 0) return 'mediodía';

  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const period = spanishPeriod(hour);
  if (minute === 0) return `${spanishClock(hour12)} ${period}`;
  if (minute === 15) return `${spanishClock(hour12)} y cuarto ${period}`;
  if (minute === 30) return `${spanishClock(hour12)} y media ${period}`;
  if (minute === 45) {
    const nextHour = hour12 === 12 ? 1 : hour12 + 1;
    return `${spanishClock(nextHour)} menos cuarto ${period}`;
  }
  if (minute < 30) return `${spanishClock(hour12)} y ${spanishInteger(minute)} ${period}`;
  const nextHour = hour12 === 12 ? 1 : hour12 + 1;
  return `${spanishClock(nextHour)} menos ${spanishInteger(60 - minute)} ${period}`;
}

function dateWords(locale: 'fr' | 'es', parts: [number, number, number], format: NarrationDateFormat): string | null {
  let day: number;
  let month: number;
  let year: number;
  if (format === 'DMY') {
    [day, month, year] = parts;
  } else if (format === 'MDY') {
    [month, day, year] = parts;
  } else {
    [year, month, day] = parts;
  }
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    year < 1
  ) {
    return null;
  }
  if (locale === 'fr') {
    const dayText = day === 1 ? 'premier' : frenchInteger(day);
    return `${dayText} ${FRENCH_MONTHS[month - 1]} ${frenchInteger(year)}`;
  }
  const dayText = day === 1 ? 'primero' : spanishInteger(day);
  return `${dayText} de ${SPANISH_MONTHS[month - 1]} de ${spanishInteger(year)}`;
}

function protectDates(
  text: string,
  locale: 'fr' | 'es',
  dateFormat: NarrationDateFormat | undefined,
  protectedDates: string[],
): string {
  return text.replace(/(?<!\d)(\d{1,4})([./-])(\d{1,2})\2(\d{1,4})(?!\d)/g, (raw, first, _sep, second, third) => {
    if (dateFormat) {
      const parsed = dateWords(locale, [Number(first), Number(second), Number(third)], dateFormat);
      if (parsed) return parsed;
    }
    // Preserve without guessing. The placeholder contains no digits, so the
    // generic number pass cannot partially expand an ambiguous date.
    const index = protectedDates.push(raw) - 1;
    return `\uE000${String.fromCharCode(0xE100 + index)}\uE001`;
  });
}

export function normalizeNarrationText(
  text: string,
  lang?: string,
  options: NarrationNormalizationOptions = {},
): string {
  if (!text) return text;
  const base = (lang ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (base !== 'fr' && base !== 'es') return text;

  const locale = base;
  const protectedDates: string[] = [];
  let result = protectDates(text, locale, options.dateFormat, protectedDates);

  result = result.replace(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g, (_raw, hourText, minuteText) => {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    return locale === 'fr' ? frenchTime(hour, minute) : spanishTime(hour, minute);
  });

  result = result
    .replace(/\s*\bkm\s*\/\s*h\b/gi, locale === 'fr' ? ' kilomètres par heure' : ' kilómetros por hora')
    .replace(/\s*\bmph\b/gi, locale === 'fr' ? ' miles par heure' : ' millas por hora')
    .replace(/\s*%/g, locale === 'fr' ? ' pour cent' : ' por ciento');

  result = result.replace(/(?<![\w])-?\d+(?:[.,]\d+)?(?![\w])/g, (raw) => decimalWords(locale, raw));

  for (let i = 0; i < protectedDates.length; i += 1) {
    const placeholder = `\uE000${String.fromCharCode(0xE100 + i)}\uE001`;
    result = result.replace(placeholder, protectedDates[i]);
  }
  return result;
}
