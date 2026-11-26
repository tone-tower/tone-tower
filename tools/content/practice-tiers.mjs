import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateCatalog } from '../../src/content/catalog.ts';
import { formatPinyin } from '../../src/languages/pinyin.ts';
import { mandarin } from '../../src/languages/profiles.ts';
import { readJSON } from '../lib/json.mjs';
import { writeCurationJSON } from './curation-json.mjs';
import { withCurationLock } from './curation-lock.mjs';

const sources = {
  standard2021: {
    edition: 'GF 0025-2021',
    url: 'https://nihaolearn.com/downloads/hsk-3.0-all.json',
    sha256: '837633ca2935c6b6570acba89ade52216b28f0ab5ba990d69de748bc74f3dc3b',
    rows: 10969,
    maxLevel: 7,
  },
  hsk20: {
    edition: 'HSK 2.0 (2009)',
    url: 'https://nihaolearn.com/downloads/hsk-2.0-all.json',
    sha256: '3c36e82fd09bc3513203428857f2caa4b95159a5fc2d3e776683c64e31b815f7',
    rows: 4991,
    maxLevel: 6,
  },
};

const tierFile = (root) => path.join(root, 'data/content/cmn/practice-tiers.json');
const tiers = ['easy', 'normal', 'hard'];
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && Boolean(value.trim());
const validLevel = (value, source) =>
  Number.isInteger(value) && value >= 1 && value <= source.maxLevel;
const validAssessment = (value) =>
  isRecord(value) && tiers.includes(value.tier) && isText(value.reason);

function validateSnapshot(snapshot) {
  if (
    snapshot?.version !== 1 ||
    !Object.entries(sources).every(([name, source]) =>
      Object.entries(source).every(([field, value]) => snapshot.sources?.[name]?.[field] === value),
    ) ||
    !isRecord(snapshot.entries)
  )
    throw Error('Invalid Mandarin practice tier snapshot.');
  for (const [id, entry] of Object.entries(snapshot.entries)) {
    if (
      !isText(id) ||
      !isRecord(entry) ||
      !isText(entry.form) ||
      !Array.isArray(entry.readings) ||
      !entry.readings.length ||
      !entry.readings.every(isText) ||
      !tiers.includes(entry.tier) ||
      (entry.standard2021 !== undefined && !validLevel(entry.standard2021, sources.standard2021)) ||
      (entry.hsk20 !== undefined && !validLevel(entry.hsk20, sources.hsk20)) ||
      (entry.assessment !== undefined &&
        (!validAssessment(entry.assessment) || entry.assessment.tier !== entry.tier))
    )
      throw Error('Invalid Mandarin practice tier for ' + id);
  }
  return snapshot;
}

export async function loadPracticeTiers(root) {
  const snapshot = await readJSON(tierFile(root), () => null);
  return snapshot === null ? null : validateSnapshot(snapshot);
}

function readingKey(pinyin) {
  return pinyin
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s'’/-]/g, '');
}

function playableReadings(catalog) {
  const playable = new Set(
    catalog.recordings.filter((row) => !row.referenceOnly).map((row) => row.pronunciationId),
  );
  const byEntry = new Map();
  for (const { id, entryId, syllables } of catalog.pronunciations) {
    if (!playable.has(id)) continue;
    if (!byEntry.has(entryId)) byEntry.set(entryId, new Set());
    const transcription = syllables.map((syllable) => syllable.transcription).join(' ');
    byEntry.get(entryId).add(readingKey(formatPinyin(transcription)));
  }
  return new Map([...byEntry].map(([id, readings]) => [id, [...readings].sort()]));
}

function evidenceKey(form, pinyin) {
  return JSON.stringify([form, pinyin]);
}

async function loadEvidence(file, source) {
  const bytes = await readFile(file);
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256)
    throw Error('The download does not match the pinned vocabulary for ' + source.edition);
  const rows = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(rows) || rows.length !== source.rows)
    throw Error('Invalid practice vocabulary evidence for ' + source.edition);
  const index = new Map();
  for (const row of rows) {
    if (!isText(row?.word) || !isText(row?.pinyin) || !validLevel(row.level, source))
      throw Error('Invalid vocabulary evidence row in ' + source.edition);
    const key = evidenceKey(row.word, readingKey(row.pinyin));
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(row.level);
  }
  return index;
}

function matchedLevel(index, key) {
  const levels = index.get(key);
  return levels?.size === 1 ? levels.values().next().value : undefined;
}

function fromOlderLists(standard2021, hsk20) {
  if (standard2021 !== undefined)
    return standard2021 <= 3 ? 'easy' : standard2021 <= 6 ? 'normal' : 'hard';
  return hsk20 === undefined || hsk20 === 6 ? 'hard' : hsk20 <= 3 ? 'easy' : 'normal';
}

function unchangedReading(previous, form, readings) {
  return previous?.form === form && JSON.stringify(previous.readings) === JSON.stringify(readings);
}

export function importPracticeTiers(root, { standard, legacy, assessments }) {
  return withCurationLock(root, 'cmn', async () => {
    const [standard2021, hsk20, previous, edits, rawCatalog] = await Promise.all([
      loadEvidence(standard, sources.standard2021),
      loadEvidence(legacy, sources.hsk20),
      loadPracticeTiers(root),
      assessments ? readJSON(assessments) : {},
      readJSON(path.join(root, 'catalogs/cmn.json')),
    ]);
    const catalog = validateCatalog(rawCatalog, mandarin);
    if (!catalog.hskSource) throw Error('Build the Mandarin catalog with HSK 3.0 labels first.');
    if (!isRecord(edits) || !Object.values(edits).every(validAssessment))
      throw Error('Expected practice tier assessments keyed by vocabulary ID.');

    const readingsByEntry = playableReadings(catalog);
    const entries = {};
    for (const entry of catalog.entries) {
      const readings = readingsByEntry.get(entry.id);
      if (!readings || entry.metadata?.hsk) continue;
      const form = entry.forms.simplified ?? entry.forms.default;
      const key = readings.length === 1 ? evidenceKey(form, readings[0]) : undefined;
      const olderStandard = matchedLevel(standard2021, key);
      const olderExam = matchedLevel(hsk20, key);
      const existing = previous?.entries[entry.id];
      const assessment =
        (Object.hasOwn(edits, entry.id) ? edits[entry.id] : undefined) ??
        (unchangedReading(existing, form, readings) ? existing.assessment : undefined);
      entries[entry.id] = {
        form,
        readings,
        tier: assessment?.tier ?? fromOlderLists(olderStandard, olderExam),
        standard2021: olderStandard,
        hsk20: olderExam,
        assessment,
      };
    }
    for (const id of Object.keys(edits)) {
      if (!Object.hasOwn(entries, id)) throw Error('No untagged playable vocabulary entry: ' + id);
    }
    const snapshot = validateSnapshot({ version: 1, sources, entries });
    await writeCurationJSON(tierFile(root), snapshot);
    return {
      entries: Object.keys(entries).length,
      tiers: practiceTierCoverage(Object.values(entries), 'tier'),
    };
  });
}

export function withPracticeTiers(catalog, snapshot) {
  if (!snapshot) return catalog;
  if (!catalog.hskSource) throw Error('Practice tiers require the HSK 3.0 source snapshot.');
  const byEntry = playableReadings(catalog);
  const entries = catalog.entries.map((entry) => {
    const readings = byEntry.get(entry.id);
    if (!readings) return entry;
    const hsk = entry.metadata?.hsk?.level;
    if (hsk)
      return {
        ...entry,
        practiceTier: hsk === '7-9' ? 'hard' : Number(hsk) <= 3 ? 'easy' : 'normal',
      };
    const assignment = snapshot.entries[entry.id];
    const form = entry.forms.simplified ?? entry.forms.default;
    return {
      ...entry,
      practiceTier: unchangedReading(assignment, form, readings) ? assignment.tier : 'hard',
    };
  });
  return { ...catalog, entries };
}

export function practiceTierCoverage(entries, field = 'practiceTier') {
  const counts = { easy: 0, normal: 0, hard: 0 };
  for (const entry of entries) if (entry[field]) counts[entry[field]]++;
  return counts;
}
