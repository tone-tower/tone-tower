import { test } from 'vitest';
import assert from 'node:assert/strict';
import { validateCatalog } from '../../src/content/catalog.ts';
import { mandarin } from '../../src/languages/profiles.ts';
const fixture = () => ({
  version: 2,
  language: 'cmn',
  transcriptionSystem: 'pinyin',
  entries: [{ id: 'mother', forms: { default: '妈' }, gloss: 'mother' }],
  pronunciations: [
    { id: 'ma', entryId: 'mother', syllables: [{ text: '妈', transcription: 'ma1', tone: 1 }] },
  ],
  recordings: [
    {
      id: 'voice',
      pronunciationId: 'ma',
      audio: 'audio/cmn/voice.mp3',
      realizedTones: [1],
      source: 'https://example.org/voice',
      author: 'Speaker',
      license: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      conversion: 'Original MP3',
    },
  ],
  references: [{ tone: 1, recordingId: 'voice', targetIndex: 0 }],
});
test('publication catalog checks reject malformed relationships, targets, paths, and credits', () => {
  validateCatalog(fixture(), mandarin, { publication: true });
  for (const change of [
    (c) => c.entries.push(c.entries[0]),
    (c) => (c.pronunciations[0].entryId = 'missing'),
    (c) => (c.pronunciations[0].syllables[0].transcription = ''),
    (c) => (c.recordings[0].realizedTones = [6]),
    (c) => (c.recordings[0].toneTargets = [-1]),
    (c) => (c.recordings[0].toneTargets = [1]),
    (c) => (c.recordings[0].toneTargets = [0, 0]),
    (c) => (c.recordings[0].audio = '../private.mp3'),
    (c) => (c.recordings[0].audio = 'https://example.org/clip.mp3'),
    (c) => (c.recordings[0].author = ''),
    (c) => (c.recordings[0].licenseUrl = 'javascript:alert(1)'),
    (c) => (c.recordings[0].speakerId = ''),
    (c) =>
      (c.recordings[0].speakerEvidence = {
        name: 'Voice',
        source: 'javascript:alert(1)',
        basis: 'explicit-speaker-credit',
      }),
    (c) => (c.recordings[0].toneEvidence = { status: 'reviewed' }),
    (c) =>
      (c.pronunciations[0].phonetics = {
        basis: 'transcription',
        syllableCount: 2,
        tonePattern: [1],
        syllables: [],
      }),
    (c) => (c.references[0].targetIndex = 2),
    (c) => c.references.push(c.references[0]),
  ]) {
    const c = fixture();
    change(c);
    assert.throws(() => validateCatalog(c, mandarin, { publication: true }));
  }
});

test('only explicit synthetic recordings may omit original-source and licence links', () => {
  const c = fixture();
  const recording = c.recordings[0];
  recording.synthetic = true;
  recording.conversion = 'Synthetic speech generated with a fixture.';
  for (const field of ['source', 'license', 'licenseUrl']) delete recording[field];
  validateCatalog(c, mandarin, { publication: true });
  for (const synthetic of [undefined, false, 'true']) {
    recording.synthetic = synthetic;
    assert.throws(() => validateCatalog(c, mandarin, { publication: true }));
  }
  recording.synthetic = true;
  for (const field of ['author', 'conversion']) {
    const value = recording[field];
    recording[field] = '';
    assert.throws(() => validateCatalog(c, mandarin, { publication: true }));
    recording[field] = value;
  }
  recording.source = 'javascript:alert(1)';
  assert.throws(() => validateCatalog(c, mandarin, { publication: true }));
});
