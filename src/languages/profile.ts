import type { LanguageProfile } from '../types.ts';

export function requireProfile(profile: LanguageProfile | undefined): LanguageProfile {
  if (
    !profile?.id ||
    !Array.isArray(profile.tones) ||
    !profile.tones.length ||
    typeof profile.evaluate !== 'function'
  )
    throw Error('An explicit language profile is required.');
  return profile;
}
