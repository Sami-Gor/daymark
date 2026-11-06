import { createHash } from 'node:crypto';

export function countWords(text: string): number {
  return text
    .normalize('NFC')
    .split(/\s+/u)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed
    .replace(/([.!?])([”"’)]*)\s+/gu, '$1$2\n')
    .split('\n')
    .filter((sentence) => sentence.trim().length > 0).length;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
