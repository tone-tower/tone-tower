import type { Transcription, SpellingFocus } from '../types.ts';
const normalizeAnswer = (value: unknown, full = false) =>
  String(value ?? '')
    .replace(/[–—]/g, '-')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(full ? /$^/g : /[1-6]/g, '');

export function practiceSpelling(transcription: string, focus: SpellingFocus = 'full') {
  const tone = transcription.match(/[1-6]$/)?.[0] || '';
  const letters = transcription.replace(/[1-6]$/, '');
  const initial = /^(?:m|ng)$/.test(letters)
    ? ''
    : letters.match(/^(gw|kw|ng|[bpmfdtnlgkhwzcsj])/)?.[0] || '';
  return (
    (focus === 'initials'
      ? initial || '-'
      : focus === 'finals'
        ? letters.slice(initial.length)
        : letters) + tone
  );
}

export const jyutping: Transcription = {
  normalizeAnswer,
  evaluate(value, expected, full = false) {
    const actual = Array.isArray(value) ? value.join(' ') : String(value ?? '');
    if (!actual.trim()) return null;
    return normalizeAnswer(actual, full) === normalizeAnswer(expected.join(' '), full);
  },
  practiceSpelling,
  format: (value) => value,
  withoutTones: (value) => value.replace(/[1-6]/g, ''),
};
