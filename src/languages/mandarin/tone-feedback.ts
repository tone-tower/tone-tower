import type { Syllable } from '../../types.ts';
import { formatPinyin, parsePinyin } from '../pinyin.ts';

export function mandarinToneFeedback(syllables: readonly Syllable[]): string {
  const changed = syllables.some(
    (s) => s.dictionaryTone !== undefined && s.dictionaryTone !== s.tone,
  );
  const notes: string[] = [];
  if (changed) {
    const written = formatPinyin(syllables.map((s) => s.transcription).join(' '));
    const spoken = syllables
      .map((s) => {
        const base = parsePinyin(s.transcription)?.[0]?.base;
        return base ? formatPinyin(base + s.tone) : s.transcription;
      })
      .join(' ');
    notes.push(`Written ${written}; listening answer ${spoken}.`);
    if (
      syllables.some(
        (s, i) => s.dictionaryTone === 3 && s.tone === 2 && syllables[i + 1]?.dictionaryTone === 3,
      )
    )
      notes.push('A third tone changes before another third tone.');
    notes.push('Skyrail uses the dictionary spelling.');
  }
  if (syllables.some((s) => s.tone === 5))
    notes.push('Neutral syllables are short and unstressed; their pitch depends on context.');
  return notes.join(' ');
}
