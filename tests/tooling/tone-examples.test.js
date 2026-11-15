import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadToneExamples } from '../../tools/content/tone-examples.mjs';
import { buildMandarinCatalog, coverage } from '../../tools/content/mandarin.mjs';
import { catalogRows } from '../../src/content/catalog.ts';
import { mandarin } from '../../src/languages/profiles.ts';
import { validatePractice, defaultPractice } from '../../src/game/game-core.ts';

const project = fileURLToPath(new URL('../../', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'tone-tower-ma-'));
  t.after(async () => {
    assert.equal(path.dirname(root), tmpdir());
    assert.ok(path.basename(root).startsWith('tone-tower-ma-'));
    await rm(root, { recursive: true, force: true });
  });
  const registry = JSON.parse(
    await readFile(path.join(project, 'data/audio/mandarin-tone-examples.json'), 'utf8'),
  );
  for (const segment of registry.segments) {
    const target = path.join(root, segment.recording.audio);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(path.join(project, segment.recording.audio)));
  }
  const save = async () => {
    await mkdir(path.join(root, 'data/audio'), { recursive: true });
    await writeFile(
      path.join(root, 'data/audio/mandarin-tone-examples.json'),
      JSON.stringify(registry),
    );
  };
  await save();
  return { root, registry, save };
}

test('four matched excerpts retain credits and stay out of exercise coverage', async (t) => {
  const { root } = await fixture(t);
  const examples = await loadToneExamples(root);
  assert.deepEqual(
    examples.recordings.map((recording) => recording.realizedTones),
    [[1], [2], [3], [4]],
  );
  assert.ok(
    examples.recordings.every(
      (recording) =>
        recording.speakerId === 'commons-user-Wolfdog' &&
        recording.author === 'Wolfdog' &&
        recording.license === 'CC-BY-SA-4.0' &&
        recording.referenceOnly,
    ),
  );
  const catalog = await buildMandarinCatalog(root);
  assert.equal(catalog.references.length, 4);
  assert.equal(coverage(catalog).singles, 0);
  assert.equal(
    validatePractice(defaultPractice('tone', mandarin), catalogRows(catalog, mandarin), mandarin)
      .valid,
    false,
  );
  assert.equal((await buildMandarinCatalog(root, { reviewedOnly: true })).recordings.length, 0);
});

test('tone-example validation rejects altered metadata, paths, cuts, labels and audio', async (t) => {
  const { root, registry, save } = await fixture(t);
  const original = structuredClone(registry);
  for (const change of [
    (value) => {
      value.source.attribution.license = 'CC-BY-NC-4.0';
    },
    (value) => {
      value.source.original.sha1 = '0'.repeat(40);
    },
    (value) => {
      value.segments[0].recording.audio = '../outside.mp3';
    },
    (value) => {
      value.segments[1].start = 0.5;
    },
    (value) => {
      value.segments[0].pronunciation.syllables[0].transcription = 'ma4';
    },
    (value) => {
      value.segments[0].entry.forms.simplified = '错';
    },
    (value) => {
      value.segments[0].audio.bytes++;
    },
  ]) {
    Object.assign(registry, structuredClone(original));
    change(registry);
    await save();
    await assert.rejects(loadToneExamples(root), /tone-example/);
  }
  Object.assign(registry, structuredClone(original));
  await save();
  await writeFile(
    path.join(root, registry.segments[0].recording.audio),
    Buffer.alloc(registry.segments[0].audio.bytes),
  );
  await assert.rejects(loadToneExamples(root), /integrity/);
});

test('projects without the optional teaching source retain their existing catalog behavior', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'tone-tower-ma-'));
  t.after(async () => {
    assert.equal(path.dirname(root), tmpdir());
    assert.ok(path.basename(root).startsWith('tone-tower-ma-'));
    await rm(root, { recursive: true, force: true });
  });
  assert.equal(await loadToneExamples(root), null);
});
