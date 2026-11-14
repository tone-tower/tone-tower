import { readFile, readdir, mkdir, copyFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { atomicJSON, readJSON } from '../lib/json.mjs';
import { splitTone } from '../../src/languages/vietnamese.js';

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
    Array.isArray(source.voices) ||
    !Array.isArray(source.words)
  )
    throw Error('Unsupported Vietnamese word list.');
  for (const [id, voice] of Object.entries(source.voices))
    if (!/^[a-z0-9]+$/.test(id) || !nonempty(voice.name) || !nonempty(voice.generator))
      throw Error('Incomplete Vietnamese voice: ' + id);
  const seen = new Set();
  for (const row of source.words) {
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
export async function importVietnamese(
  root,
  { csv, audio, voice, name, generator, minSyllables = 2, maxRank = Infinity },
) {
  if (!/^[a-z0-9]+$/.test(voice ?? '')) throw Error('Choose a voice ID, such as tuananh.');
  if (!Number.isInteger(minSyllables) || minSyllables < 1 || !(maxRank >= 1))
    throw Error('Choose a syllable count and a rank of at least 1.');
  const source = validate(await readJSON(sourceFile(root), emptyVietnamese));
  if (name || generator || !source.voices[voice]) {
    if (!nonempty(name ?? source.voices[voice]?.name) || !nonempty(generator))
      throw Error('A new voice needs --name and --generator.');
    source.voices[voice] = { name: name ?? source.voices[voice].name, generator };
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
  await mkdir(path.join(root, 'audio/vi'), { recursive: true });
  for (const record of parseCSV(await readFile(csv, 'utf8'))) {
    const text = String(record.word ?? record.syllable ?? '').normalize('NFC'),
      rank = Number(record.rank),
      perMillion = Number(record.per_million);
    if (!valid(text) || !Number.isSafeInteger(rank))
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
    await copyFile(path.join(audio, clip), path.join(root, file));
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
  await atomicJSON(sourceFile(root), validate(source));
  const kept = new Set(source.words.map((row) => row.audio[voice]?.file).filter(Boolean));
  for (const file of await readdir(path.join(root, 'audio/vi')))
    if (file.startsWith(voice + '-') && file.endsWith('.mp3') && !kept.has('audio/vi/' + file))
      await unlink(path.join(root, 'audio/vi', file));
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

export async function buildVietnameseCatalog(root) {
  const source = validate(await readJSON(sourceFile(root), emptyVietnamese));
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
      ...(row.gloss ? { gloss: row.gloss } : {}),
      metadata: { frequency: row.frequency },
    });
    catalog.pronunciations.push({
      id,
      entryId: id,
      kind: syllables.length === 1 ? 'syllable' : 'word',
      syllables,
    });
    for (const [voice, audio] of Object.entries(row.audio)) {
      const bytes = await readFile(path.join(root, audio.file)).catch((error) => {
        throw Error('Missing audio for ' + row.text + ': ' + error.message);
      });
      if (bytes.length !== audio.bytes || sha256(bytes) !== audio.sha256)
        throw Error('Audio differs from the word list: ' + audio.file);
      catalog.recordings.push({
        id: 'vi-' + voice + '-' + asciiName(row.text),
        pronunciationId: id,
        audio: audio.file,
        realizedTones: syllables.map((s) => s.tone),
        speakerId: voice,
        author: source.voices[voice].name + ' · synthetic voice',
        synthetic: true,
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
  return catalog;
}
