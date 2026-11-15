import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cantonese, mandarin } from '../../src/languages/profiles.ts';
import { toneLabel, toneSymbolMarkup } from '../../src/ui/tone-presentation.ts';
import { scriptSettingMarkup } from '../../src/ui/site-controls.ts';
import { textLanguage } from '../../src/languages/text-language.ts';
import { applyPinyinTone } from '../../src/languages/pinyin.ts';

test('tone presentation follows explicit profile metadata, including named tones and unmarked neutral', () => {
  assert.match(toneSymbolMarkup(cantonese, 5), /is-number[^>]*>5</);
  assert.match(toneSymbolMarkup(mandarin, 3), /tone-mark/);
  assert.match(toneSymbolMarkup(mandarin, 3), /M10 13 L20 27 L30 13/);
  assert.match(toneSymbolMarkup(mandarin, 5), /tone-mark is-blank/);
  assert.equal(toneLabel(mandarin, 2), 'Tone 2 · Rising');
  const other = {
    ...cantonese,
    id: 'example',
    toneDefinitions: [{ value: 'rising', label: 'Rising', name: 'Rising', symbol: '↗' }],
    textLanguages: { latin: 'vi-Latn' },
  };
  assert.match(toneSymbolMarkup(other, 'rising'), />↗</);
  assert.equal(toneLabel(other, 'rising'), 'Rising');
  assert.equal(textLanguage(other, 'latin'), 'vi-Latn');
  assert.equal(textLanguage(other, 'unknown'), 'example');
  assert.throws(() => toneSymbolMarkup(other, 1), /Missing tone definition/);
});

test('character controls use the available writing systems rather than a fixed Chinese toggle', () => {
  assert.equal(scriptSettingMarkup(cantonese), '');
  const other = {
    ...mandarin,
    scripts: ['latin', 'native'],
    defaultScript: 'native',
    scriptLabels: { latin: 'Latin & transliteration', native: 'Native writing' },
  };
  const markup = scriptSettingMarkup(other);
  assert.match(markup, /Latin &amp; transliteration/);
  assert.match(markup, /value="native" selected/);
  assert.doesNotMatch(markup, /simplified|traditional/);
});

test('Mandarin feedback separates dictionary spelling from tone changes and neutral context', () => {
  const greeting = [
    { transcription: 'ni3', dictionaryTone: 3, tone: 2 },
    { transcription: 'hao3', dictionaryTone: 3, tone: 3 },
  ];
  assert.match(mandarin.toneFeedback(greeting), /Written nǐ hǎo; listening answer ní hǎo/);
  assert.match(mandarin.toneFeedback(greeting), /third tone changes before another third tone/);
  assert.match(mandarin.toneFeedback([{ transcription: 'ma5', tone: 5 }]), /short and unstressed/);
  assert.equal(mandarin.toneFeedback([{ transcription: 'ma1', tone: 1 }]), '');
});

test('tone helpers edit the current syllable, replace old tones, preserve umlauts, and support neutral', () => {
  for (const [value, start, end, tone, expected, caret] of [
    ['ni3 hao', 7, 7, 3, 'ni3 hǎo', 7],
    ['ma3 hao4', 2, 2, 2, 'má hao4', 2],
    ['shui', 2, 2, 3, 'shuǐ', 4],
    ['lü4', 3, 3, 2, 'lǘ', 2],
    ['lu\u0308\u0300', 4, 4, 3, 'lǚ', 2],
    ['nǐ hǎo', 6, 6, 5, 'nǐ hao', 6],
    ['ni3 hao', 4, 7, 4, 'ni3 hào', 7],
    ['n', 1, 1, 2, 'n2', 2],
    ['', 0, 0, 1, '', 0],
  ])
    assert.deepEqual(applyPinyinTone(value, start, end, tone), { value: expected, caret });
});
