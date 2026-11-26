import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatPinyin } from '../../src/languages/pinyin.ts';
import { atomicJSON, readJSON } from '../lib/json.mjs';
import { withCurationLock } from './curation-lock.mjs';

const hskSource = {
  scheme: 'hsk-3.0',
  edition: '2025-11-exam-syllabus',
  attribution: 'HSK 3.0 word list, all levels by Gushi',
  url: 'https://gushichinese.com/hsk-3.0/downloads',
  downloadUrl: 'https://gushichinese.com/hsk-3.0/downloads/hsk-3.0-words-all.json',
  snapshotSha256: 'f8eac663ac2d973251663d5ca93fe149a3bffeda2b30c4c458a19b8145aed257',
  snapshotDate: '2026-11-26',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const hskFile = (root) => path.join(root, 'data/content/cmn/hsk.json');
const levelPattern = /^(?:[1-6]|7-9)$/;
const wordCount = 11000;

function validateSnapshot(snapshot) {
  if (
    snapshot?.version !== 1 ||
    !Object.entries(hskSource).every(([key, value]) => snapshot.source?.[key] === value) ||
    !Array.isArray(snapshot.words) ||
    snapshot.words.length !== wordCount
  )
    throw Error('Invalid Mandarin HSK source snapshot.');
  for (const row of snapshot.words) {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw Error('Invalid Mandarin HSK source row.');
    const { form, pinyin, tones, level } = row;
    if (
      typeof form !== 'string' ||
      !/^\p{Script=Han}+$/u.test(form) ||
      typeof pinyin !== 'string' ||
      !pinyin.trim() ||
      typeof tones !== 'string' ||
      !/^[1-5](?: [1-5])*$/.test(tones) ||
      typeof level !== 'string' ||
      !levelPattern.test(level)
    )
      throw Error('Invalid Mandarin HSK source row for ' + form);
  }
  return snapshot;
}

export async function loadMandarinHsk(root) {
  try {
    return validateSnapshot(await readJSON(hskFile(root)));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function importMandarinHsk(root, file) {
  return withCurationLock(root, 'cmn', async () => {
    const bytes = await readFile(file);
    if (createHash('sha256').update(bytes).digest('hex') !== hskSource.snapshotSha256)
      throw Error('The HSK download does not match the pinned Gushi snapshot.');
    const data = JSON.parse(bytes.toString('utf8'));
    if (data?.kind !== 'words' || !Array.isArray(data.data))
      throw Error('Invalid Gushi vocabulary export.');
    const words = data.data.map((row) => {
      if (!Number.isInteger(row?.level) || row.level < 1 || row.level > 9)
        throw Error('Invalid Gushi vocabulary level.');
      return {
        form: row.hanzi,
        pinyin: row.pinyin,
        tones: row.tones,
        level: row.level <= 6 ? String(row.level) : '7-9',
      };
    });
    const snapshot = validateSnapshot({ version: 1, source: hskSource, words });
    await atomicJSON(hskFile(root), snapshot);
    return { words: words.length, source: hskSource };
  });
}

function wordKey(form, pinyin, tones) {
  const reading = pinyin
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s'’\-]/g, '');
  return JSON.stringify([form, reading, tones]);
}

export function withHskLabels(catalog, snapshot) {
  if (!snapshot) return catalog;
  const sourceRows = new Map();
  for (const [index, { form, pinyin, tones, level }] of snapshot.words.entries()) {
    const key = wordKey(form, pinyin, tones);
    if (!sourceRows.has(key)) sourceRows.set(key, []);
    sourceRows.get(key).push({ sourceRow: index + 1, level });
  }
  const playable = new Set(
    catalog.recordings.filter((row) => !row.referenceOnly).map((row) => row.pronunciationId),
  );
  const pronunciations = Map.groupBy(
    catalog.pronunciations.filter((row) => playable.has(row.id)),
    (row) => row.entryId,
  );
  const entries = catalog.entries.map((entry) => {
    const form = entry.forms.simplified;
    if (!form) return entry;
    const keys = new Set(
      (pronunciations.get(entry.id) ?? []).map(({ syllables }) =>
        wordKey(
          form,
          formatPinyin(syllables.map((syllable) => syllable.transcription).join(' ')),
          syllables.map((syllable) => syllable.tone).join(' '),
        ),
      ),
    );
    if (keys.size !== 1) return entry;
    const candidates = sourceRows.get(keys.values().next().value) ?? [];
    if (new Set(candidates.map(({ level }) => level)).size !== 1) return entry;
    return {
      ...entry,
      metadata: {
        ...entry.metadata,
        hsk: {
          level: candidates[0].level,
          sourceRows: candidates.map(({ sourceRow }) => sourceRow),
          match: 'form-and-pinyin',
        },
      },
    };
  });
  return { ...catalog, entries, hskSource: snapshot.source };
}

export function hskCoverage(catalog) {
  const counts = Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7-9'].map((level) => [level, 0]),
  );
  for (const entry of catalog.entries) {
    const level = entry.metadata?.hsk?.level;
    if (level) counts[level]++;
  }
  return counts;
}
