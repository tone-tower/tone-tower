import { pages, site, languagePages } from '../../src/site.ts';
import { languages } from '../../src/languages/profiles.ts';
import { aboutPageMarkup, soundPageMarkup } from '../../src/ui/info-pages.js';
import { catalogRows, referenceRows } from '../../src/content/catalog.ts';
import { scriptSettingMarkup } from '../../src/ui/site-controls.ts';
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
export const generatedFiles = [
  ...Object.values(pages).map((page) => page.path + 'index.html'),
  'sitemap.xml',
];
export function localizeLinks(html, profile) {
  const routes = languagePages(profile);
  for (const [from, to] of [
    ['./', routes.home.path],
    ['guide/', routes.sounds.path],
    ['about/', routes.about.path],
    ['practice/', routes.practice.path],
  ])
    html = html.replaceAll('href="' + from + '"', 'href="' + to + '"');
  return html;
}
export function renderPage(template, key, catalog) {
  const metadata = pages[key];
  if (!metadata) throw Error('Unknown language page: ' + key);
  const profile = languages[metadata.language],
    page = metadata.page;
  const url = new URL(metadata.path, site.siteUrl).href;
  const values = {
    title: escape(metadata.title),
    description: escape(metadata.description),
    canonical: escape(url),
    shareImage: escape(new URL('assets/brand/share-card.png', site.siteUrl).href),
    language: escape(profile.label),
    romanization: escape(profile.romanization),
    guideName: escape(profile.guideName ?? profile.romanization + ' guide'),
    loading: escape(
      profile.copy?.loading ??
        'Play Tone Tower and Skyrail to practise ' +
          profile.label +
          ' tones and ' +
          profile.romanization +
          ' spelling.',
    ),
    shareAlt:
      'Tone Tower for Cantonese, Mandarin and Vietnamese, showing a Mandarin round with 你好 (hello).',
    scriptSetting: scriptSettingMarkup(profile),
  };
  let html = localizeLinks(template, profile).replace(/\{\{(\w+)\}\}/g, (_, token) => {
    if (!(token in values)) throw Error('Unknown page token: ' + token);
    return values[token];
  });
  html = html.replace('<html lang="en">', '<html lang="en" data-language="' + profile.id + '">');
  const rootPrefix = '../'.repeat(metadata.path.split('/').filter(Boolean).length);
  html = html.replace(/<base[^>]*>/, '');
  html = html.replace('<html lang="en"', '<html lang="en" data-site-root="' + rootPrefix + '"');
  html = html.replace(
    'class="skip-link" href="#app"',
    'class="skip-link" href="' + metadata.path + '#app"',
  );
  const rows = catalog ? catalogRows(catalog, profile) : [],
    anchors = catalog ? referenceRows(catalog, rows) : [];
  const guide = soundPageMarkup(anchors, profile.toneDefinitions, rows, profile);
  if (catalog) {
    // Use the recordings the guide actually resolved, including any fallback examples.
    const guideIds = new Set([...guide.matchAll(/\bdata-guide-word="([^"]+)"/g)].map((m) => m[1]));
    const referenceIds = new Set(catalog.references.map((reference) => reference.recordingId));
    const recordings = catalog.recordings.filter(
      (recording) => referenceIds.has(recording.id) || guideIds.has(escape(recording.id)),
    );
    const pronunciationIds = new Set(recordings.map((recording) => recording.pronunciationId));
    const pronunciations = catalog.pronunciations.filter((p) => pronunciationIds.has(p.id));
    const entryIds = new Set(pronunciations.map((p) => p.entryId));
    const guideCatalog = {
      version: catalog.version,
      language: catalog.language,
      transcriptionSystem: catalog.transcriptionSystem,
      entries: catalog.entries.filter((entry) => entryIds.has(entry.id)),
      pronunciations,
      recordings,
      references: catalog.references,
      hskSource: catalog.hskSource,
      availability: catalog.availability,
    };
    const json = JSON.stringify(guideCatalog).replace(/</g, '\\u003c');
    html = html.replace(
      '</body>',
      () => `<script type="application/json" id="guide-catalog">${json}</script>\n</body>`,
    );
  }
  let content;
  if (page === 'about') content = aboutPageMarkup(profile);
  if (page === 'sounds') content = guide;
  if (page === 'practice')
    content =
      '<div class="loading-state"><h1>Practice Workshop</h1><p>' +
      escape(metadata.description) +
      '</p><p>Loading your exercises…</p><noscript>Enable JavaScript to practise.</noscript></div>';
  if (content)
    html = html.replace(
      /(<main id="app" tabindex="-1">)[\s\S]*?(<\/main>)/,
      '$1' + localizeLinks(content, profile) + '$2',
    );
  html = html
    .replace(/ aria-current="page"/g, '')
    .replace('data-nav-page="' + page + '"', 'data-nav-page="' + page + '" aria-current="page"');
  // Page links are relative to the deployment root; Vite owns source asset URLs.
  html = html.replace(/\b(href|src)="([^"]+)"/g, (match, attr, ref) => {
    if (/^(?:[a-z][\w+.-]*:|\/\/|#|\/)/i.test(ref)) return match;
    if (ref.startsWith('src/') || ref.startsWith('assets/brand/') || ref === 'favicon.ico')
      return attr + '="/' + ref + '"';
    return attr + '="' + rootPrefix + ref + '"';
  });
  return html;
}
export function sitemap() {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ['', ...Object.values(pages).map((page) => page.path)]
      .map((route) => '  <url><loc>' + new URL(route, site.siteUrl).href + '</loc></url>')
      .join('\n') +
    '\n</urlset>\n'
  );
}
