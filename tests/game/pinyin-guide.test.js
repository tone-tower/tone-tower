import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mandarinGuide } from '../../src/languages/mandarin-guide.js';
import { soundPageMarkup } from '../../src/ui/info-pages.js';
import { mandarin } from '../../src/languages/profiles.ts';
import { catalogRows, referenceRows } from '../../src/content/catalog.ts';

test('guide example IDs retain the intended words and render through the language router', async () => {
  const catalog = JSON.parse(
    await readFile(new URL('../../catalogs/cmn.json', import.meta.url), 'utf8'),
  );
  const rows = catalogRows(catalog, mandarin);
  const references = referenceRows(catalog, rows);
  const ma = references.filter((reference) => reference.tone < 5);
  assert.deepEqual(
    ma.map((reference) => reference.transcription),
    ['ma1', 'ma2', 'ma3', 'ma4'],
  );
  assert.equal(new Set(ma.map((reference) => reference.speakerId)).size, 1);
  assert.ok(ma.every((reference) => reference.anchor && reference.author === 'Wolfdog'));
  const html = soundPageMarkup(references, mandarin.toneDefinitions, rows, mandarin);
  assert.match(html, /data-guide-word="commons-124599289"/);
  assert.match(html, /data-guide-word="commons-124578100"/);
  const buttons = [
    ...html.matchAll(
      /<button\b[^>]*data-guide-word="([^"]+)"[^>]*aria-label="Hear ([^,]+),[^>]*>/g,
    ),
  ];
  assert.ok(buttons.length >= 18, 'Expected the sourced inline listening examples');
  for (const match of buttons) {
    const recording = rows.find((row) => row.id === match[1]);
    assert.ok(recording, match[1]);
    assert.equal(match[2], mandarin.format(recording.transcription));
  }
  assert.match(html, /<mark>ma<\/mark>/);
  assert.match(html, /<mark lang="cmn">妈<\/mark>/);
});

test('missing or mismatched examples remain text and do not relabel another recording', () => {
  const wrongWord = { id: 'commons-124599289', transcription: 'pa1', text: 'wrong' };
  const html = mandarinGuide([], mandarin.toneDefinitions, false, [wrongWord]);
  assert.doesNotMatch(html, /data-guide-word=/);
  assert.match(html, /<b>bā<\/b>/);
  assert.equal((html.match(/recording unavailable/g) || []).length, 5);
  const compact = mandarinGuide([], mandarin.toneDefinitions, true);
  assert.match(compact, /Pinyin at a glance/);
  assert.doesNotMatch(compact, /data-guide-word=/);
});

test('catalog text and Pinyin in reference cards are escaped', () => {
  const row = {
    id: 'fixture',
    tone: 1,
    transcription: 'ma1',
    gloss: '<img src=x>',
    targetIndex: 0,
    syllables: [{ text: '<script>', transcription: 'ma1' }],
  };
  const html = mandarinGuide([row], mandarin.toneDefinitions);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<script>|<img/);
});
