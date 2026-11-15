import type { Transcription } from '../types.ts';
// Chữ Quốc ngữ writes the tone on the syllable itself: one of five marks, or none.
export type VietnameseTone = 'sắc' | 'huyền' | 'hỏi' | 'ngã' | 'nặng' | 'ngang';
const marks: Readonly<Record<string, VietnameseTone>> = {
  '́': 'sắc',
  '̀': 'huyền',
  '̉': 'hỏi',
  '̃': 'ngã',
  '̣': 'nặng',
};
const vowels = 'aăâeêioôơuưy';
const lower = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

export function splitTone(value: unknown): { base: string; tone: VietnameseTone } | null {
  let tone: VietnameseTone = 'ngang';
  let base = '';
  for (const ch of lower(value).normalize('NFD')) {
    if (!marks[ch]) base += ch;
    else if (tone !== 'ngang') return null;
    else tone = marks[ch];
  }
  base = base.normalize('NFC');
  return base && !/[^a-zăâêôơưđ]/.test(base) ? { base, tone } : null;
}

// A syllable has one run of vowels, which sets it apart from a borrowed word in an
// English meaning, such as attaché.
const syllable = new RegExp('^[^' + vowels + ']*[' + vowels + ']+[^' + vowels + ']*$');
const toneMarks = new RegExp('[' + Object.keys(marks).join('') + ']', 'g');

// The letter that carries the mark depends only on the toneless spelling, so a
// cover placed there never hints at the answer.
export function toneCarrier(base: string): number {
  const letters = [...base],
    vowel = (i: number) => i < letters.length && vowels.includes(letters[i]);
  let start = letters.findIndex((_, i) => vowel(i));
  if (start < 0) return -1;
  // qu and gi are onsets when another vowel follows: quả, già.
  if (vowel(start + 1) && ['qu', 'gi'].includes(letters.slice(start - 1, start + 1).join('')))
    start++;
  let end = start;
  while (vowel(end)) end++;
  // A letter with its own diacritic takes the mark; the last one wins: ươ → ơ.
  for (let i = end - 1; i >= start; i--) if ('ăâêôơư'.includes(letters[i])) return i;
  // Before a final consonant the last vowel takes it: toán. Otherwise the first of two
  // and the middle of three: mái, ngoài. Open oa, oe and uy follow the traditional
  // placement used by the word list: hòa, khỏe, thủy.
  if (end < letters.length) return end - 1;
  return end - start === 3 ? start + 1 : start;
}

const compare = (value: unknown, full: boolean) => {
  const parts = lower(value).split(/\s+/).filter(Boolean).map(splitTone);
  return parts.length && parts.every((part) => part !== null)
    ? parts.map((part) => part.base + (full ? ' ' + part.tone : '')).join('|')
    : null;
};

export const quocNgu: Transcription & {
  splitTone: typeof splitTone;
  toneCarrier: typeof toneCarrier;
  concealTone: (text: string) => { base: string; index: number } | null;
  concealMeaning: (text: string) => string;
} = {
  splitTone,
  toneCarrier,
  format: (value) => value,
  withoutTones: (value) =>
    lower(value)
      .split(/\s+/)
      .map((part) => splitTone(part)?.base ?? part)
      .join(' '),
  practiceSpelling: (value) => value,
  normalizeAnswer: (value, full = false) => compare(value, full),
  evaluate(value, expected, full = false) {
    const actual = Array.isArray(value) ? value.join(' ') : String(value ?? '');
    if (!actual.trim()) return null;
    const answer = compare(actual, full);
    return answer !== null && answer === compare(expected.join(' '), full);
  },
  // The written syllable is shown without its tone until the answer is known.
  concealTone(text) {
    const parts = lower(text).split(/\s+/).map(splitTone);
    if (parts.length !== 1 || !parts[0]) return null;
    const { base } = parts[0],
      index = toneCarrier(base);
    return index < 0 ? null : { base, index };
  },
  // A meaning may quote Vietnamese: a phrase the word belongs to, or another spelling
  // of it. Those syllables lose their tones too, and keep their capitals.
  concealMeaning: (text) =>
    String(text ?? '')
      .normalize('NFC')
      .replace(/\p{L}+/gu, (word) => {
        const parts = splitTone(word);
        return parts && parts.tone !== 'ngang' && syllable.test(parts.base)
          ? word.normalize('NFD').replace(toneMarks, '').normalize('NFC')
          : word;
      }),
};
