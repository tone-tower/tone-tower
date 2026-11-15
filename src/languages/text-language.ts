import type { LanguageProfile } from '../types.ts';
export function textLanguage(profile: LanguageProfile, script: string): string {
  return profile.textLanguages[script] ?? profile.id;
}
