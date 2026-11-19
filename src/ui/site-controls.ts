import type { LanguageProfile } from '../types.ts';
import { escape } from './dom.ts';

export function languageSwitcherMarkup(
  profile: LanguageProfile,
  choices: readonly { profile: LanguageProfile; path: string }[],
): string {
  return `<details class="language-switcher">
    <summary aria-label="Language: ${escape(profile.label)}">
      <svg class="language-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>
      <span>${escape(profile.label)}</span>
      <svg class="language-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </summary>
    <div class="language-panel">
      <span class="language-menu-label">Language</span>
      <nav class="language-options" aria-label="Choose a language">${choices.map((choice) => `<a data-language-link="${escape(choice.profile.id)}" href="${escape(choice.path)}" ${choice.profile.id === profile.id ? 'aria-current="true"' : ''}><span>${escape(choice.profile.label)}</span>${choice.profile.id === profile.id ? '<span class="language-check" aria-hidden="true">✓</span>' : ''}</a>`).join('')}</nav>
    </div>
  </details>`;
}

export function bindLanguageSwitcher(doc: Document): void {
  const switcher = doc.querySelector<HTMLDetailsElement>('.language-switcher');
  if (!switcher) return;
  doc.addEventListener('click', (event) => {
    if (event.target instanceof Node && !switcher.contains(event.target)) switcher.open = false;
  });
  doc.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !switcher.open) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      switcher.open = false;
      switcher.querySelector('summary')?.focus();
    },
    { capture: true },
  );
}

export function scriptSettingMarkup(profile: LanguageProfile): string {
  if (profile.scripts.length < 2) return '';
  return /* HTML */ `<fieldset id="script-display" class="script-setting">
    <legend class="sr-only">Character style</legend>
    ${profile.scripts
      .map((script) => {
        const label =
          script === 'simplified'
            ? 'Simplified'
            : script === 'traditional'
              ? 'Traditional'
              : (profile.scriptLabels[script] ?? script);
        return /* HTML */ `<label class="script-option">
          <input
            type="radio"
            name="character-style"
            data-script-option
            value="${escape(script)}"
            ${script === profile.defaultScript ? 'checked' : ''}
          />
          <span>${escape(label)}</span>
        </label>`;
      })
      .join('')}
  </fieldset>`;
}
