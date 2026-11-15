import type { LanguageProfile } from '../types.ts';
import { cantonese } from './cantonese/profile.ts';
import { vietnamese } from './vietnamese/profile.ts';
import { mandarin } from './mandarin/profile.ts';

export { cantonese, mandarin, vietnamese };

export const languages: Readonly<Record<string, LanguageProfile>> = Object.freeze({
  [cantonese.id]: cantonese,
  [mandarin.id]: mandarin,
  [vietnamese.id]: vietnamese,
});
