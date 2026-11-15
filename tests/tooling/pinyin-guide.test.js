import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildMandarinCatalog } from '../../tools/content/mandarin.mjs';
import { soundPageMarkup } from '../../src/ui/info-pages.js';
import { mandarin } from '../../src/languages/profiles.ts';
import { catalogRows, referenceRows } from '../../src/content/catalog.ts';

test('guide example IDs retain the intended words and render through the language router', async () => {
  const catalog = await buildMandarinCatalog(fileURLToPath(new URL('../../', import.meta.url)));
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
