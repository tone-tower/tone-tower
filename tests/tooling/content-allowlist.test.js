import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { atomicJSON } from '../../tools/lib/json.mjs';
import { createContentAllowlist } from '../../tools/server/content-allowlist.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'tone-tower-content-paths-'));
  t.after(async () => {
    assert.equal(path.dirname(root), tmpdir());
    assert.ok(path.basename(root).startsWith('tone-tower-content-paths-'));
    await rm(root, { recursive: true, force: true });
  });
  const catalog = {
    version: 2,
    language: 'cmn',
    transcriptionSystem: 'pinyin',
    entries: [{ id: 'mother', forms: { default: '妈' }, gloss: 'mother' }],
    pronunciations: [
      { id: 'ma1', entryId: 'mother', syllables: [{ transcription: 'ma1', tone: 1 }] },
    ],
    recordings: [
      { id: 'voice', pronunciationId: 'ma1', audio: 'audio/cmn/old.mp3', realizedTones: [1] },
    ],
    references: [],
  };
  const save = () => atomicJSON(path.join(root, 'catalogs/cmn.json'), catalog);
  await save();
  return { root, catalog, save, permits: createContentAllowlist(root, ['cmn']) };
}

test('a running content allowlist follows catalog replacements without exposing archive audio', async (t) => {
  const { catalog, save, permits } = await fixture(t);
  assert.equal(await permits('catalogs/cmn.json'), true);
  assert.equal(await permits('audio/cmn/old.mp3'), true);
  assert.equal(await permits('audio/cmn/new.mp3'), false);
  catalog.recordings[0].audio = 'audio/cmn/new.mp3';
  // Same-size replacement reproduces a catalog rebuild on an already-running server.
  await save();
  assert.equal(await permits('catalogs/cmn.json'), true);
  assert.equal(await permits('audio/cmn/new.mp3'), true);
  assert.equal(await permits('audio/cmn/old.mp3'), false);
  assert.equal(await permits('audio/cmn/archive-only.mp3'), false);
  assert.equal(await permits('data/audio/mandarin-tone-examples.json'), false);
});

test('changed catalogs are validated and recover once valid content is restored', async (t) => {
  const { catalog, save, permits } = await fixture(t);
  await permits('audio/cmn/old.mp3');
  catalog.recordings[0].audio = '../private.mp3';
  await save();
  await assert.rejects(permits('../private.mp3'), /Invalid local audio path/);
  catalog.recordings[0].audio = 'audio/cmn/new.mp3';
  await save();
  assert.equal(await permits('audio/cmn/new.mp3'), true);
  catalog.language = 'yue';
  await save();
  await assert.rejects(permits('audio/cmn/new.mp3'), /Unsupported language/);
});
