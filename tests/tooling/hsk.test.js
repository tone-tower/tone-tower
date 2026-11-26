import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog } from '../../src/content/catalog.ts';
import { mandarin } from '../../src/languages/profiles.ts';
import { emptyMandarin } from '../../tools/content/mandarin.mjs';
import { hskCoverage, withHskLabels } from '../../tools/content/hsk.mjs';
import { withPracticeTiers } from '../../tools/content/practice-tiers.mjs';
import { renderPage } from '../../tools/publishing/pages.mjs';

const source = {
  scheme: 'hsk-3.0',
  edition: '2025-11-exam-syllabus',
  attribution: 'Fixture vocabulary list',
  url: 'https://example.com/source',
  downloadUrl: 'https://example.com/words.json',
  snapshotSha256: 'a'.repeat(64),
  snapshotDate: '2026-11-26',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
};
const dictionary = [
  ['walk', '行', ['xing2']],
  ['row', '行', ['hang2']],
  ['hello', '你好', ['ni3', 'hao3']],
  ['for', '为', ['wei2']],
  ['advanced', '纵观', ['zong4', 'guan1']],
  ['reference', '妈', ['ma1']],
];

function fixture() {
  const entries = dictionary.map(([id, simplified]) => ({
    id,
    forms: { default: simplified, simplified },
    gloss: id,
  }));
  const pronunciations = dictionary.map(([id, , syllables]) => ({
    id,
    entryId: id,
    syllables: syllables.map((transcription) => ({
      transcription,
      tone: Number(transcription.at(-1)),
    })),
  }));
  const recordings = pronunciations.map(({ id, syllables }) => ({
    id,
    pronunciationId: id,
    audio: 'audio/cmn/' + id + '.mp3',
    realizedTones: id === 'hello' ? [2, 3] : syllables.map((syllable) => syllable.tone),
    referenceOnly: id === 'reference',
  }));
  return { ...emptyMandarin(), entries, pronunciations, recordings };
}

const words = [
  ['行', 'xíng', '2', '3'],
  ['你好', 'nǐhǎo', '3 3', '1'],
  ['为', 'wéi', '2', '4'],
  ['为', 'wéi', '2', '5'],
  ['纵观', 'zòngguān', '4 1', '7-9'],
  ['纵观', 'zòng guān', '4 1', '7-9'],
  ['妈', 'mā', '1', '1'],
].map(([form, pinyin, tones, level]) => ({ form, pinyin, tones, level }));

test('HSK labels follow dictionary readings and leave conflicting levels untagged', () => {
  const catalog = fixture();
  const tagged = withHskLabels(catalog, { source, words });
  const byId = new Map(tagged.entries.map((entry) => [entry.id, entry.metadata?.hsk]));
  assert.equal(byId.get('walk').level, '3');
  assert.equal(byId.get('row'), undefined);
  assert.equal(byId.get('hello').level, '1');
  assert.equal(byId.get('for'), undefined);
  assert.deepEqual(byId.get('advanced'), {
    level: '7-9',
    sourceRows: [5, 6],
    match: 'form-and-pinyin',
  });
  assert.equal(byId.get('reference'), undefined);
  assert.equal(tagged.recordings, catalog.recordings);
  assert.equal(tagged.pronunciations, catalog.pronunciations);
  assert.deepEqual(hskCoverage(tagged), { 1: 1, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0, '7-9': 1 });
});

test('catalog validation requires provenance and rejects individual advanced HSK levels', () => {
  const tagged = withHskLabels(fixture(), { source, words });
  assert.equal(validateCatalog(tagged, mandarin).hskSource.edition, source.edition);
  assert.throws(
    () => validateCatalog({ ...tagged, hskSource: undefined }, mandarin),
    /HSK membership/,
  );

  const advanced = tagged.entries.find((entry) => entry.id === 'advanced');
  advanced.metadata.hsk.level = '8';
  assert.throws(() => validateCatalog(tagged, mandarin), /HSK membership/);
});

test('practice tiers use the exam label first and preserve separate assignments by reading', () => {
  const tagged = withHskLabels(fixture(), { source, words });
  const result = withPracticeTiers(tagged, {
    entries: {
      walk: { form: '行', readings: ['xíng'], tier: 'hard' },
      row: { form: '行', readings: ['háng'], tier: 'normal' },
      for: { form: '为', readings: ['wèi'], tier: 'easy' },
    },
  });
  assert.deepEqual(Object.fromEntries(result.entries.map((e) => [e.id, e.practiceTier])), {
    walk: 'easy',
    row: 'normal',
    hello: 'easy',
    for: 'hard',
    advanced: 'hard',
    reference: undefined,
  });
  assert.equal(result.entries.find((e) => e.id === 'row').metadata, undefined);
  assert.equal(result.entries.find((e) => e.id === 'walk').metadata.hsk.level, '3');
  assert.equal(result.recordings, tagged.recordings);
  assert.equal(validateCatalog(result, mandarin), result);
});

test('the embedded Mandarin guide catalog retains the source for tagged entries', async () => {
  const template = await readFile(new URL('../../src/shell.html', import.meta.url), 'utf8');
  const tagged = withHskLabels(fixture(), { source, words });
  tagged.references.push({ tone: 2, recordingId: 'walk', targetIndex: 0 });
  const html = renderPage(template, 'cmn:sounds', tagged);
  const guide = JSON.parse(
    html.match(/<script type="application\/json" id="guide-catalog">([^<]+)/)[1],
  );
  const validated = validateCatalog(guide, mandarin);
  assert.deepEqual(validated.hskSource, source);
  assert.equal(validated.entries.find((entry) => entry.id === 'walk').metadata.hsk.level, '3');
});
