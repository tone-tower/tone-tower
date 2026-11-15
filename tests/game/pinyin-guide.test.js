import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mandarinGuide } from '../../src/languages/mandarin-guide.js';
import { mandarin } from '../../src/languages/profiles.ts';

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
