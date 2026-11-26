import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { convertFilesToMP3 } from '../audio/convert.mjs';
import { validateInventory } from '../audio/inventory.mjs';
import { withAudioLock } from '../audio/lock.mjs';
import { loadShtooka, shtookaInventory } from '../audio/shtooka.mjs';
import { atomicJSON, replaceFile } from '../lib/json.mjs';
import { withCurationLock } from './curation-lock.mjs';
import { parseCedict, readingsByForm, sourceMatchedReadings } from './mandarin.mjs';
import { uniqueReading } from './mandarin-beta.mjs';

const run = promisify(execFile);
const packs = {
  congcong: {
    name: 'cmn-balm-congcong',
    speaker: 'Congcong',
    author: 'Congcong (speaker), Association Shtooka (© 2010)',
    license: 'CC BY 3.0 US',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/us/',
    sha256: 'b79df31c2c88519aa178cc2fb84b30da65ee99a7f1b287a60b51b8207ce1f05c',
  },
  tan: {
    name: 'cmn-caen-tan',
    speaker: 'Yue Tan',
    author: 'Yue Tan (© 2009), University of Caen / Shtooka',
    license: 'CC BY-SA 3.0 US',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/us/',
    sha256: '8f32aa1b1bd7fcc80711ebbceec5ea279e4d452fb251ed8dcdac14d63717b8ae',
  },
};
const collectionUrl = 'https://www.yojik.eu/audiocollections/';
const conversion =
  'Converted from the original Shtooka FLAC to MP3 with FFmpeg. Source credits are in the catalog.';
const digest = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');

function indexRows(text) {
  const sections = text.trim().split(/\r?\n\s*\r?\n/);
  if (sections.shift() !== '\\Swac_Index_Tags') throw Error('Invalid Shtooka tag index');
  const tags = (lines) => Object.fromEntries(lines.map((line) => line.split(/=(.*)/s).slice(0, 2)));
  const [header, ...global] = sections.shift().split(/\r?\n/);
  if (header !== '[GLOBAL]') throw Error('Missing Shtooka global tags');
  const defaults = tags(global);
  const seen = new Set();
  return sections.map((section) => {
    const [label, ...lines] = section.split(/\r?\n/);
    const filename = /^\[(cmn-[a-f0-9]{8}\.flac)\]$/.exec(label)?.[1];
    if (!filename || seen.has(filename))
      throw Error('Invalid or duplicate Shtooka source: ' + label);
    seen.add(filename);
    return { filename, ...defaults, ...tags(lines) };
  });
}

async function verifyArchive(archive, pack) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(archive)) hash.update(bytes);
  if (hash.digest('hex') !== pack.sha256)
    throw Error('Source archive checksum changed: ' + pack.name);
}

function flacDuration(bytes) {
  if (
    bytes.length < 42 ||
    bytes.toString('ascii', 0, 4) !== 'fLaC' ||
    (bytes[4] & 127) !== 0 ||
    bytes.readUIntBE(5, 3) !== 34
  )
    throw Error('Missing FLAC stream information');
  const stream = bytes.readBigUInt64BE(18);
  return Number(stream & 0xfffffffffn) / Number(stream >> 44n);
}

async function writeRecording(root, packId, { id, destination, row, original, duration }) {
  const pack = packs[packId];
  const audio = await readFile(destination);
  if (audio.length < 1000) throw Error('Converted audio is too short: ' + id);
  const file = 'audio/cmn/' + id + '.mp3';
  const pageUrl = collectionUrl + 'audiocollections.html#' + pack.name;
  const licenseEvidence = collectionUrl + 'detailled/' + pack.name + '/readme.txt';
  const recording = {
    id,
    language: 'cmn',
    sourceText: row.SWAC_TEXT,
    sourcePinyin: row.SWAC_PRON_PHON || undefined,
    speaker: { id: 'shtooka-' + packId, name: pack.speaker, evidence: pageUrl },
    attribution: { author: pack.author, license: pack.license, licenseUrl: pack.licenseUrl },
    source: {
      provider: 'shtooka',
      pageUrl,
      fileUrl: collectionUrl + 'archives/' + pack.name + '_flac.tar.xz',
      filename: row.filename,
      fileTimestamp: row.SWAC_TECH_DATE,
      archiveSha256: pack.sha256,
      licenseEvidence,
    },
    original: {
      sha1: digest('sha1', original),
      sha256: digest('sha256', original),
      bytes: original.length,
      mime: 'audio/flac',
    },
    audio: {
      file,
      sha256: digest('sha256', audio),
      bytes: audio.length,
      duration,
      processing: conversion,
    },
  };
  await replaceFile(destination, path.join(root, file));
  return recording;
}

async function convertBatch(files, staging) {
  if (!files.length) return files;
  try {
    await convertFilesToMP3(
      files.map(({ input, destination }) => ({
        original: path.relative(staging, input),
        destination: path.relative(staging, destination),
      })),
      staging,
    );
    return files;
  } catch (error) {
    if (!error.stderr?.includes('Invalid data found when processing input')) throw error;
    if (files.length === 1) {
      console.warn('Skipping an undecodable source: ' + files[0].row.filename);
      return [];
    }
    const midpoint = Math.floor(files.length / 2);
    return [
      ...(await convertBatch(files.slice(0, midpoint), staging)),
      ...(await convertBatch(files.slice(midpoint), staging)),
    ];
  }
}

async function importPack(root, packId, archive, byForm, saved, save) {
  const pack = packs[packId];
  await verifyArchive(archive, pack);
  const tempRoot = path.resolve(tmpdir());
  const staging = await mkdtemp(path.join(tempRoot, 'tone-tower-shtooka-'));
  if (
    path.dirname(staging) !== tempRoot ||
    !path.basename(staging).startsWith('tone-tower-shtooka-')
  )
    throw Error('Unexpected Shtooka staging directory');
  try {
    await run('tar', ['-xf', archive, '-C', staging], { timeout: 240000, windowsHide: true });
    const index = await readFile(path.join(staging, 'flac/index.tags.txt'), 'utf8');
    const rows = indexRows(index);
    const candidates = rows.filter((row) => {
      if (
        !/^\p{Script=Han}{1,4}$/u.test(row.SWAC_TEXT) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.SWAC_TECH_DATE)
      )
        return false;
      return uniqueReading(
        sourceMatchedReadings(byForm.get(row.SWAC_TEXT) ?? [], row.SWAC_PRON_PHON || undefined),
      );
    });
    console.log(
      pack.speaker +
        ': ' +
        candidates.length +
        ' dictionary matches from ' +
        rows.length +
        ' source clips.',
    );
    let added = 0,
      skipped = 0;
    const batchSize = 72;
    for (let offset = 0; offset < candidates.length; offset += batchSize) {
      const batch = await Promise.all(
        candidates.slice(offset, offset + batchSize).map(async (row) => {
          const id = 'shtooka-' + packId + '-' + row.filename.slice(4, -5);
          const previous = saved.get(id);
          if (previous?.audio.processing === conversion) {
            const bytes = await readFile(path.join(root, previous.audio.file)).catch((error) => {
              if (error.code !== 'ENOENT') throw error;
            });
            if (bytes && digest('sha256', bytes) === previous.audio.sha256) return undefined;
          }
          const input = path.join(staging, 'flac', row.filename);
          const original = await readFile(input);
          const duration = flacDuration(original);
          if (!(duration > 0.1 && duration < 9.95)) return null;
          return {
            id,
            row,
            original,
            duration,
            input,
            destination: path.join(staging, id + '.mp3'),
          };
        }),
      );
      const files = batch.filter((item) => item?.input);
      const decoded = await convertBatch(files, staging);
      for (const recording of await Promise.all(
        decoded.map((item) => writeRecording(root, packId, item)),
      )) {
        if (!saved.has(recording.id)) added++;
        saved.set(recording.id, recording);
      }
      skipped += batch.filter((item) => item === null).length + files.length - decoded.length;
      const processed = Math.min(offset + batchSize, candidates.length);
      if (processed % (batchSize * 10) === 0 || processed === candidates.length) {
        await save();
        console.log(pack.speaker + ': checked ' + processed + ' clips.');
      }
    }
    return {
      speaker: pack.speaker,
      source: rows.length,
      matched: candidates.length,
      added,
      skipped,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

const { values } = parseArgs({
  options: { congcong: { type: 'string' }, tan: { type: 'string' } },
});
if (!Object.keys(values).length) throw Error('Specify --congcong or --tan with a source archive.');
const root = process.cwd();
const results = await withAudioLock(
  async () =>
    withCurationLock(root, 'cmn', async () => {
      const dictionary = gunzipSync(
        await readFile(path.join(root, '.audio-import-cache/cedict-source.txt.gz')),
      );
      const byForm = readingsByForm(parseCedict(dictionary.toString('utf8')), (row) => [
        row.simplified,
        row.traditional,
      ]);
      const inventory = await loadShtooka(root);
      const saved = new Map(inventory.recordings.map((row) => [row.id, row]));
      await mkdir(path.join(root, 'audio/cmn'), { recursive: true });
      const reports = [];
      const save = async () => {
        inventory.recordings = [...saved.values()].sort((a, b) => a.id.localeCompare(b.id));
        validateInventory(inventory, 'cmn', 'cmn', { shtooka: true });
        await atomicJSON(shtookaInventory(root), inventory);
      };
      for (const [pack, archive] of Object.entries(values))
        reports.push(await importPack(root, pack, path.resolve(archive), byForm, saved, save));
      return reports;
    }),
  root,
);
console.log(JSON.stringify(results, null, 2));
