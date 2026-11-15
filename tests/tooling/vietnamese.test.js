import test, { mock } from 'node:test';
import fileOps from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withCurationLock } from '../../tools/content/curation-lock.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  asciiName,
  parseCSV,
  importVietnamese,
  recoverVietnameseImport,
  buildVietnameseCatalog,
  writeVietnameseCatalog,
  coverage,
  VIETNAMESE_TONES,
} from '../../tools/content/vietnamese.mjs';
import { vietnamese } from '../../src/languages/profiles.ts';
import { catalogRows, referenceRows } from '../../src/content/catalog.ts';

// rank, word, meaning; the list mixes single syllables, words, a repeat and a missing clip.
const list = [
  [1, 'được', 'can; to get (passive marker)'],
  [2, 'chú ý', 'to pay attention'],
  [3, 'hoàn toàn', 'completely'],
  [4, 'đảm bảo', 'to ensure, to guarantee'],
  [5, 'mãi mãi', 'forever'],
  [6, 'hiện tại', 'present, current'],
  [7, 'hôm nay', 'today'],
  [8, 'xin chào', 'hello'],
  [9, 'có thể', 'can, may; possible'],
  [10, 'chủ nghĩa xã hội', ''],
  [11, 'xin chào', 'hello again'],
  [12, 'thở dài', 'to sigh'],
  [13, 'đường đời', ''],
];
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'tone-tower-vietnamese-'));
  t.after(async () => {
    assert.equal(path.dirname(root), tmpdir());
    assert.ok(path.basename(root).startsWith('tone-tower-vietnamese-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'clips'));
  // The list is a spreadsheet export: a byte-order mark, CRLF rows and quoted commas.
  await writeFile(
    path.join(root, 'list.csv'),
    '﻿rank,word,english,syllables,count,per_million,share_cumulative,unavailable_voices\r\n' +
      list
        .map(([rank, text, gloss]) =>
          [
            rank,
            text,
            gloss.includes(',') ? '"' + gloss + '"' : gloss,
            text.split(' ').length,
            '',
            100 - rank,
            '',
            '',
          ].join(','),
        )
        .join('\r\n') +
      '\r\n',
  );
  for (const [rank, text] of list)
    if (text !== 'thở dài')
      await writeFile(
        // Some file systems store names decomposed; the list is precomposed.
        path.join(
          root,
          'clips',
          String(rank).padStart(5, '0') + '_' + text.normalize('NFD') + '.mp3',
        ),
        Buffer.alloc(1200, rank),
      );
  const voice = {
    csv: path.join(root, 'list.csv'),
    audio: path.join(root, 'clips'),
    voice: 'tuananh',
    name: 'Tuan Anh',
    generator: 'ElevenLabs Eleven v4',
  };
  return { root, voice };
}
const clips = async (root) => (await readdir(path.join(root, 'audio/vi'))).sort();

test('Vietnamese file names are unambiguous ASCII and the list parser handles spreadsheet exports', () => {
  for (const [text, name] of [
    ['được', 'd9u7o7c5'],
    ['là', 'la2'],
    ['không', 'kho6ng'],
    ['xoong', 'xoong'],
    ['xông', 'xo6ng'],
    ['mẫu', 'ma6u4'],
    ['má', 'ma1'],
    ['hôm nay', 'ho6m-nay'],
    ['xin chào', 'xin-chao2'],
    ['thở dài', 'tho73-dai2'],
    ['chủ nghĩa xã hội', 'chu3-nghia4-xa4-ho6i5'],
  ])
    assert.equal(asciiName(text), name);
  assert.throws(() => asciiName('ma1'), /Not a Vietnamese word/);
  assert.deepEqual(parseCSV('﻿a,b\r\n1,"x, ""y"""\r\n\r\n2,z'), [
    { a: '1', b: 'x, "y"' },
    { a: '2', b: 'z' },
  ]);
  assert.throws(() => parseCSV('a\n"open'), /Unclosed quote/);
});

test('importing a voice takes whole words, including the six tone examples, and builds a credited catalog', async (t) => {
  const { root, voice } = await fixture(t);
  assert.deepEqual((await buildVietnameseCatalog(root)).recordings, []);
  await assert.rejects(() => importVietnamese(root, { ...voice, name: undefined }), /--name/);
  const result = await importVietnamese(root, voice);
  // Single syllables are left out; a repeated word keeps its first row.
  assert.deepEqual(result, {
    voice: 'tuananh',
    imported: 4,
    references: 6,
    short: 1,
    rare: 0,
    duplicates: ['xin chào'],
    missing: ['thở dài'],
  });
  assert.deepEqual(await clips(root), [
    'tuananh-chu1-y1.mp3',
    'tuananh-chu3-nghia4-xa4-ho6i5.mp3',
    'tuananh-co1-the63.mp3',
    'tuananh-d9am3-bao3.mp3',
    'tuananh-d9u7o7ng2-d9o7i2.mp3',
    'tuananh-hie6n5-tai5.mp3',
    'tuananh-ho6m-nay.mp3',
    'tuananh-hoan2-toan2.mp3',
    'tuananh-mai4-mai4.mp3',
    'tuananh-xin-chao2.mp3',
  ]);
  assert.deepEqual(
    await readFile(path.join(root, 'audio/vi/tuananh-xin-chao2.mp3')),
    Buffer.alloc(1200, 8),
  );
  const file = path.join(root, 'data/content/vi/words.json'),
    source = await readFile(file, 'utf8');
  assert.match(source, /"gloss": "hello"/);
  assert.doesNotMatch(source, /hello again|"gloss": ""/);
  // A second import of the same voice changes nothing.
  await importVietnamese(root, { ...voice, name: undefined, generator: undefined });
  assert.equal(await readFile(file, 'utf8'), source);

  const catalog = await buildVietnameseCatalog(root);
  assert.equal(await readFile(file, 'utf8'), source);
  assert.equal(catalog.language, vietnamese.id);
  assert.equal(catalog.transcriptionSystem, vietnamese.transcriptionSystem);
  assert.deepEqual(VIETNAMESE_TONES, vietnamese.tones);
  assert.equal(catalog.recordings.length, 10);
  const recording = catalog.recordings.find((r) => r.id === 'vi-tuananh-chu3-nghia4-xa4-ho6i5');
  assert.deepEqual(recording.realizedTones, ['hỏi', 'ngã', 'ngã', 'nặng']);
  assert.equal(recording.audio, 'audio/vi/tuananh-chu3-nghia4-xa4-ho6i5.mp3');
  assert.equal(recording.author, 'Tuan Anh · synthetic voice');
  assert.equal(recording.synthetic, true);
  assert.match(recording.conversion, /ElevenLabs Eleven v4/);
  assert.equal(recording.license, undefined);
  assert.equal(recording.referenceOnly, undefined);
  const entry = (id) => catalog.entries.find((e) => e.id === id);
  assert.equal(entry('vi-xin-chao2').gloss, 'hello');
  assert.deepEqual(entry('vi-xin-chao2').metadata.frequency, { rank: 8, perMillion: 92 });
  assert.equal(entry('vi-chu3-nghia4-xa4-ho6i5').gloss, '');
  assert.equal(catalog.pronunciations.find((p) => p.id === 'vi-xin-chao2').kind, 'word');

  // The browser reads it like any other language. Each tone's example is a whole word
  // whose syllables share that tone, and it can be asked like any other word.
  const rows = catalogRows(catalog, vietnamese),
    anchors = referenceRows(catalog, rows);
  assert.deepEqual(
    anchors.map((row) => [row.tone, row.text]),
    [
      ['sắc', 'chú ý'],
      ['huyền', 'hoàn toàn'],
      ['hỏi', 'đảm bảo'],
      ['ngã', 'mãi mãi'],
      ['nặng', 'hiện tại'],
      ['ngang', 'hôm nay'],
    ],
  );
  for (const anchor of anchors) {
    assert.equal(anchor.targetIndex, 0);
    assert.ok(anchor.syllables.length > 1);
    assert.ok(anchor.syllables.every((s) => s.tone === anchor.tone));
    assert.ok(anchor.gloss);
  }
  assert.equal(rows.filter((row) => row.anchor).length, 0);
  assert.ok(rows.every((row) => row.syllables.length > 1));
  const greeting = rows.find((row) => row.text === 'xin chào');
  assert.deepEqual(
    greeting.syllables.map((s) => [s.text, s.tone]),
    [
      ['xin', 'ngang'],
      ['chào', 'huyền'],
    ],
  );
  assert.equal(greeting.transcription, 'xin chào');
  assert.equal(catalog.availability.ready, false);
  assert.deepEqual(catalog.availability.missing, ['20 recordings of every tone']);
  // A word counts once for each tone it contains.
  assert.deepEqual(catalog.availability.tones, {
    sắc: 2,
    huyền: 3,
    hỏi: 3,
    ngã: 2,
    nặng: 2,
    ngang: 2,
  });
  assert.equal(
    coverage({
      recordings: VIETNAMESE_TONES.flatMap((tone) => Array(20).fill({ realizedTones: [tone] })),
      references: VIETNAMESE_TONES.map((tone) => ({ tone })),
    }).ready,
    true,
  );
});

test('a narrower import replaces the voice and removes the clips it no longer uses', async (t) => {
  const { root, voice } = await fixture(t);
  await importVietnamese(root, voice);
  const result = await importVietnamese(root, { ...voice, maxRank: 9 });
  assert.equal(result.imported, 2);
  assert.equal(result.rare, 4);
  assert.equal(result.references, 6);
  assert.deepEqual(await clips(root), [
    'tuananh-chu1-y1.mp3',
    'tuananh-co1-the63.mp3',
    'tuananh-d9am3-bao3.mp3',
    'tuananh-hie6n5-tai5.mp3',
    'tuananh-ho6m-nay.mp3',
    'tuananh-hoan2-toan2.mp3',
    'tuananh-mai4-mai4.mp3',
    'tuananh-xin-chao2.mp3',
  ]);
  assert.equal((await buildVietnameseCatalog(root)).recordings.length, 8);
  // The six tone examples are kept however narrow the selection.
  const narrowest = await importVietnamese(root, { ...voice, maxRank: 1 });
  assert.equal(narrowest.imported, 0);
  assert.equal(narrowest.references, 6);
  assert.equal((await buildVietnameseCatalog(root)).references.length, 6);
  // Single syllables can be included on request.
  const all = await importVietnamese(root, { ...voice, minSyllables: 1 });
  assert.equal(all.imported, 5);
  assert.equal(all.short, 0);
  assert.ok((await clips(root)).includes('tuananh-d9u7o7c5.mp3'));
  // Another voice's clips are untouched by an import.
  await writeFile(path.join(root, 'audio/vi/other-xin-chao2.mp3'), Buffer.alloc(1200));
  await importVietnamese(root, { ...voice, maxRank: 9 });
  assert.ok((await clips(root)).includes('other-xin-chao2.mp3'));
  await assert.rejects(() => importVietnamese(root, { ...voice, minSyllables: 0 }), /at least 1/);
});

test('a changed, missing or mislabelled Vietnamese clip stops the build', async (t) => {
  const { root, voice } = await fixture(t);
  await importVietnamese(root, voice);
  const file = path.join(root, 'audio/vi/tuananh-xin-chao2.mp3'),
    list = path.join(root, 'data/content/vi/words.json'),
    original = await readFile(list, 'utf8');
  await writeFile(file, Buffer.alloc(1200, 99));
  await assert.rejects(() => buildVietnameseCatalog(root), /Audio differs/);
  await rm(file);
  await assert.rejects(() => buildVietnameseCatalog(root), /Missing audio for xin chào/);
  await writeFile(file, Buffer.alloc(1200, 8));
  await buildVietnameseCatalog(root);
  for (const [from, to, error] of [
    ['"text": "hôm nay"', '"text": "chú ý"', /Duplicate Vietnamese word/],
    ['"text": "xin chào"', '"text": "xin  chào"', /Invalid Vietnamese word/],
    ['"text": "xin chào"', '"text": "xin ch4o"', /Invalid Vietnamese word/],
    ['audio/vi/tuananh-xin-chao2.mp3', 'audio/vi/tuananh-xin-chao.mp3', /Invalid recording/],
    ['"gloss": "hello"', '"gloss": ""', /Empty meaning for xin chào/],
  ]) {
    assert.ok(original.includes(from), from);
    await writeFile(list, original.replace(from, to));
    await assert.rejects(() => buildVietnameseCatalog(root), error);
  }
});

test('the committed Vietnamese collection is ready for a full climb', async () => {
  const catalog = await buildVietnameseCatalog(fileURLToPath(new URL('../../', import.meta.url)));
  assert.equal(catalog.availability.ready, true, catalog.availability.missing.join(', '));
  const rows = catalogRows(catalog, vietnamese);
  assert.equal(rows.length, catalog.recordings.length);
  // Every recording is a whole word, including the six tone examples in the guide.
  assert.ok(rows.every((row) => row.syllables.length > 1 && !row.anchor));
  const anchors = referenceRows(catalog, rows);
  assert.deepEqual(
    anchors.map((row) => row.tone),
    vietnamese.tones,
  );
  assert.ok(anchors.every((row) => row.syllables.every((s) => s.tone === row.tone)));
  // The home page example plays one of them.
  assert.ok(rows.some((row) => row.transcription === vietnamese.example.transcription));
});

test('an invalid later CSV row leaves the previous manifest and audio unchanged', async (t) => {
  const { root, voice } = await fixture(t);
  await importVietnamese(root, voice);
  const manifest = path.join(root, 'data/content/vi/words.json');
  const before = await readFile(manifest, 'utf8');
  const clip = path.join(root, 'audio/vi/tuananh-chu1-y1.mp3');
  const previousAudio = await readFile(clip);
  const input = (await readdir(voice.audio)).find((name) => name.startsWith('00002_'));
  await writeFile(path.join(voice.audio, input), Buffer.alloc(1200, 99));
  await writeFile(voice.csv, (await readFile(voice.csv, 'utf8')) + '\r\n99,ma1,invalid,1\r\n');
  await assert.rejects(() => importVietnamese(root, voice), /Invalid list row/);
  assert.equal(await readFile(manifest, 'utf8'), before);
  assert.deepEqual(await readFile(clip), previousAudio);
  await buildVietnameseCatalog(root);
});

test('a failed live audio installation rolls back all replacements and the manifest', async (t) => {
  const { root, voice } = await fixture(t);
  await importVietnamese(root, voice);
  const before = await readFile(path.join(root, 'data/content/vi/words.json'), 'utf8');
  const input = (await readdir(voice.audio)).find((name) => name.startsWith('00002_'));
  await writeFile(path.join(voice.audio, input), Buffer.alloc(1200, 99));
  const copy = fileOps.copyFile;
  let installed = 0;
  const fault = mock.method(fileOps, 'copyFile', async (...args) => {
    if (++installed === 2) throw Error('Injected installation failure');
    return copy(...args);
  });
  try {
    await assert.rejects(() => importVietnamese(root, voice), /Injected installation failure/);
  } finally {
    fault.mock.restore();
  }
  assert.equal(await readFile(path.join(root, 'data/content/vi/words.json'), 'utf8'), before);
  await buildVietnameseCatalog(root);
  assert.deepEqual(
    await readFile(path.join(root, 'audio/vi/tuananh-chu1-y1.mp3')),
    Buffer.alloc(1200, 2),
  );
});

test('Vietnamese imports and catalog builds reject a conflicting curation writer', async (t) => {
  const { root, voice } = await fixture(t);
  await importVietnamese(root, voice);
  await withCurationLock(root, 'vi', async () => {
    await assert.rejects(
      () => importVietnamese(root, voice),
      /Another Vietnamese curation operation/,
    );
    await assert.rejects(
      () => buildVietnameseCatalog(root),
      /Another Vietnamese curation operation/,
    );
    await assert.rejects(
      () => writeVietnameseCatalog(root),
      /Another Vietnamese curation operation/,
    );
    await assert.rejects(
      () => recoverVietnameseImport(root),
      /Another Vietnamese curation operation/,
    );
  });
  await buildVietnameseCatalog(root);
});

test('interrupted imports require explicit recovery and restore the previous playable collection', async (t) => {
  const { root, voice } = await fixture(t);
  await importVietnamese(root, voice);
  const dir = path.join(root, '.audio-import-cache/vi/import-transaction');
  await mkdir(path.join(dir, 'old'), { recursive: true });
  const manifest = path.join(root, 'data/content/vi/words.json');
  await writeFile(path.join(dir, 'previous.json'), await readFile(manifest));
  const file = 'audio/vi/tuananh-chu1-y1.mp3';
  await writeFile(
    path.join(dir, 'old', path.basename(file)),
    await readFile(path.join(root, file)),
  );
  await writeFile(path.join(root, file), Buffer.alloc(1200, 99));
  await writeFile(
    path.join(dir, 'transaction.json'),
    JSON.stringify({
      version: 1,
      phase: 'installing',
      manifestExisted: true,
      files: [{ file, existed: true }],
      obsolete: [],
    }),
  );
  await assert.rejects(() => buildVietnameseCatalog(root), /Incomplete Vietnamese import/);
  await assert.rejects(() => importVietnamese(root, voice), /Incomplete Vietnamese import/);
  assert.deepEqual(await recoverVietnameseImport(root), {
    recovered: true,
    outcome: 'rolled back',
  });
  assert.deepEqual(await recoverVietnameseImport(root), { recovered: false });
  await buildVietnameseCatalog(root);
});

test('replacing one Vietnamese voice preserves a second voice and rejects empty input', async (t) => {
  const { root, voice } = await fixture(t);
  await importVietnamese(root, voice);
  await importVietnamese(root, { ...voice, voice: 'other', name: 'Other' });
  await importVietnamese(root, { ...voice, maxRank: 1 });
  const catalog = await buildVietnameseCatalog(root);
  assert.equal(catalog.recordings.filter((row) => row.speakerId === 'other').length, 10);
  assert.equal(catalog.recordings.filter((row) => row.speakerId === 'tuananh').length, 6);
  await writeFile(voice.csv, 'rank,word,english,per_million\n');
  await assert.rejects(() => importVietnamese(root, voice), /nonempty Vietnamese CSV/);
  assert.equal((await buildVietnameseCatalog(root)).recordings.length, 16);
});

test('the recovery CLI completes committed cleanup without changing the new catalog', async (t) => {
  const { root, voice } = await fixture(t);
  await importVietnamese(root, voice);
  const dir = path.join(root, '.audio-import-cache/vi/import-transaction');
  await mkdir(dir, { recursive: true });
  const obsolete = 'audio/vi/tuananh-retired.mp3';
  await writeFile(path.join(root, obsolete), Buffer.alloc(1200));
  const before = await readFile(path.join(root, 'data/content/vi/words.json'), 'utf8');
  await writeFile(
    path.join(dir, 'transaction.json'),
    JSON.stringify({
      version: 1,
      phase: 'committed',
      manifestExisted: true,
      files: [],
      obsolete: [obsolete],
    }),
  );
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('../../tools/content/vietnamese-cli.mjs', import.meta.url)),
        'import',
        '--recover',
      ],
      { cwd: root, encoding: 'utf8' },
    ),
  );
  assert.deepEqual(result, { recovered: true, outcome: 'completed' });
  await assert.rejects(() => readFile(path.join(root, obsolete)), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(root, 'data/content/vi/words.json'), 'utf8'), before);
  await buildVietnameseCatalog(root);
});
test('recovery rejects journal paths outside the Vietnamese audio directory', async (t) => {
  const { root } = await fixture(t);
  const dir = path.join(root, '.audio-import-cache/vi/import-transaction');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(root, 'keep.txt'), 'unchanged');
  await writeFile(
    path.join(dir, 'transaction.json'),
    JSON.stringify({
      version: 1,
      phase: 'committed',
      manifestExisted: true,
      files: [],
      obsolete: ['../../keep.txt'],
    }),
  );
  await assert.rejects(() => recoverVietnameseImport(root), /Invalid Vietnamese obsolete file/);
  assert.equal(await readFile(path.join(root, 'keep.txt'), 'utf8'), 'unchanged');
});

test('a malformed pending journal cannot be mistaken for an absent transaction', async (t) => {
  const { root } = await fixture(t);
  const dir = path.join(root, '.audio-import-cache/vi/import-transaction');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'transaction.json'), 'null');
  await assert.rejects(() => buildVietnameseCatalog(root), /Incomplete Vietnamese import/);
  await assert.rejects(
    () => recoverVietnameseImport(root),
    /Invalid Vietnamese import recovery journal/,
  );
  assert.equal(await readFile(path.join(dir, 'transaction.json'), 'utf8'), 'null');
});
