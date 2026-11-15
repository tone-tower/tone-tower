import assert from 'node:assert/strict';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationFiles, publicationManifest, digest } from './build.mjs';
import { validateCatalog } from '../../src/content/catalog.ts';
import { languages } from '../../src/languages/profiles.ts';
import { catalogRows } from '../../src/content/catalog.ts';
import { createRun } from '../../src/game/game-core.ts';
import { createStaticServer } from '../server/static-server.mjs';

async function listFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix + entry.name;
    assert.ok(!entry.isSymbolicLink(), 'Unexpected publication symlink: ' + name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, name + '/')));
    else files.push(name);
  }
  return files.sort();
}

export async function checkDistribution(root = path.resolve('dist'), { verifyGames = false } = {}) {
  const catalogs = Object.fromEntries(
    await Promise.all(
      Object.keys(languages).map(async (id) => [
        id,
        JSON.parse(await readFile(path.join(root, 'catalogs', id + '.json'), 'utf8')),
      ]),
    ),
  );
  for (const [id, catalog] of Object.entries(catalogs))
    validateCatalog(catalog, languages[id], { publication: true });
  if (verifyGames) {
    let completed = 0;
    for (const [id, catalog] of Object.entries(catalogs)) {
      const profile = languages[id],
        rows = catalogRows(catalog, profile);
      for (let seed = 1; seed <= 15; seed++)
        for (const challenge of profile.challenges) {
          let state = seed;
          const random = () =>
            (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
          const run = createRun(
            { challenge, variant: challenge === 'tone' ? 'normal' : 'full' },
            rows,
            { profile, random },
          );
          for (let i = 0; i < 100; i++) {
            assert.equal(
              run.answer(challenge === 'tone' ? run.word.tone : run.expected()).correct,
              true,
              id + ' ' + challenge + ' seed ' + seed,
            );
            if (i < 99) run.next();
          }
          assert.equal(run.status, 'won', id + ' ' + challenge + ' seed ' + seed);
          completed++;
        }
    }
    console.log('Completed ' + completed + ' deterministic 100-question catalog runs.');
  }
  const expected = await publicationFiles(root);
  const manifest = JSON.parse(await readFile(path.join(root, publicationManifest), 'utf8'));
  for (let start = 0; start < manifest.files.length; start += 32) {
    await Promise.all(
      manifest.files.slice(start, start + 32).map(async (file) => {
        const bytes = await readFile(path.join(root, file.name));
        assert.equal(bytes.length, file.bytes, 'Changed publication size: ' + file.name);
        assert.equal(digest(bytes), file.sha256, 'Changed publication bytes: ' + file.name);
      }),
    );
  }
  const listed = new Set(expected);
  for (const catalog of Object.values(catalogs))
    for (const row of catalog.recordings)
      assert.ok(listed.has(row.audio), 'Missing published recording: ' + row.id);
  assert.deepEqual(await listFiles(root), expected, 'Built site contains unexpected files.');
  for (const base of ['/', '/release-check/renamed-project/']) {
    const server = await createStaticServer({ root, base });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
      const requested = ['', ...expected];
      for (let start = 0; start < requested.length; start += 32) {
        await Promise.all(
          requested.slice(start, start + 32).map(async (name) => {
            const response = await fetch(origin + base + name);
            assert.equal(response.status, 200, base + name);
            const file = name || 'index.html';
            assert.equal(
              (await response.arrayBuffer()).byteLength,
              (await lstat(path.join(root, file))).size,
              base + name,
            );
            const mime = response.headers.get('content-type');
            if (file.endsWith('.js')) assert.match(mime, /^text\/javascript/);
            if (file.endsWith('.json')) assert.match(mime, /^application\/json/);
            if (file.endsWith('.mp3')) assert.match(mime, /^audio\/mpeg/);
          }),
        );
      }
      assert.equal((await fetch(origin + base + 'missing-file.js')).status, 404);
      if (base !== '/')
        assert.equal(
          (await fetch(origin + '/src/app.ts')).status,
          404,
          'Root assets must not mask broken project-relative URLs.',
        );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
  console.log(
    `Checked ${expected.length} publication files at root and a renamed project path (${Object.values(catalogs).reduce((n, catalog) => n + catalog.recordings.length, 0)} recordings).`,
  );
  return expected;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await checkDistribution(undefined, { verifyGames: true });
