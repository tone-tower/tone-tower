import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJSON, readJSON, replaceFile } from '../lib/json.mjs';
import { withFileLock } from '../lib/lock.mjs';
import { withAudioLock } from '../audio/lock.mjs';
import { audioPaths } from '../audio/paths.mjs';
import { commonsClient } from '../audio/commons.mjs';
import { commonsQuery, inspectRecording } from '../audio/collection-commons.mjs';
import { validateMP3 } from '../audio/convert.mjs';
import { validateCatalog } from '../../src/content/catalog.ts';
import { mandarin } from '../../src/languages/profiles.ts';

export const toneSource = {
  title: 'File:FourMandarinTones.ogg',
  sha1: 'db81e637a2f1908eacb7244845fbf9162e410ec8',
  pageUrl: 'https://commons.wikimedia.org/wiki/File:FourMandarinTones.ogg',
};
export const toneExampleForms = [
  ['妈', '媽'],
  ['麻', '麻'],
  ['马', '馬'],
  ['骂', '罵'],
];
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const registryPath = (root) => path.join(root, 'data/audio/mandarin-tone-examples.json');
const cachePath = (root) => path.join(root, '.audio-import-cache/cmn-tone-examples');
const emptyCatalog = () => ({
  version: 2,
  language: 'cmn',
  transcriptionSystem: 'pinyin',
  entries: [],
  pronunciations: [],
  recordings: [],
  references: [],
});

function validateSource(source) {
  let media;
  try {
    media = new URL(source?.source?.fileUrl);
  } catch {
    throw Error('Invalid tone-example media URL.');
  }
  if (
    !Number.isSafeInteger(source?.source?.pageid) ||
    source.source.pageid < 1 ||
    source.id !== 'commons-' + source.source.pageid ||
    source.language !== 'cmn' ||
    source.source.title !== toneSource.title ||
    source.source.pageUrl !== toneSource.pageUrl ||
    media.protocol !== 'https:' ||
    media.hostname !== 'upload.wikimedia.org' ||
    media.username ||
    media.password ||
    source.original?.sha1 !== toneSource.sha1 ||
    !['application/ogg', 'audio/ogg'].includes(source.original.mime) ||
    !Number.isSafeInteger(source.original.bytes) ||
    source.original.bytes < 1 ||
    source.original.bytes > 1000000 ||
    !Number.isFinite(Date.parse(source.source.fileTimestamp)) ||
    source.attribution?.author !== 'Wolfdog' ||
    source.attribution.license !== 'CC-BY-SA-4.0' ||
    source.attribution.licenseUrl !== 'https://creativecommons.org/licenses/by-sa/4.0/'
  )
    throw Error('Invalid pinned Mandarin tone-example source.');
}

export async function loadToneExamples(root) {
  const registry = await readJSON(registryPath(root), null);
  if (registry === null) return null;
  validateSource(registry.source);
  if (
    registry.version !== 1 ||
    registry.source?.source?.title !== toneSource.title ||
    registry.source?.source?.pageUrl !== toneSource.pageUrl ||
    registry.source?.original?.sha1 !== toneSource.sha1 ||
    registry.source?.attribution?.license !== 'CC-BY-SA-4.0' ||
    registry.source?.attribution?.licenseUrl !==
      'https://creativecommons.org/licenses/by-sa/4.0/' ||
    !Array.isArray(registry.segments) ||
    registry.segments.length !== 4
  )
    throw Error('Invalid Mandarin tone-example source.');
  const catalog = emptyCatalog();
  for (const [index, segment] of registry.segments.entries()) {
    const tone = index + 1,
      recording = segment?.recording;
    if (
      segment?.tone !== tone ||
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      segment.start < 0 ||
      segment.end <= segment.start ||
      segment.end > 6 ||
      (index > 0 && segment.start < registry.segments[index - 1].end) ||
      recording?.id !== registry.source.id + '-ma' + tone ||
      recording?.audio !==
        'audio/cmn/' + recording.id + '-' + segment.audio?.sha256?.slice(0, 12) + '.mp3' ||
      recording.referenceOnly !== true ||
      recording.speakerId !== 'commons-user-Wolfdog' ||
      recording.source !== toneSource.pageUrl ||
      recording.author !== registry.source.attribution.author ||
      recording.license !== registry.source.attribution.license ||
      recording.licenseUrl !== registry.source.attribution.licenseUrl ||
      recording.realizedTones?.length !== 1 ||
      recording.realizedTones[0] !== tone ||
      recording.toneEvidence?.status !== 'assumed' ||
      segment.pronunciation?.syllables?.length !== 1 ||
      segment.pronunciation.syllables[0].transcription !== 'ma' + tone ||
      segment.pronunciation.syllables[0].tone !== tone ||
      segment.entry?.forms?.simplified !== toneExampleForms[index][0] ||
      segment.entry?.forms?.traditional !== toneExampleForms[index][1] ||
      segment.pronunciation.syllables[0].forms?.simplified !== toneExampleForms[index][0] ||
      segment.pronunciation.syllables[0].forms?.traditional !== toneExampleForms[index][1] ||
      !/^[a-f0-9]{64}$/.test(segment.audio?.sha256 || '') ||
      !Number.isSafeInteger(segment.audio?.bytes) ||
      segment.audio.bytes < 1000
    )
      throw Error('Invalid Mandarin tone-example segment.');
    const bytes = await readFile(path.join(root, recording.audio));
    if (bytes.length !== segment.audio.bytes || digest(bytes) !== segment.audio.sha256)
      throw Error('Mandarin tone-example audio failed integrity validation: ' + recording.id);
    catalog.entries.push(segment.entry);
    catalog.pronunciations.push(segment.pronunciation);
    catalog.recordings.push(recording);
    catalog.references.push({ tone, recordingId: recording.id, targetIndex: 0 });
  }
  validateCatalog(catalog, mandarin, { publication: true });
  return catalog;
}

async function downloadSource(root, signal) {
  const cache = cachePath(root);
  await mkdir(cache, { recursive: true });
  const request = commonsClient(audioPaths(root).state, signal);
  let source = await readJSON(path.join(cache, 'source.json'), null);
  if (!source) {
    const response = await request(
      commonsQuery({
        titles: toneSource.title,
        prop: 'imageinfo|templates',
        iiprop: 'url|extmetadata|sha1|size|timestamp|mime|mediatype|user',
        tllimit: '500',
      }),
    );
    const result = await response.json();
    const page = Object.values(result.query?.pages || {})[0];
    if (!page || page.title !== toneSource.title) throw Error('Missing tone-example source.');
    const info = page.imageinfo?.[0];
    // Commons reports this Ogg audio container as application/ogg. Inspect it as
    // audio only when Commons also identifies its media type as AUDIO, retaining
    // the original MIME in the saved evidence.
    const inspectedPage =
      info?.mime === 'application/ogg' && info.mediatype === 'AUDIO'
        ? { ...page, imageinfo: [{ ...info, mime: 'audio/ogg' }] }
        : page;
    source = inspectRecording(
      inspectedPage,
      { pageid: page.pageid, text: 'mā má mǎ mà' },
      {
        language: 'cmn',
        selection: { maxOriginalBytes: 1000000, licenses: ['CC-BY-SA-4.0'] },
      },
    );
    source.original.mime = info.mime;
    validateSource(source);
    if (source.original.sha1 !== toneSource.sha1 || source.attribution.author !== 'Wolfdog')
      throw Error('Tone-example source changed; inspect before importing a new version.');
    await atomicJSON(path.join(cache, 'source.json'), source);
  }
  validateSource(source);
  const original = path.join(cache, 'original.ogg');
  let bytes = await readFile(original).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!bytes) {
    const response = await request(source.source.fileUrl);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== source.original.bytes || digest(bytes, 'sha1') !== toneSource.sha1)
      throw Error('Tone-example original checksum mismatch.');
    await writeFile(original, bytes);
  }
  if (bytes.length !== source.original.bytes || digest(bytes, 'sha1') !== toneSource.sha1)
    throw Error('Cached tone-example original checksum mismatch.');
  return {
    original,
    source: { ...source, original: { ...source.original, sha256: digest(bytes) } },
  };
}

export async function importToneExamples({ root = process.cwd(), inspect = false, signal } = {}) {
  return withAudioLock(async () => {
    const { original, source } = await downloadSource(root, signal);
    if (inspect) {
      const result = spawnSync(
        'ffmpeg',
        [
          '-hide_banner',
          '-i',
          original,
          '-af',
          'silencedetect=noise=-35dB:d=0.15',
          '-f',
          'null',
          '-',
        ],
        { encoding: 'utf8', windowsHide: true },
      );
      if (result.error || result.status !== 0)
        throw Error('Could not inspect the tone-example audio.');
      return { original, source, analysis: result.stderr };
    }
    return withFileLock(
      async () => {
        const configuration = await readJSON(
          path.join(root, 'data/content/cmn/tone-example-segments.json'),
        );
        if (
          configuration.version !== 1 ||
          configuration.sourceSha1 !== toneSource.sha1 ||
          !Array.isArray(configuration.segments) ||
          configuration.segments.length !== 4
        )
          throw Error('Invalid tone-example segment configuration.');
        const dictionary = await readJSON(path.join(root, 'data/content/cmn/dictionary.json'));
        if (
          dictionary?.version !== 1 ||
          !Array.isArray(dictionary.entries) ||
          dictionary.source?.name !== 'CC-CEDICT' ||
          !/^[a-f0-9]{64}$/.test(dictionary.source?.sha256 || '') ||
          dictionary.source?.license !== 'CC-BY-SA-4.0'
        )
          throw Error('Invalid pinned dictionary evidence.');
        const meanings = ['mother', 'hemp', 'horse', 'to scold'];
        const forms = toneExampleForms;
        const segments = [];
        for (const [index, span] of configuration.segments.entries()) {
          const tone = index + 1;
          if (
            !span ||
            !Number.isFinite(span.start) ||
            !Number.isFinite(span.end) ||
            span.start < 0 ||
            span.end <= span.start ||
            span.end > 6 ||
            (index > 0 && span.start < configuration.segments[index - 1].end)
          )
            throw Error('Invalid tone-example cut points.');
          const dictionaryEntry = dictionary.entries.find(
            (entry) =>
              entry.simplified === forms[index][0] &&
              entry.traditional === forms[index][1] &&
              entry.reading === 'ma' + tone,
          );
          if (!dictionaryEntry) throw Error('Missing CC-CEDICT evidence for ma' + tone);
          const id = source.id + '-ma' + tone;
          const entryId = 'guide-' + id;
          const entryForms = {
            default: forms[index][0],
            simplified: forms[index][0],
            traditional: forms[index][1],
          };
          const mp3 = execFileSync(
            'ffmpeg',
            [
              '-v',
              'error',
              '-i',
              original,
              '-ss',
              String(span.start),
              '-t',
              String(span.end - span.start),
              '-map_metadata',
              '-1',
              '-f',
              'mp3',
              '-codec:a',
              'libmp3lame',
              '-q:a',
              '4',
              'pipe:1',
            ],
            { windowsHide: true, maxBuffer: 1000000 },
          );
          const audioHash = digest(mp3);
          const audioFile = 'audio/cmn/' + id + '-' + audioHash.slice(0, 12) + '.mp3';
          const destination = path.join(root, audioFile),
            temporary = destination + '.tmp-' + process.pid;
          await mkdir(path.dirname(destination), { recursive: true });
          try {
            await writeFile(temporary, mp3);
            const duration = await validateMP3(temporary, { minDuration: 0.15, maxDuration: 2 });
            await replaceFile(temporary, destination);
            segments.push({
              tone,
              start: span.start,
              end: span.end,
              entry: {
                id: entryId,
                forms: entryForms,
                gloss: meanings[index],
                dictionarySource: {
                  ...dictionary.source,
                  entryId: dictionaryEntry.id,
                  raw: dictionaryEntry.raw,
                },
              },
              pronunciation: {
                id: entryId,
                entryId,
                kind: 'syllable',
                syllables: [{ transcription: 'ma' + tone, tone, forms: entryForms }],
              },
              recording: {
                id,
                pronunciationId: entryId,
                audio: audioFile,
                realizedTones: [tone],
                toneTargets: [0],
                referenceOnly: true,
                source: source.source.pageUrl,
                author: source.attribution.author,
                license: source.attribution.license,
                licenseUrl: source.attribution.licenseUrl,
                speakerId: 'commons-user-Wolfdog',
                toneEvidence: {
                  status: 'assumed',
                  basis:
                    'Source-labelled four-tone teaching sequence; excerpts selected without changing pitch or speed. Not a human listening review.',
                },
                conversion:
                  'Excerpt ' +
                  span.start +
                  '–' +
                  span.end +
                  ' s from FourMandarinTones.ogg by Wolfdog; trimmed and converted to MP3 with FFmpeg. Pitch and speed unchanged. Excerpt licensed CC-BY-SA-4.0.',
              },
              audio: { bytes: mp3.length, sha256: audioHash, duration },
            });
          } finally {
            await unlink(temporary).catch((error) => {
              if (error.code !== 'ENOENT') throw error;
            });
          }
        }
        await atomicJSON(registryPath(root), { version: 1, source, segments });
        await loadToneExamples(root);
        return {
          source: source.source.pageUrl,
          recordings: segments.map((segment) => segment.recording.id),
        };
      },
      path.join(root, '.audio-import-cache/cmn/curation.lock'),
      { label: 'Mandarin curation' },
    );
  }, root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !['inspect', 'import'].includes(process.argv[2]))
    throw Error('Use inspect or import.');
  const abort = new AbortController();
  const stop = () => abort.abort(new DOMException('Stopped', 'AbortError'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    console.log(
      JSON.stringify(
        await importToneExamples({ inspect: process.argv[2] === 'inspect', signal: abort.signal }),
        null,
        2,
      ),
    );
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
