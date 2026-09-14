/*
 * TTS-only segmentation.
 *
 * Splits a spoken briefing into conservative natural chunks before it reaches
 * Kokoro. The concatenation of the segments is always identical to the input
 * text: characters are never dropped, added or reordered, and boundaries are
 * only placed after natural punctuation or before safe conjunctions.
 *
 * This module is deliberately independent from briefing generation: the
 * weather wording, the intent layer and `briefing.spokenText` are untouched.
 */

const MIN_FIRST = 20;
const FIRST_MAX = 70;
const MIN = 20;
const PREFERRED_MAX = 90;
const HARD_MAX = 140;

const SEGMENT_TARGETS = {
  MIN_FIRST,
  FIRST_MAX,
  MIN,
  PREFERRED_MAX,
  HARD_MAX,
} as const;

const TTS_ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'approx',
  'min',
  'max',
  'no',
  'fig',
  'al',
  'inc',
  'ltd',
  'st',
  'ave',
  'rd',
  'dept',
  'est',
  'a.m',
  'p.m',
  'cf',
  'ca',
  'vol',
  'sec',
]);

type Boundary = {
  /** Split point: segments are text.slice(0, index) and text.slice(index). */
  index: number;
  /** Lower is a stronger natural boundary (sentence < clause < conjunction). */
  priority: number;
};

function isDigit(value: string | undefined): boolean {
  return value !== undefined && value >= '0' && value <= '9';
}

function isSpace(value: string | undefined): boolean {
  return value !== undefined && /\s/.test(value);
}

function skipSpaces(text: string, index: number): number {
  let i = index;
  while (i < text.length && isSpace(text[i])) i += 1;
  return i;
}

function wordBefore(text: string, index: number): string {
  const match = /([A-Za-z.']+)$/.exec(text.slice(0, index));
  return match ? match[1] : '';
}

function isProtectedDot(text: string, index: number): boolean {
  const next = text[index + 1];
  const previous = text[index - 1];
  if (isDigit(previous) && isDigit(next)) {
    return true;
  }
  const word = wordBefore(text, index);
  if (!word) {
    return false;
  }
  if (TTS_ABBREVIATIONS.has(word.toLowerCase())) {
    return true;
  }
  return word.length === 1 && /[A-Z]/.test(word);
}

function findBoundaries(text: string): Boundary[] {
  const boundaries: Boundary[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '.' || char === '!' || char === '?' || char === '…') {
      if (char === '.' && isProtectedDot(text, i)) {
        continue;
      }
      let after = i + 1;
      while (after < text.length && /["')\]]/.test(text[after])) after += 1;
      if (after >= text.length || isSpace(text[after])) {
        boundaries.push({ index: skipSpaces(text, after), priority: 0 });
      }
      continue;
    }

    if (char === ';' || char === ':') {
      const isTime = char === ':' && isDigit(text[i - 1]) && isDigit(next);
      const isScheme = char === ':' && /https?$/i.test(text.slice(Math.max(0, i - 5), i));
      if (!isTime && !isScheme && isSpace(next)) {
        boundaries.push({ index: skipSpaces(text, i + 1), priority: 1 });
      }
      continue;
    }

    if (char === ',') {
      if (isSpace(next)) {
        boundaries.push({ index: skipSpaces(text, i + 1), priority: 2 });
      }
      continue;
    }

    if (char === '—' || char === '–') {
      const isRange = isDigit(text[i - 1]) && isDigit(next);
      if (!isRange) {
        boundaries.push({ index: skipSpaces(text, i + 1), priority: 3 });
      }
    }
  }

  const conjunction = /\s(and|but|while|although|because|so)\s/gi;
  let match: RegExpExecArray | null;
  while ((match = conjunction.exec(text)) !== null) {
    boundaries.push({ index: match.index, priority: 4 });
  }

  return boundaries.sort((a, b) => a.index - b.index);
}

function pickFirst(boundaries: Boundary[]): number | null {
  const eligible = boundaries.filter((b) => b.index >= MIN_FIRST && b.index <= FIRST_MAX);
  if (eligible.length > 0) {
    return eligible[0].index;
  }
  const wider = boundaries.filter((b) => b.index >= MIN_FIRST && b.index <= HARD_MAX);
  return wider.length > 0 ? wider[0].index : null;
}

function pickNext(boundaries: Boundary[]): number | null {
  const eligible = boundaries.filter((b) => b.index >= MIN && b.index <= PREFERRED_MAX);
  if (eligible.length > 0) {
    const bestPriority = Math.min(...eligible.map((b) => b.priority));
    const preferred = eligible.filter((b) => b.priority === bestPriority);
    return preferred[preferred.length - 1].index;
  }
  const wider = boundaries.filter((b) => b.index >= MIN && b.index <= HARD_MAX);
  return wider.length > 0 ? wider[0].index : null;
}

export function segmentForSpeech(text: string): string[] {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const segments: string[] = [];
  let remaining = text;
  let first = true;

  while (remaining.length > (first ? MIN_FIRST + MIN : PREFERRED_MAX)) {
    const chosen = first ? pickFirst(findBoundaries(remaining)) : pickNext(findBoundaries(remaining));
    if (chosen === null || remaining.length - chosen < MIN) {
      break;
    }
    segments.push(remaining.slice(0, chosen));
    remaining = remaining.slice(chosen);
    first = false;
  }

  if (remaining) {
    segments.push(remaining);
  }
  return segments.length > 1 ? segments : [text];
}
