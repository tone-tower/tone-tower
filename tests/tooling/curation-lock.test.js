import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withFileLock } from '../../tools/lib/lock.mjs';
import { correctMandarin, buildMandarinCatalog } from '../../tools/content/mandarin.mjs';
import { withAudioLock } from '../../tools/audio/lock.mjs';
import { validateInventory } from '../../tools/audio/inventory.mjs';
test('curation rejects overlapping edits and snapshots, releases ownership, and permits downloads', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tone-tower-curation-lock-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('tone-tower-curation-lock-'));
    await rm(root, { recursive: true, force: true });
  });
  const lock = path.join(root, '.audio-import-cache/cmn/curation.lock');
  const edits = path.join(root, 'corrections.json');
  await writeFile(edits, 'original');
  await withFileLock(
    async () => {
      await assert.rejects(
        () => correctMandarin(root, { recordingId: 'commons-1', reason: 'Concurrent edit' }),
        /Another Mandarin curation operation/,
      );
      await assert.rejects(() => buildMandarinCatalog(root), /Another Mandarin curation operation/);
      assert.equal(await withAudioLock(async () => true, root), true);
      assert.equal(await readFile(edits, 'utf8'), 'original');
    },
    lock,
    { label: 'Mandarin curation' },
  );
  await assert.rejects(
    () =>
      withFileLock(async () => {
        throw Error('Fixture failure');
      }, lock),
    /Fixture failure/,
  );
  assert.equal(await withFileLock(async () => true, lock), true);
});
test('shared archive validation rejects duplicate IDs, traversal paths, bad metadata and schemas', () => {
  const row = {
    id: 'commons-1',
    language: 'cmn',
    sourceText: '妈',
    audio: {
      file: 'audio/cmn/commons-1.mp3',
      sha256: 'a'.repeat(64),
      bytes: 1200,
      processing: 'MP3',
    },
    original: { sha1: 'b'.repeat(40), sha256: 'c'.repeat(64), bytes: 1200 },
    attribution: {
      author: 'Speaker',
      license: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    source: { pageUrl: 'https://example.org/1', fileTimestamp: '2026-11-13T00:00:00Z' },
  };
  const fixture = () => ({
    version: 1,
    collectionId: 'cmn',
    language: 'cmn',
    recordings: [structuredClone(row)],
  });
  validateInventory(fixture(), 'cmn');
  for (const change of [
    (v) => v.recordings.push(v.recordings[0]),
    (v) => (v.version = 2),
    (v) => (v.recordings[0].audio.file = '../private.mp3'),
    (v) => (v.recordings[0].audio.sha256 = 'bad'),
    (v) => (v.recordings[0].attribution.author = ''),
    (v) => (v.recordings[0].source.pageUrl = 'javascript:alert(1)'),
  ]) {
    const v = fixture();
    change(v);
    assert.throws(() => validateInventory(v, 'cmn'));
  }
});
