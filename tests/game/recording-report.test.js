import { test } from 'vitest';
import assert from 'node:assert/strict';
import { recordingIssueUrl } from '../../src/ui/recording-report.ts';
import { mandarin } from '../../src/languages/profiles.ts';

test('recording reports prefill the exact language, recording, reading and source', () => {
  const url = new URL(
    recordingIssueUrl(
      {
        id: 'commons-123',
        text: '你好',
        transcription: 'ni3 hao3',
        realizedTones: [2, 3],
        source: 'https://commons.wikimedia.org/?curid=123',
      },
      mandarin,
      { challenge: 'tone', practice: false },
    ),
  );
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.searchParams.get('template'), 'recording-report.yml');
  assert.equal(url.searchParams.get('title'), '[Recording] Mandarin: 你好 (commons-123)');
  assert.equal(url.searchParams.get('problem'), null);
  assert.equal(
    url.searchParams.get('context'),
    [
      'Where: Tone Tower',
      'Language: Mandarin',
      'Recording ID: commons-123',
      'Written form: 你好',
      'Dictionary spelling: ni3 hao3',
      'Listening tones: 2 3',
      'Source: https://commons.wikimedia.org/?curid=123',
    ].join('\n'),
  );
});

test('recording reports identify the selected game and its Practice mode or the credits screen', () => {
  for (const [context, location] of [
    [{ challenge: 'tone', practice: true }, 'Tone Tower Practice'],
    [{ challenge: 'tide', practice: false }, 'Skyrail'],
    [{ challenge: 'tide', practice: true }, 'Skyrail Practice'],
    ['credits', 'Voices & credits'],
  ]) {
    const url = new URL(recordingIssueUrl({ id: 'commons-123' }, mandarin, context));
    assert.equal(url.searchParams.get('context').split('\n')[0], `Where: ${location}`);
  }
});
