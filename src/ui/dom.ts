// Selector types describe markup owned by the application and game view.
export type TypingInput = HTMLInputElement & { composing?: boolean };
export type SelectorElement<S extends string> = S extends '#transcription-answer'
  ? TypingInput
  : S extends '#credit-search'
    ? HTMLInputElement
    : S extends '#script-display'
      ? HTMLSelectElement
      : S extends '.world-canvas' | '.map-canvas'
        ? HTMLCanvasElement
        : S extends '#typed-form'
          ? HTMLFormElement
          : S extends '#dialog'
            ? HTMLDialogElement
            : S extends '.brand' | '.skip-link' | 'a[href]' | '[data-nav-page]'
              ? HTMLAnchorElement
              : S extends 'link[rel="canonical"]'
                ? HTMLLinkElement
                : S extends 'meta[property="og:url"]'
                  ? HTMLMetaElement
                  : S extends '[data-practice-setting]'
                    ? HTMLInputElement | HTMLSelectElement
                    : S extends
                          | '#check-answer'
                          | '#reveal-answer'
                          | '#start-adventure'
                          | '#retry-run'
                          | '#resume-game'
                          | '#continue-game'
                          | '#credits-prev'
                          | '#credits-next'
                          | '[data-tone]'
                          | '[data-insert]'
                          | '[data-variant]'
                          | '[data-difficulty]'
                          | '[data-practice-tone]'
                          | '[data-guide-tone],[data-guide-word]'
                          | '[data-start-world]'
                          | '[data-info-action]'
                      ? HTMLButtonElement
                      : HTMLElement;
export function query<S extends string>(root: ParentNode, selector: S): SelectorElement<S> | null {
  return root.querySelector<SelectorElement<S>>(selector);
}
export function queryAll<S extends string>(root: ParentNode, selector: S): SelectorElement<S>[] {
  return Array.from(root.querySelectorAll<SelectorElement<S>>(selector));
}
export function required<S extends string>(root: ParentNode, selector: S): SelectorElement<S> {
  const element = query(root, selector);
  if (!element) throw Error('Missing UI element: ' + selector);
  return element;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function escape(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
