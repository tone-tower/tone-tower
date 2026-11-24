import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pages, site, pageFromLocation } from '../../src/site.ts';
import { languages } from '../../src/languages/profiles.ts';
import { renderPage, sitemap } from '../../tools/publishing/pages.mjs';

const productionUrl = 'https://tonetower.github.io/';
const repositoryUrl = 'https://github.com/tonetower/tonetower.github.io';

function assertPublicMetadata(html, url) {
  assert.ok(html.includes(`rel="canonical" href="${url}"`));
  assert.ok(html.includes(`property="og:url" content="${url}"`));
  const shareImage = productionUrl + 'assets/brand/share-card.png';
  assert.ok(html.includes(`property="og:image" content="${shareImage}"`));
  assert.ok(html.includes(`name="twitter:image" content="${shareImage}"`));
}

test('language pages have static content, independent navigation, metadata and project-relative assets', async () => {
  const template = await readFile(new URL('../../src/shell.html', import.meta.url), 'utf8');
  for (const [key, metadata] of Object.entries(pages)) {
    const profile = languages[metadata.language],
      html = renderPage(template, key),
      url = productionUrl + metadata.path;
    assert.ok(html.includes('<title>' + metadata.title + '</title>'));
    assertPublicMetadata(html, url);
    assert.ok(html.includes('content="' + metadata.description + '"'));
    assert.ok(html.includes('data-language="' + profile.id + '"'));
    const prefix = '../'.repeat(metadata.path.split('/').filter(Boolean).length);
    assert.ok(html.includes('href="' + prefix + profile.slug + '/guide/"'));
    assert.ok(html.includes('<span class="site-language">' + profile.label + '</span>'));
    assert.equal(html.includes('id="script-display"'), profile.scripts.length > 1);
    assert.ok(!html.includes('class="site-footer"'));
    for (const language of Object.values(languages).filter((other) => other.id !== profile.id))
      assert.equal(
        html.includes('href="' + prefix + language.slug + '/"'),
        metadata.page === 'about',
      );
    assert.equal((html.match(/id="progress"/g) ?? []).length, 0);
    assert.equal((html.match(/data-nav-page="about"/g) ?? []).length, 1);
    assert.ok(!html.includes('{{'));
    assert.ok(html.includes(profile.guideName ?? profile.romanization + ' guide'));
    const base = new URL(
      html.match(/data-site-root="([^"]+)"/)[1],
      'https://example.org/a/renamed/' + metadata.path,
    );
    assert.equal(base.href, 'https://example.org/a/renamed/');
    assert.equal(new URL('src/app.ts', base).href, 'https://example.org/a/renamed/src/app.ts');
    if (metadata.page === 'about' || key === 'vi:sounds') {
      assert.ok(
        html.includes(
          '<a class="text-button back-link" href="' +
            prefix +
            profile.slug +
            '/" data-page="home">← Home</a>',
        ),
      );
    }
    if (metadata.page === 'about') {
      assert.ok(!html.includes('data-info-action="reset"'));
      for (const heading of ['Games', 'Recordings', 'Other languages'])
        assert.ok(html.includes(heading), profile.id + ': ' + heading);
      assert.ok(html.includes('Browse recordings'));
      assert.ok(html.includes('Report a problem'));
      assert.ok(html.includes('Share an idea or feedback'));
      for (const suffix of [
        '',
        '/issues/new?template=bug-report.yml',
        '/discussions/new?category=ideas-feedback',
        '/discussions',
      ])
        assert.ok(html.includes(`href="${repositoryUrl}${suffix}"`));
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
  assertPublicMetadata(html, productionUrl);
  assert.ok(html.includes(`href="${repositoryUrl}"`));
  assert.ok(html.includes('href="cantonese/"'));
  assert.ok(html.includes('href="mandarin/"'));
  assert.ok(html.includes('href="vietnamese/"'));
  assert.doesNotMatch(html, /<script|catalogs\/|<audio|\.mp3/);
});
test('sitemap lists the chooser and every language page at the production origin', () => {
  assert.equal(site.siteUrl, productionUrl);
  const entries = [...sitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
  assert.deepEqual(entries, [
    productionUrl,
    ...Object.values(pages).map((p) => productionUrl + p.path),
  ]);
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
