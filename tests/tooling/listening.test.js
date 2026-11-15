import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Script } from 'node:vm';
import { listeningFixture, decisionBatch } from '../helpers/listening-fixture.js';
import { listeningItems, importListeningReviews } from '../../tools/content/listening-workflow.mjs';
import { buildCatalog } from '../../tools/catalog/catalog.mjs';
import { buildMandarinCatalog, correctMandarin } from '../../tools/content/mandarin.mjs';
import { audioCoverage, validateMeasurements } from '../../tools/content/audio-coverage.mjs';
import { creditedSpeaker, phoneticFeatures } from '../../tools/catalog/enrichment.mjs';
import { cantonese, mandarin } from '../../src/languages/profiles.ts';
import { measurePCM, measureRecording } from '../../tools/content/audio-measurements.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest } from '../../tools/content/listening-state.mjs';
import { reviewServer } from '../../tools/content/listening-server.mjs';
import { withCurationLock } from '../../tools/content/curation-lock.mjs';
import { reviewPath } from '../../tools/content/listening-state.mjs';
import { catalogRows } from '../../src/content/catalog.ts';

const build = (root, language) =>
  language === 'yue' ? buildCatalog(root) : buildMandarinCatalog(root);
for (const language of ['yue', 'cmn']) {
  test(
    language +
      ': optional incremental reviews survive rebuilding, retain spelling, and reject conflicts',
    async (t) => {
      const f = await listeningFixture(t, language);
      const initial = await build(f.root, language);
      const archiveFile =
        language === 'yue'
          ? 'data/audio/content.json'
          : 'data/audio/collections/cmn/recordings.json';
      const before = await readFile(path.join(f.root, archiveFile), 'utf8');
      const items = await listeningItems(f.root, language);
      assert.ok(items.every((i) => i.reviewStatus === 'unreviewed'));
      const ids =
        language === 'yue'
          ? ['other-voice', 'unknown-voice', 'first-voice']
          : ['commons-105', 'commons-103', 'commons-100'];
      const batch = decisionBatch(language, items, {
        [ids[0]]: { status: 'uncertain' },
        [ids[1]]: { status: 'rejected' },
        [ids[2]]: {},
      });
      for (const decision of Object.values(batch.recordings)) {
        decision.reason = 'Internal listening notes';
        decision.reviewer = 'Private reviewer';
      }
      await f.put('reviews.json', batch);
      await importListeningReviews(f.root, language, path.join(f.root, 'reviews.json'));
      await importListeningReviews(f.root, language, path.join(f.root, 'reviews.json')); // idempotent replay
      const result = await build(f.root, language);
      assert.equal(result.recordings.length, initial.recordings.length - 1);
      assert.ok(!result.recordings.some((r) => r.id === ids[1]));
      assert.deepEqual(result.recordings.find((r) => r.id === ids[0]).toneTargets, []);
      assert.equal(result.recordings.find((r) => r.id === ids[2]).toneEvidence.status, 'reviewed');
      assert.doesNotMatch(JSON.stringify(result), /Internal listening notes|Private reviewer/);
      const row = catalogRows(result, language === 'yue' ? cantonese : mandarin).find(
        (r) => r.id === ids[0],
      );
      assert.ok(row.syllables.every((s) => s.toneEligible === false));
      assert.ok(row.syllables.length > 0); // Spelling content remains.
      assert.deepEqual((await build(f.root, language)).recordings, result.recordings);
      assert.equal(await readFile(path.join(f.root, archiveFile), 'utf8'), before);
      const laterItems = await listeningItems(f.root, language);
      const laterBatch = decisionBatch(language, laterItems, { [ids[0]]: {} });
      await f.put('later.json', laterBatch);
      await importListeningReviews(f.root, language, path.join(f.root, 'later.json'));
      batch.recordings[ids[0]].reason = 'An outdated writer';
      await f.put('reviews.json', batch);
      await assert.rejects(
        importListeningReviews(f.root, language, path.join(f.root, 'reviews.json')),
        /Conflicting review/,
      );
      const merged = JSON.parse(await readFile(reviewPath(f.root, language), 'utf8'));
      assert.equal(merged.recordings[ids[1]].status, 'rejected');
      assert.equal(merged.recordings[ids[0]].status, 'approved');
      const report = await audioCoverage(f.root, language);
      assert.equal(report.summary.reviewProgress.approved, 2);
      assert.equal(report.summary.reviewProgress.rejected, 1);
    },
  );

  test(
    language + ': stale evidence is reported, never reapplied, and cannot be imported',
    async (t) => {
      const f = await listeningFixture(t, language);
      const items = await listeningItems(f.root, language);
      const id = language === 'yue' ? 'other-voice' : 'commons-105';
      const batch = decisionBatch(language, items, { [id]: {} });
      await f.put('review.json', batch);
      await importListeningReviews(f.root, language, path.join(f.root, 'review.json'));
      if (language === 'yue') {
        await f.put(items.find((i) => i.recordingId === id).audio, Buffer.alloc(1200, 99));
      } else {
        await correctMandarin(f.root, {
          recordingId: id,
          reason: 'New pronunciation evidence',
          realizedTones: [3, 3],
        });
      }
      const current = await listeningItems(f.root, language);
      assert.equal(current.find((i) => i.recordingId === id).reviewStatus, 'stale');
      const result = await build(f.root, language);
      assert.notEqual(result.recordings.find((r) => r.id === id).toneEvidence.status, 'reviewed');
      await assert.rejects(
        importListeningReviews(f.root, language, path.join(f.root, 'review.json')),
        /changed audio or pronunciation/,
      );
      assert.deepEqual((await audioCoverage(f.root, language)).staleReviews, [id]);
    },
  );

  test(
    language +
      ': invalid batches are atomic, manual review stays optional, and curation locks are shared',
    async (t) => {
      const f = await listeningFixture(t, language);
      const items = await listeningItems(f.root, language);
      const id = language === 'yue' ? 'other-voice' : 'commons-105';
      const batch = decisionBatch(language, items, { [id]: {} });
      batch.recordings[id].realizedTones = [99];
      await f.put('bad.json', batch);
      await assert.rejects(
        importListeningReviews(f.root, language, path.join(f.root, 'bad.json')),
        /spoken tones/,
      );
      await assert.rejects(readFile(reviewPath(f.root, language)), { code: 'ENOENT' });
      await withCurationLock(f.root, language, async () => {
        await assert.rejects(listeningItems(f.root, language), /Another.*curation operation/);
        await assert.rejects(build(f.root, language), /Another.*curation operation/);
      });
      assert.ok(
        (await build(f.root, language)).recordings.every(
          (r) => r.toneEvidence.status === 'assumed',
        ),
      );
    },
  );
}

test('Mandarin review resolves an ambiguous reading without changing dictionary or archive, and can reset a decision', async (t) => {
  const f = await listeningFixture(t, 'cmn');
  const items = await listeningItems(f.root, 'cmn');
  const ambiguous = items.find((i) => i.recordingId === 'commons-106');
  assert.equal(ambiguous.candidates.length, 2);
  const batch = decisionBatch('cmn', items, { 'commons-106': {} });
  await f.put('review.json', batch);
  await importListeningReviews(f.root, 'cmn', path.join(f.root, 'review.json'));
  assert.ok((await buildMandarinCatalog(f.root)).recordings.some((r) => r.id === 'commons-106'));
  const reset = decisionBatch('cmn', await listeningItems(f.root, 'cmn'), {
    'commons-106': { status: 'unreviewed' },
  });
  await f.put('reset.json', reset);
  await importListeningReviews(f.root, 'cmn', path.join(f.root, 'reset.json'));
  assert.ok(!(await buildMandarinCatalog(f.root)).recordings.some((r) => r.id === 'commons-106'));
});

test('speaker links use explicit source roles; unknown speakers do not inflate report diversity', async (t) => {
  assert.deepEqual(
    creditedSpeaker(
      { author: 'Uploader', source: 'https://commons.wikimedia.org/wiki/File:X' },
      'yue',
    ),
    {},
  );
  assert.deepEqual(
    creditedSpeaker({ author: 'Speaker: Ada', source: 'https://example.org/' }, 'yue'),
    {},
  );
  const a = creditedSpeaker(
    { author: 'Speaker: Ada\nRecorder: Bob', source: 'https://commons.wikimedia.org/wiki/File:X' },
    'yue',
  );
  assert.equal(a.speakerEvidence.name, 'Ada');
  assert.equal(
    creditedSpeaker(
      { author: 'Speaker: Ada Recorder: Bob', source: 'https://commons.wikimedia.org/wiki/File:Y' },
      'yue',
    ).speakerId,
    a.speakerId,
  );
  const f = await listeningFixture(t, 'yue');
  const report = await audioCoverage(f.root, 'yue');
  assert.equal(report.summary.knownSpeakerIdentities, 2);
  assert.equal(report.summary.explicitCreditSpeakers, 2);
  assert.equal(report.summary.recordingsWithUnknownSpeaker, 1);
  assert.equal(report.summary.pronunciationsWithMultipleKnownSpeakers, 1);
  assert.equal(
    report.contrastCandidates.status,
    'automatically-proposed-not-reviewed-teaching-sets',
  );
});

test('phonetic features use language spelling rules and preserve dictionary tones', () => {
  const yue = phoneticFeatures(
    {
      syllables: [
        { transcription: 'gwok3', tone: 3 },
        { transcription: 'ng5', tone: 5 },
      ],
    },
    cantonese,
  );
  assert.deepEqual(yue.syllables, [
    { base: 'gwok', initial: 'gw', final: 'ok', coda: 'k', checked: true },
    { base: 'ng', initial: '', final: 'ng', coda: '', checked: false },
  ]);
  const cmn = phoneticFeatures(
    {
      syllables: [
        { transcription: 'nü3', tone: 3 },
        { transcription: 'zhong1', tone: 1 },
      ],
    },
    mandarin,
  );
  assert.deepEqual(cmn.tonePattern, [3, 1]);
  assert.equal(cmn.syllables[0].final, 'nü'.slice(1));
  assert.equal(cmn.syllables[1].initial, 'zh');
  assert.equal(cmn.syllables[1].coda, 'ng');
});

test('audio measurements quantify level and silence without confusing silence with reviewed speech', () => {
  const bytes = Buffer.alloc(4000 * 4);
  for (let i = 1000; i < 3000; i++) bytes.writeFloatLE(i === 2000 ? 1 : 0.25, i * 4);
  const result = measurePCM(bytes, 1000, 1);
  assert.equal(result.duration, 4);
  assert.equal(result.leadingSilenceSeconds, 1);
  assert.equal(result.trailingSilenceSeconds, 1);
  assert.equal(result.peakDb, 0);
  assert.equal(result.fullScaleSampleFraction, 1 / 4000);
  assert.ok(result.flags.includes('full-scale-samples'));
  assert.equal(measurePCM(Buffer.alloc(400), 1000, 1).rmsDb, null);
  assert.throws(() => measurePCM(Buffer.alloc(3), 1000, 1), /Invalid decoded/);
});

test('FFmpeg measures actual MP3s without altering them and validates measurement registries', async (t) => {
  const f = await listeningFixture(t, 'yue');
  const file = path.join(f.root, 'audio/measurement.mp3');
  await promisify(execFile)(
    'ffmpeg',
    ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-q:a', '4', file],
    { windowsHide: true },
  );
  const bytes = await readFile(file);
  const hash = digest(bytes);
  const measured = await measureRecording(f.root, {
    recordingId: 'measurement',
    audio: 'audio/measurement.mp3',
    recordingSha256: hash,
  });
  assert.ok(measured.duration > 0.19 && measured.duration < 0.3);
  assert.equal(measured.channels, 1);
  assert.equal(digest(await readFile(file)), hash);
  validateMeasurements(
    { version: 1, language: 'yue', recordings: { measurement: measured } },
    'yue',
  );
  measured.flags = 'clipping';
  assert.throws(
    () =>
      validateMeasurements(
        { version: 1, language: 'yue', recordings: { measurement: measured } },
        'yue',
      ),
    /Invalid audio measurements/,
  );
});

test('internal review server serves only its page and eligible audio, and refreshes snapshots', async (t) => {
  const f = await listeningFixture(t, 'yue');
  const server = await reviewServer(f.root, 'yue');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const html = await (await fetch(url)).text();
  new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert.match(html, /Optional listening review/);
  assert.equal((await fetch(url + '/audio/other-voice.mp3')).status, 200);
  for (const forbidden of [
    '/data/audio/content.json',
    '/.audio-import-cache/yue/curation.lock',
    '/package.json',
    '/audio/private.mp3',
  ])
    assert.equal((await fetch(url + forbidden)).status, 404);
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 405);
});
