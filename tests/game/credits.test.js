import { test } from 'vitest';
import assert from 'node:assert/strict';
import { filterCredits, creditsPage, orderCredits } from '../../src/ui/credits.ts';
import { cantonese, mandarin, vietnamese } from '../../src/languages/profiles.ts';
test('credits keep a bounded page and clamp navigation after filtering', () => {
  const rows = Array.from({ length: 473 }, (_, id) => ({
    id,
    text: '字',
    transcription: 'si' + id,
    author: id === 45 ? 'A Person' : 'Other',
  }));
  assert.equal(creditsPage(rows).rows.length, 20);
  assert.equal(creditsPage(rows, 23).rows.length, 13);
  assert.equal(creditsPage(rows, 99).page, 23);
  const matches = filterCredits(rows, 'a PERSON');
  assert.equal(matches.length, 1);
  assert.equal(creditsPage(matches, 23).page, 0);
  assert.equal(creditsPage(matches, 23).rows[0].id, 45);
  assert.deepEqual(creditsPage(filterCredits(rows, 'no match')).rows, []);
  assert.equal(filterCredits(rows, '字').length, 473);
});

test('Chinese credits sort readings by spelling and tone, then creator and ID', () => {
  for (const [profile, readings] of [
    [cantonese, ['zi1', 'aa4', 'aa1']],
    [mandarin, ['zi1', 'a4', 'a1']],
  ]) {
    const rows = [
      { id: 'z', transcription: readings[0], author: 'An' },
      { id: 'late-tone', transcription: readings[1], author: 'An' },
      { id: 'late-creator', transcription: readings[2], author: 'Zoe' },
      { id: 'b', transcription: readings[2], author: 'An' },
      { id: 'a', transcription: readings[2], author: 'An' },
    ];
    const sorted = orderCredits(rows, profile);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ['a', 'b', 'late-creator', 'late-tone', 'z'],
    );
    assert.deepEqual(
      filterCredits(sorted, 'An').map((row) => row.id),
      ['a', 'b', 'late-tone', 'z'],
    );
    assert.equal(rows[0].id, 'z');
  }
});

test('Vietnamese credits sort written letters and accents using Vietnamese order', () => {
  const names = ['đá', 'ba', 'bá', 'da', 'ăn', 'âm', 'an', 'bà'];
  const rows = names.map((text) => ({ id: text, text }));
  assert.deepEqual(
    orderCredits(rows, vietnamese).map((row) => row.text),
    ['an', 'ăn', 'âm', 'ba', 'bà', 'bá', 'da', 'đá'],
  );
});
