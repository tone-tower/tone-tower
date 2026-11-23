import type { LanguageProfile } from '../types.ts';
import { escape, required } from './dom.ts';

export function bindHeaderMenu(header: HTMLElement) {
  const menu = required(header, '#site-menu');
  const navigation = required(header, '#main-navigation');
  const doc = header.ownerDocument;
  const narrow = window.matchMedia('(max-width: 700px)');
  const open = () => menu.getAttribute('aria-expanded') === 'true';

  function setOpen(expanded: boolean) {
    menu.setAttribute('aria-expanded', String(expanded));
    navigation.hidden = narrow.matches && !expanded;
  }

  function sync() {
    const focus = doc.activeElement;
    menu.hidden = !narrow.matches;
    header.toggleAttribute('data-menu', narrow.matches);
    setOpen(false);
    if (narrow.matches && navigation.contains(focus)) menu.focus();
    else if (!narrow.matches && focus === menu) navigation.querySelector('a')?.focus();
  }

  menu.addEventListener('click', () => setOpen(!open()));
  doc.addEventListener('pointerdown', (event) => {
    if (
      open() &&
      event.target instanceof Node &&
      !menu.contains(event.target) &&
      !navigation.contains(event.target)
    )
      setOpen(false);
  });
  doc.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !open()) return;
      event.preventDefault();
      setOpen(false);
      menu.focus({ preventScroll: true });
    },
    true,
  );
  narrow.addEventListener('change', sync);
  sync();
  return () => setOpen(false);
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
