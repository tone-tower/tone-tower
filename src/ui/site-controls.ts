import type { LanguageProfile } from '../types.ts';
import { escape } from './dom.ts';

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
        const symbol = script === 'simplified' ? '简' : script === 'traditional' ? '繁' : label;
        return /* HTML */ `<label class="script-option" title="${escape(label)} characters">
          <input
            type="radio"
            name="character-style"
            data-script-option
            aria-label="${escape(label)}"
            value="${escape(script)}"
            ${script === profile.defaultScript ? 'checked' : ''}
          />
          <span aria-hidden="true">${escape(symbol)}</span>
        </label>`;
      })
      .join('')}
  </fieldset>`;
}
