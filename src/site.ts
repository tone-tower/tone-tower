import type { LanguageProfile, ExerciseConfig, ExerciseRow, Recording } from './types.ts';
import { languages } from './languages/profiles.ts';
export const site = {
  siteUrl: 'https://tonetower.github.io/',
  repository: 'https://github.com/tonetower/tonetower.github.io',
};
export function languagePages(
  profile: LanguageProfile,
): Record<string, { path: string; title: string; description: string }> {
  const root = profile.slug + '/',
    copy = profile.copy ?? {};
  return {
    home: {
      path: root,
      title:
        copy.homeTitle ?? 'Tone Tower · ' + profile.label + ' ' + profile.romanization + ' games',
      description:
        copy.homeDescription ??
        'Practise ' +
          profile.label +
          ' tones and ' +
          profile.romanization +
          ' spelling with recordings in Tone Tower, Skyrail and focused exercises.',
    },
    sounds: {
      path: root + 'guide/',
      title:
        (profile.guideName ?? profile.romanization + ' guide') +
        ' · ' +
        profile.label +
        ' Tone Tower',
      description:
        copy.guideDescription ??
        'Learn ' +
          profile.label +
          ' sounds, tones, and ' +
          profile.romanization +
          ' spelling with playable pronunciation examples.',
    },
    practice: {
      path: root + 'practice/',
      title: 'Practice · ' + profile.label + ' Tone Tower',
      description:
        copy.practiceDescription ??
        'Practise ' +
          profile.label +
          ' tones and ' +
          profile.romanization +
          ' spelling at your own pace, without a timer or lives.',
    },
    about: {
      path: root + 'about/',
      title: 'About · ' + profile.label + ' Tone Tower',
      description:
        'Practise ' +
        (profile.id === 'vi' ? profile.label : profile.romanization) +
        ' with Tone Tower. Explore the games, recordings, and open-source project.',
    },
  };
}
export const pages = Object.fromEntries(
  Object.values(languages).flatMap((profile) =>
    Object.entries(languagePages(profile)).map(([page, metadata]) => [
      profile.id + ':' + page,
      { ...metadata, page, language: profile.id },
    ]),
  ),
);
export function pageFromLocation(url: URL, base: URL, profile: LanguageProfile) {
  const relative = url.pathname.startsWith(base.pathname)
    ? url.pathname.slice(base.pathname.length).replace(/index\.html$/, '')
    : '';
  return (
    Object.keys(languagePages(profile)).find(
      (key) => languagePages(profile)[key].path === relative,
    ) ?? 'home'
  );
}
