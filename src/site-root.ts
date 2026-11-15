// Generated pages declare their distance from the deployment root. This survives bundling.
const roots = new WeakMap<Document, URL>();
export function siteRoot(document: Document = globalThis.document): URL {
  let root = roots.get(document);
  if (!root) {
    root = new URL(document.documentElement.dataset.siteRoot ?? './', document.URL);
    roots.set(document, root);
  }
  return new URL(root.href);
}
export function siteURL(relative: string, document: Document = globalThis.document): URL {
  return new URL(relative, siteRoot(document));
}
export function localizeAssets(container: ParentNode, base = siteRoot()): void {
  for (const element of container.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = element.getAttribute('href');
    if (href && !/^(?:[a-z][\w+.-]*:|\/\/|#|\/)/i.test(href))
      element.href = new URL(href, base).href;
  }
}
