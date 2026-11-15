import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { digest } from '../../tools/content/listening-state.mjs';
import { syncRegistry } from '../../tools/catalog/catalog.mjs';
import { importDictionary, prepareMandarin } from '../../tools/content/mandarin.mjs';

export async function listeningFixture(t, language) {
  const root = await mkdtemp(path.join(tmpdir(), 'tone-tower-listening-'));
  t.after(async () => {
    assert.equal(path.dirname(root), tmpdir());
    assert.ok(path.basename(root).startsWith('tone-tower-listening-'));
    await rm(root, { recursive: true, force: true });
  });
  const put = async (name, value) => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(
      path.join(root, name),
      typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value),
    );
  };
  let recordings;
  if (language === 'yue') {
    recordings = Array.from({ length: 6 }, (_, i) => ({
      id: 'fu' + (i + 1),
      character: ['夫', '苦', '褲', '扶', '婦', '父'][i],
      jyutping: 'fu' + (i + 1),
      gloss: 'fixture ' + i,
      tone: i + 1,
      anchor: true,
      audio: 'audio/fu' + (i + 1) + '.mp3',
      source: 'https://commons.wikimedia.org/wiki/File:Fu' + (i + 1) + '.ogg',
      author: 'Speaker: Ada\nRecorder: Recorder',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      conversion: 'Fixture',
    }));
    recordings.push({
      ...recordings[0],
      id: 'other-voice',
      anchor: false,
      audio: 'audio/other-voice.mp3',
      author: 'Speaker: Ben\nRecorder: Someone',
      source: 'https://commons.wikimedia.org/wiki/File:Other.ogg',
    });
    recordings.push({
      ...recordings[1],
      id: 'unknown-voice',
      anchor: false,
      audio: 'audio/unknown-voice.mp3',
      author: 'Uploader',
    });
    recordings.push({
      ...recordings[0],
      id: 'first-voice',
      anchor: false,
      audio: 'audio/first-voice.mp3',
    });
    recordings.push({
      ...recordings[1],
      id: 'contrast',
      anchor: false,
      audio: 'audio/contrast.mp3',
    });
    for (const [i, row] of recordings.entries()) await put(row.audio, Buffer.alloc(1200, i));
    await put('data/audio/content.json', recordings);
    await put('data/audio/words.json', syncRegistry(recordings));
    await put('data/audio/corrections.json', { version: 1, words: {}, recordings: {} });
  } else {
    const texts = ['妈', '麻', '马', '骂', '妈妈', '你好', '行', '未知词'];
    recordings = texts.map((text, i) => {
      const bytes = Buffer.alloc(1200, i);
      const id = 'commons-' + (100 + i);
      return {
        id,
        language: 'cmn',
        sourceText: text,
        speaker: { id: i % 2 ? 'speaker-b' : 'speaker-a', name: 'Voice ' + (i % 2) },
        source: {
          pageUrl: 'https://commons.wikimedia.org/wiki/File:' + id,
          fileTimestamp: '2026-11-13T00:00:00Z',
        },
        original: { sha1: 'a'.repeat(40), sha256: digest(bytes), bytes: bytes.length },
        audio: {
          file: 'audio/cmn/' + id + '.mp3',
          sha256: digest(bytes),
          bytes: bytes.length,
          processing: 'Fixture',
        },
        attribution: {
          author: 'Voice',
          license: 'CC0',
          licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        },
      };
    });
    for (const [i, row] of recordings.entries()) await put(row.audio.file, Buffer.alloc(1200, i));
    await put('data/audio/collections/cmn/recordings.json', {
      version: 1,
      language: 'cmn',
      collectionId: 'cmn',
      recordings,
    });
    await put(
      'dictionary.txt',
      '#! date=2026-11-07T00:00:00Z\n媽 妈 [ma1] /mother/\n麻 麻 [ma2] /hemp/\n馬 马 [ma3] /horse/\n罵 骂 [ma4] /scold/\n媽媽 妈妈 [ma1 ma5] /mum/\n你好 你好 [ni3 hao3] /hello/\n行 行 [xing2] /walk/\n行 行 [hang2] /row/\n',
    );
    await importDictionary(root, path.join(root, 'dictionary.txt'));
    await prepareMandarin(root);
  }
  return { root, put, recordings };
}

export function decisionBatch(language, items, changes) {
  const recordings = {},
    previous = {};
  for (const [id, patch] of Object.entries(changes)) {
    const item = items.find((i) => i.recordingId === id);
    recordings[id] = {
      status: 'approved',
      reviewer: 'Fixture listener',
      reviewedAt: '2026-11-14T12:00:00Z',
      reason: 'Fixture listening decision',
      recordingSha256: item.recordingSha256,
      contentSha256: item.contentSha256,
      ...patch,
    };
    if (recordings[id].status === 'approved') {
      recordings[id].pronunciationId ??= item.pronunciationId ?? item.candidates[0].pronunciationId;
      recordings[id].realizedTones ??=
        item.realizedTones ?? item.candidates[0].syllables.map((s) => s.tone);
    }
    previous[id] = item.previousRevision;
  }
  return { version: 1, language, recordings, previous };
}
