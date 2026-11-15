import fileOps from 'node:fs/promises';
import { withCurationLock } from './curation-lock.mjs';
import { validateCatalog } from '../../src/content/catalog.ts';
import { vietnamese } from '../../src/languages/profiles.ts';
import { readFile, readdir, mkdir, copyFile, unlink, lstat, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { atomicJSON, atomicText, readJSON } from '../lib/json.mjs';
import { splitTone } from '../../src/languages/vietnamese.ts';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceFile = (root) => path.join(root, 'data/content/vi/words.json');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const letters = { đ: 'd9', ă: 'a8', â: 'a6', ê: 'e6', ô: 'o6', ơ: 'o7', ư: 'u7' };
const digits = { sắc: 1, huyền: 2, hỏi: 3, ngã: 4, nặng: 5, ngang: '' };
// The guide's example for each tone is a common word whose syllables all carry that
// tone. Single syllables are avoided: a synthetic voice reads them less reliably.
const references = ['chú ý', 'hoàn toàn', 'đảm bảo', 'mãi mãi', 'hiện tại', 'hôm nay'];
export const VIETNAMESE_TONES = Object.freeze(Object.keys(digits));
export const emptyVietnamese = () => ({ version: 1, voices: {}, words: [] });

// File names and IDs use the VNI typing convention, which is unambiguous in ASCII.
export function asciiName(word) {
  return String(word)
    .split(' ')
    .map((syllable) => {
      const parts = splitTone(syllable);
      if (!parts) throw Error('Not a Vietnamese word: ' + word);
      return [...parts.base].map((ch) => letters[ch] ?? ch).join('') + digits[parts.tone];
    })
    .join('-');
}
const valid = (text) =>
  nonempty(text) &&
  text === text.normalize('NFC') &&
  text.split(' ').every((syllable) => splitTone(syllable));

export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (source[i + 1] === '"') field += source[++i];
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw Error('Unclosed quote in CSV.');
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  const [header, ...records] = rows;
  return records.map((record) => Object.fromEntries(header.map((key, i) => [key, record[i]])));
}

function validate(source) {
  if (
    source?.version !== 1 ||
    !source.voices ||
    typeof source.voices !== 'object' ||
    Array.isArray(source.voices) ||
    !Array.isArray(source.words)
  )
    throw Error('Unsupported Vietnamese word list.');
  for (const [id, voice] of Object.entries(source.voices))
    if (!/^[a-z0-9]+$/.test(id) || !nonempty(voice.name) || !nonempty(voice.generator))
      throw Error('Incomplete Vietnamese voice: ' + id);
  const seen = new Set();
  for (const row of source.words) {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw Error('Invalid Vietnamese row.');
    if (
      !row.frequency ||
      !Number.isSafeInteger(row.frequency.rank) ||
      row.frequency.rank < 1 ||
      (row.frequency.perMillion !== undefined &&
        (!Number.isFinite(row.frequency.perMillion) || row.frequency.perMillion < 0))
    )
      throw Error('Invalid Vietnamese frequency for ' + row.text);
    if (!valid(row.text)) throw Error('Invalid Vietnamese word: ' + row.text);
    const name = asciiName(row.text);
    if (seen.has(name)) throw Error('Duplicate Vietnamese word: ' + row.text);
    seen.add(name);
    if (row.gloss !== undefined && !nonempty(row.gloss))
      throw Error('Empty meaning for ' + row.text);
    if (!row.audio || Array.isArray(row.audio) || !Object.keys(row.audio).length)
      throw Error('Missing recordings for ' + row.text);
    for (const [voice, audio] of Object.entries(row.audio)) {
      if (!source.voices[voice]) throw Error('Unknown voice for ' + row.text + ': ' + voice);
      if (
        audio.file !== 'audio/vi/' + voice + '-' + name + '.mp3' ||
        !Number.isSafeInteger(audio.bytes) ||
        audio.bytes < 1000 ||
        !/^[0-9a-f]{64}$/.test(audio.sha256)
      )
        throw Error('Invalid recording for ' + row.text + ': ' + voice);
    }
  }
  return source;
}

// Imports one voice from a frequency list and a folder of `<rank>_<word>.mp3` clips.
// The import replaces that voice: its clips are copied unchanged, and clips of words
// that are no longer selected are removed. Other voices are left alone.

const transactionDir = (root) => path.resolve(root, '.audio-import-cache/vi/import-transaction');
const journalFile = (root) => path.join(transactionDir(root), 'transaction.json');
async function removeTransaction(root) {
  const dir = transactionDir(root);
  if (
    path.dirname(dir) !== path.resolve(root, '.audio-import-cache/vi') ||
    (await lstat(dir)).isSymbolicLink()
  )
    throw Error('Unsafe Vietnamese transaction directory.');
  await rm(dir, { recursive: true, force: true });
}
async function loadTransaction(root) {
  const bytes = await readFile(journalFile(root), 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  return bytes === null ? { exists: false } : { exists: true, journal: JSON.parse(bytes) };
}
async function ensureNoTransaction(root) {
  if ((await loadTransaction(root)).exists)
    throw Error('Incomplete Vietnamese import. Run npm run vietnamese:import -- --recover.');
}
async function recoverUnlocked(root) {
  const { exists, journal } = await loadTransaction(root);
  if (!exists) return { recovered: false };
  if (
    !journal ||
    typeof journal !== 'object' ||
    Array.isArray(journal) ||
    journal.version !== 1 ||
    !['installing', 'committed'].includes(journal.phase) ||
    !Array.isArray(journal.files) ||
    !Array.isArray(journal.obsolete) ||
    typeof journal.manifestExisted !== 'boolean'
  )
    throw Error('Invalid Vietnamese import recovery journal.');
  for (const row of journal.files)
    if (!row || !/^audio\/vi\/[a-z0-9-]+\.mp3$/.test(row.file) || typeof row.existed !== 'boolean')
      throw Error('Invalid Vietnamese recovery file.');
  for (const file of journal.obsolete)
    if (!/^audio\/vi\/[a-z0-9-]+\.mp3$/.test(file))
      throw Error('Invalid Vietnamese obsolete file.');
  if (journal.phase === 'installing') {
    for (const { file, existed } of journal.files) {
      const target = path.join(root, file);
      if (existed)
        await copyFile(path.join(transactionDir(root), 'old', path.basename(file)), target);
      else
        await unlink(target).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
    }
    if (journal.manifestExisted)
      await atomicText(
        sourceFile(root),
        await readFile(path.join(transactionDir(root), 'previous.json'), 'utf8'),
      );
    else
      await unlink(sourceFile(root)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
  } else {
    for (const file of journal.obsolete)
      await unlink(path.join(root, file)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
  await removeTransaction(root);
  return { recovered: true, outcome: journal.phase === 'installing' ? 'rolled back' : 'completed' };
}
export function recoverVietnameseImport(root) {
  return withCurationLock(root, 'vi', () => recoverUnlocked(root));
}
export function importVietnamese(root, options) {
  return withCurationLock(root, 'vi', () => importVietnameseUnlocked(root, options));
}

async function importVietnameseUnlocked(
  root,
  { csv, audio, voice, name, generator, minSyllables = 2, maxRank = Infinity },
) {
  if (!/^[a-z0-9]+$/.test(voice ?? '')) throw Error('Choose a voice ID, such as tuananh.');
  if (!Number.isInteger(minSyllables) || minSyllables < 1 || !(maxRank >= 1))
    throw Error('Choose a syllable count and a rank of at least 1.');
  await ensureNoTransaction(root);
  const source = validate(await readJSON(sourceFile(root), emptyVietnamese));
  if (name || generator || !source.voices[voice]) {
    if (
      !nonempty(name ?? source.voices[voice]?.name) ||
      !nonempty(generator ?? source.voices[voice]?.generator)
    )
      throw Error('A new voice needs --name and --generator.');
    source.voices[voice] = {
      name: name ?? source.voices[voice]?.name,
      generator: generator ?? source.voices[voice]?.generator,
    };
  }
  const clips = new Map(
    (await readdir(audio))
      .filter((file) => /^\d+_.+\.mp3$/i.test(file))
      .map((file) => [
        file
          .normalize('NFC')
          .replace(/^0+(?=\d)/, '')
          .toLowerCase(),
        file,
      ]),
  );
  const previous = new Map(source.words.map((row) => [row.text, row]));
  const words = new Map();
  const result = {
    voice,
    imported: 0,
    references: 0,
    short: 0,
    rare: 0,
    duplicates: [],
    missing: [],
  };
  const staged = new Map();
  const records = parseCSV(await readFile(csv, 'utf8'));
  if (
    !records.length ||
    !['rank', 'word', 'english', 'per_million'].every((field) => Object.hasOwn(records[0], field))
  )
    throw Error(
      'Expected a nonempty Vietnamese CSV with rank, word, english and per_million columns.',
    );
  for (const record of records) {
    const text = String(record.word ?? record.syllable ?? '').normalize('NFC'),
      rank = Number(record.rank),
      perMillion = Number(record.per_million);
    if (!valid(text) || !Number.isSafeInteger(rank) || rank < 1)
      throw Error('Invalid list row: ' + JSON.stringify(record));
    const reference = references.includes(text);
    if (!reference && text.split(' ').length < minSyllables) {
      result.short++;
      continue;
    }
    if (!reference && rank > maxRank) {
      result.rare++;
      continue;
    }
    // A list may repeat a word; its first, most frequent row is kept.
    if (words.has(text)) {
      result.duplicates.push(text);
      continue;
    }
    const clip = clips.get(rank + '_' + text + '.mp3');
    if (!clip) {
      result.missing.push(text);
      continue;
    }
    const bytes = await readFile(path.join(audio, clip));
    if (bytes.length < 1000) throw Error('Empty or invalid audio for ' + text);
    const file = 'audio/vi/' + voice + '-' + asciiName(text) + '.mp3';
    staged.set(file, bytes);
    words.set(text, {
      text,
      ...(nonempty(record.english) ? { gloss: record.english.trim() } : {}),
      frequency: { rank, ...(Number.isFinite(perMillion) ? { perMillion } : {}) },
      audio: {
        ...previous.get(text)?.audio,
        [voice]: { file, bytes: bytes.length, sha256: sha256(bytes) },
      },
    });
    result[reference ? 'references' : 'imported']++;
  }
  // Words this voice no longer covers keep their other voices.
  for (const row of source.words) {
    if (words.has(row.text)) continue;
    const { [voice]: dropped, ...others } = row.audio;
    if (Object.keys(others).length) words.set(row.text, { ...row, audio: others });
  }
  source.words = [...words.values()].sort(
    (a, b) => a.frequency.rank - b.frequency.rank || a.text.localeCompare(b.text),
  );
  validate(source);
  const dir = transactionDir(root);
  await mkdir(dir, { recursive: true });
  // A leftover staging directory without a journal has never changed live content.
  await removeTransaction(root);
  await mkdir(path.join(dir, 'new'), { recursive: true });
  await mkdir(path.join(dir, 'old'), { recursive: true });
  await mkdir(path.join(root, 'audio/vi'), { recursive: true });
  const previousManifest = await readFile(sourceFile(root), 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (previousManifest !== null) await writeFile(path.join(dir, 'previous.json'), previousManifest);
  const files = [];
  for (const [file, bytes] of staged) {
    await writeFile(path.join(dir, 'new', path.basename(file)), bytes);
    let existed = true;
    await copyFile(path.join(root, file), path.join(dir, 'old', path.basename(file))).catch(
      (error) => {
        if (error.code !== 'ENOENT') throw error;
        existed = false;
      },
    );
    files.push({ file, existed });
  }
  const kept = new Set(source.words.map((row) => row.audio[voice]?.file).filter(Boolean));
  const obsolete = (await readdir(path.join(root, 'audio/vi')))
    .filter(
      (file) =>
        file.startsWith(voice + '-') && file.endsWith('.mp3') && !kept.has('audio/vi/' + file),
    )
    .map((file) => 'audio/vi/' + file);
  const journal = {
    version: 1,
    phase: 'installing',
    manifestExisted: previousManifest !== null,
    files,
    obsolete,
  };
  await atomicJSON(journalFile(root), journal);
  try {
    for (const { file } of files)
      await fileOps.copyFile(path.join(dir, 'new', path.basename(file)), path.join(root, file));
    await atomicJSON(sourceFile(root), source);
    await atomicJSON(journalFile(root), { ...journal, phase: 'committed' });
  } catch (error) {
    try {
      await recoverUnlocked(root);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        'Vietnamese import failed; recovery is required. Run npm run vietnamese:import -- --recover.',
      );
    }
    throw error;
  }
  await recoverUnlocked(root);
  return result;
}

export function coverage(catalog) {
  const tones = Object.fromEntries(VIETNAMESE_TONES.map((tone) => [tone, 0]));
  for (const recording of catalog.recordings)
    if (!recording.referenceOnly)
      for (const tone of new Set(recording.realizedTones)) tones[tone]++;
  const missing = [];
  // One climb never repeats a recording, and its tones are drawn evenly.
  if (Object.values(tones).some((n) => n < 20)) missing.push('20 recordings of every tone');
  if (new Set(catalog.references.map((r) => r.tone)).size !== VIETNAMESE_TONES.length)
    missing.push('tone references');
  return { ready: !missing.length, tones, missing };
}

export function writeVietnameseCatalog(root) {
  return withCurationLock(root, 'vi', async () => {
    const catalog = await buildVietnameseCatalogUnlocked(root);
    await atomicText(path.join(root, 'catalogs/vi.json'), JSON.stringify(catalog) + '\n');
    return catalog;
  });
}
export function buildVietnameseCatalog(root) {
  return withCurationLock(root, 'vi', () => buildVietnameseCatalogUnlocked(root));
}
async function buildVietnameseCatalogUnlocked(root) {
  await ensureNoTransaction(root);
  const source = validate(await readJSON(sourceFile(root), emptyVietnamese));
  const checks = source.words.flatMap((row) =>
    Object.values(row.audio).map((audio) => ({ text: row.text, audio })),
  );
  // Verify independent files concurrently, then assemble in source order for stable catalogs.
  for (let start = 0; start < checks.length; start += 32) {
    const results = await Promise.allSettled(
      checks.slice(start, start + 32).map(async ({ text, audio }) => {
        const bytes = await readFile(path.join(root, audio.file)).catch((error) => {
          throw Error('Missing audio for ' + text + ': ' + error.message);
        });
        if (bytes.length !== audio.bytes || sha256(bytes) !== audio.sha256)
          throw Error('Audio differs from the word list: ' + audio.file);
      }),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  const catalog = {
    version: 2,
    language: 'vi',
    transcriptionSystem: 'quoc-ngu',
    entries: [],
    pronunciations: [],
    recordings: [],
    references: [],
  };
  for (const row of source.words) {
    const id = 'vi-' + asciiName(row.text),
      syllables = row.text
        .split(' ')
        .map((text) => ({ text, transcription: text, tone: splitTone(text).tone }));
    catalog.entries.push({
      id,
      forms: { default: row.text },
      gloss: row.gloss ?? '',
      metadata: { frequency: row.frequency },
    });
    catalog.pronunciations.push({
      id,
      entryId: id,
      kind: syllables.length === 1 ? 'syllable' : 'word',
      syllables,
    });
    for (const [voice, audio] of Object.entries(row.audio)) {
      catalog.recordings.push({
        id: 'vi-' + voice + '-' + asciiName(row.text),
        pronunciationId: id,
        audio: audio.file,
        realizedTones: syllables.map((s) => s.tone),
        speakerId: voice,
        author: source.voices[voice].name + ' · synthetic voice',
        synthetic: true,
        toneEvidence: {
          status: 'assumed',
          basis:
            'Tone inferred from Vietnamese spelling; synthetic audio has not been independently reviewed.',
        },
        conversion: 'Synthetic speech generated with ' + source.voices[voice].generator + '.',
      });
    }
  }
  for (const text of references) {
    const recording = catalog.recordings.find((r) => r.pronunciationId === 'vi-' + asciiName(text));
    if (recording)
      catalog.references.push({
        tone: splitTone(text.split(' ')[0]).tone,
        recordingId: recording.id,
        targetIndex: 0,
      });
  }
  catalog.availability = coverage(catalog);
  return validateCatalog(catalog, vietnamese, { publication: true });
}
