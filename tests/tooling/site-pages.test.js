import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pages, site, pageFromLocation } from '../../src/site.ts';
import { languages } from '../../src/languages/profiles.ts';
import { renderPage, sitemap } from '../../tools/publishing/pages.mjs';

test('language pages have static content, independent navigation, metadata and project-relative assets', async () => {
  const template = await readFile(new URL('../../src/shell.html', import.meta.url), 'utf8');
  for (const [key, metadata] of Object.entries(pages)) {
    const profile = languages[metadata.language],
      html = renderPage(template, key),
      url = new URL(metadata.path, site.siteUrl).href;
    assert.ok(html.includes('<title>' + metadata.title + '</title>'));
    assert.ok(html.includes('rel="canonical" href="' + url + '"'));
    assert.ok(html.includes('content="' + metadata.description + '"'));
    assert.ok(html.includes('data-language="' + profile.id + '"'));
    const prefix = '../'.repeat(metadata.path.split('/').filter(Boolean).length);
    assert.ok(html.includes('href="' + prefix + profile.slug + '/guide/"'));
    assert.ok(html.includes('class="language-switcher"'));
    for (const language of Object.values(languages))
      assert.ok(
        html.includes(
          'href="' +
            prefix +
            language.slug +
            '/' +
            (metadata.page === 'home'
              ? ''
              : metadata.page === 'sounds'
                ? 'guide/'
                : metadata.page + '/') +
            '"',
        ),
      );
    assert.equal((html.match(/id="progress"/g) ?? []).length, 0);
    assert.equal((html.match(/data-nav-page="about"/g) ?? []).length, 1);
    assert.ok(!html.includes('{{'));
    assert.equal(html.includes('id="script-display"'), profile.scripts.length > 1);
    assert.ok(html.includes(profile.guideName ?? profile.romanization + ' guide'));
    const base = new URL(
      html.match(/data-site-root="([^"]+)"/)[1],
      'https://example.org/a/renamed/' + metadata.path,
    );
    assert.equal(base.href, 'https://example.org/a/renamed/');
    assert.equal(new URL('src/app.ts', base).href, 'https://example.org/a/renamed/src/app.ts');
    assert.ok(sitemap().includes(url));
    if (metadata.page === 'about') {
      assert.ok(html.includes('data-info-action="reset"'));
      assert.ok(!html.includes('data-info-action="records"'));
      for (const heading of [
        'What you can practise',
        'Games and practice',
        'Recordings and sources',
        'Progress and privacy',
        'An open-source side project',
        'Help make it better',
      ])
        assert.ok(html.includes(heading), profile.id + ': ' + heading);
      assert.ok(html.includes('info-grid'));
      assert.ok(html.includes('Report a problem'));
      assert.ok(html.includes('Suggest an idea'));
      assert.ok(!html.includes(String.fromCharCode(36) + '{profile'));
    }
    if (metadata.page === 'sounds') {
      assert.ok(
        html.includes(profile.id === 'vi' ? 'Six tones, five marks' : 'Syllable structure'),
      );
      assert.ok(html.includes(profile.guideName ?? profile.romanization + ' guide'));
    }
  }
  assert.ok(!Object.values(pages).some((p) => ['guide/', 'about/', 'practice/'].includes(p.path)));
});
test('root chooser has links to all three sites and loads no game JavaScript or recordings', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('href="cantonese/"'));
  assert.ok(html.includes('href="mandarin/"'));
  assert.ok(html.includes('href="vietnamese/"'));
  assert.doesNotMatch(html, /<script|catalogs\/|<audio|\.mp3/);
});
test('clean language routes resolve directly under arbitrary project paths', () => {
  for (const base of ['https://example.org/', 'https://example.org/a/renamed/'])
    for (const metadata of Object.values(pages)) {
      const profile = languages[metadata.language];
      for (const suffix of ['?test=1#app', 'index.html'])
        assert.equal(
          pageFromLocation(new URL(metadata.path + suffix, base), new URL(base), profile),
          metadata.page,
        );
    }
});
