import { withCurationLock } from './curation-lock.mjs';
import { activeReview, contentFingerprint, loadListeningReviews } from './listening-state.mjs';
import { applyCatalogReviews } from './listening-items.mjs';
import { enrichCatalog } from '../catalog/enrichment.mjs';
import { validateInventory } from '../audio/inventory.mjs';
import { validateCatalog } from '../../src/content/catalog.ts';
import { mandarin } from '../../src/languages/profiles.ts';
import {
  displayMandarinGloss,
  estimateMandarinTones,
  uniqueReading,
  chooseBetaReferences,
} from './mandarin-beta.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { listeningPage } from './listening-page.mjs';
import { qualityIssues } from './listening-state.mjs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { atomicJSON } from '../lib/json.mjs';
import { formatPinyin, parsePinyin } from '../../src/languages/pinyin.ts';
import { loadShtooka } from '../audio/shtooka.mjs';
import { loadToneExamples, toneExampleForms, toneSource } from './tone-examples.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const directory = (root) => path.join(root, 'data/content/cmn');
const json = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
};
export const emptyMandarin = () => ({
  version: 2,
  language: 'cmn',
  transcriptionSystem: 'pinyin',
  entries: [],
  pronunciations: [],
  recordings: [],
  references: [],
});
async function archive(root) {
  const inventory = await json(path.join(root, 'data/audio/collections/cmn/recordings.json'), {
    version: 1,
    collectionId: 'cmn',
    language: 'cmn',
    recordings: [],
  });
  return [
    ...validateInventory(inventory, 'cmn', 'cmn').recordings,
    ...(await loadShtooka(root)).recordings,
  ];
}

export function readingsByForm(rows, forms) {
  const index = new Map();
  for (const row of rows)
    for (const form of new Set(forms(row))) {
      if (!index.has(form)) index.set(form, []);
      index.get(form).push(row);
    }
  return index;
}

export function sourceMatchedReadings(candidates, sourcePinyin) {
  if (sourcePinyin === undefined) return candidates;
  const compact = (pinyin) =>
    pinyin
      .toLowerCase()
      .normalize('NFC')
      .replace(/[\s'’\-]/g, '');
  const source = compact(sourcePinyin);
  return candidates.filter(
    (candidate) =>
      compact(formatPinyin(candidate.syllables.map((s) => s.transcription).join(' '))) === source,
  );
}

export function parseCedict(text, edition = 'v1') {
  if (!['v1', 'v2', 'mixed'].includes(edition))
    throw Error('Choose a CC-CEDICT edition: v1, v2, or mixed.');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(\S+) (\S+) (\[\[?)(.+?)(\]\]?) \/(.+)\/$/);
    if (!match) throw Error('Malformed CC-CEDICT entry: ' + line.slice(0, 80));
    const [, traditional, simplified, open, reading, close, definitions] = match;
    const v2 = open === '[[';
    if (open.length !== close.length || (edition !== 'mixed' && v2 !== (edition === 'v2')))
      throw Error('CC-CEDICT syntax differs from the selected edition.');
    // Non-Han forms and rhotic suffixes remain dictionary evidence but are not v1 exercises.
    if (!/^[\p{Script=Han}]+$/u.test(traditional + simplified) || /r5(?:\s|$)/.test(reading))
      continue;
    const parts = parsePinyin(reading);
    if (
      !parts ||
      [...traditional].length !== parts.length ||
      [...simplified].length !== parts.length
    )
      continue;
    rows.push({
      id: 'cedict-' + sha256(JSON.stringify([traditional, simplified, reading])).slice(0, 24),
      traditional,
      simplified,
      reading,
      syllables: parts.map((s) => ({ transcription: s.base + s.tone, tone: s.tone })),
      gloss: definitions.split('/').filter(Boolean).join('; '),
      raw: line,
    });
  }
  return rows;
}

async function importDictionaryUnlocked(root, file, edition = 'v1') {
  const bytes = await readFile(file);
  const raw = file.endsWith('.gz') ? gunzipSync(bytes) : bytes;
  const text = raw.toString('utf8');
  const recordings = await archive(root);
  const texts = new Set(recordings.map((r) => r.sourceText));
  const teachingSource = await json(path.join(directory(root), 'tone-example-segments.json'), null);
  if (teachingSource) {
    if (teachingSource.version !== 1 || teachingSource.sourceSha1 !== toneSource.sha1)
      throw Error('Invalid Mandarin teaching source.');
    for (const forms of toneExampleForms) for (const form of forms) texts.add(form);
  }
  const previous = await json(path.join(directory(root), 'dictionary.json'), null);
  // Keep prior matches when an archive is temporarily smaller; never touch review decisions.
  for (const row of previous?.entries ?? []) {
    texts.add(row.simplified);
    texts.add(row.traditional);
  }
  const entries = parseCedict(text, edition).filter(
    (row) => texts.has(row.simplified) || texts.has(row.traditional),
  );
  const result = {
    version: 1,
    source: {
      name: 'CC-CEDICT',
      url: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
      edition,
      sha256: sha256(raw),
      date: text.match(/^#! date=(.+)$/m)?.[1]?.trim() ?? null,
      license: 'CC-BY-SA-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
    entries,
  };
  await mkdir(directory(root), { recursive: true });
  await atomicJSON(path.join(directory(root), 'dictionary.json'), result);
  return {
    matchedDictionaryEntries: entries.length,
    recordings: recordings.length,
    snapshot: result.source,
  };
}

async function prepareMandarinUnlocked(root) {
  const dictionary = await json(path.join(directory(root), 'dictionary.json'), null);
  if (!dictionary) throw Error('Import a pinned dictionary first with mandarin:dictionary.');
  const entries = dictionary.entries.map((row) => ({
    id: row.id,
    forms: { default: row.simplified, simplified: row.simplified, traditional: row.traditional },
    gloss: row.gloss,
    dictionarySource: { ...dictionary.source, entryId: row.id, raw: row.raw },
  }));
  const pronunciations = dictionary.entries.map((row) => ({
    id: row.id,
    entryId: row.id,
    kind: row.syllables.length === 1 ? 'syllable' : 'word',
    syllables: row.syllables.map((s, i) => ({
      ...s,
      forms: {
        default: [...row.simplified][i],
        simplified: [...row.simplified][i],
        traditional: [...row.traditional][i],
      },
    })),
  }));
  await atomicJSON(path.join(directory(root), 'entries.json'), { version: 1, entries });
  await atomicJSON(path.join(directory(root), 'pronunciations.json'), {
    version: 1,
    pronunciations,
  });
  return { entries: entries.length, pronunciations: pronunciations.length };
}

export async function mandarinReviewItems(root) {
  const recordings = await archive(root);
  const entries = (await json(path.join(directory(root), 'entries.json'), { entries: [] })).entries;
  const pronunciations = (
    await json(path.join(directory(root), 'pronunciations.json'), { pronunciations: [] })
  ).pronunciations;
  const byForm = readingsByForm(entries, (entry) => Object.values(entry.forms));
  const byPronunciation = new Map(pronunciations.map((p) => [p.id, p]));
  const saved = await json(path.join(directory(root), 'annotations.json'), {
    version: 1,
    annotations: {},
  });
  const corrections = await json(path.join(directory(root), 'corrections.json'), {
    version: 1,
    recordings: {},
  });
  return recordings.map((recording) => {
    const item = {
      recordingId: recording.id,
      text: recording.sourceText,
      audio: recording.audio.file,
      speaker: recording.speaker?.name ?? 'Unidentified speaker',
      speakerId: recording.speaker?.id,
      source: recording.source.pageUrl,
      ...(recording.sourcePinyin ? { sourcePinyin: recording.sourcePinyin } : {}),
      recordingSha256: recording.audio.sha256,
      candidates: (byForm.get(recording.sourceText) ?? []).map((entry) => ({
        pronunciationId: entry.id,
        forms: entry.forms,
        gloss: entry.gloss,
        dictionarySha256: entry.dictionarySource.sha256,
        syllables: byPronunciation.get(entry.id)?.syllables ?? [],
      })),
      annotation: saved.annotations[recording.id] ?? null,
    };
    const patch = corrections.recordings[recording.id] ?? null;
    const legacy = item.annotation ?? null;
    item.contentSha256 = contentFingerprint(item.candidates, {
      patch,
      legacy,
      source: recording.source.pageUrl,
      audio: recording.audio.file,
      ...(recording.sourcePinyin ? { sourcePinyin: recording.sourcePinyin } : {}),
    });
    const candidate =
      item.candidates.find(
        (c) => c.pronunciationId === (patch?.pronunciationId ?? legacy?.pronunciationId),
      ) ?? uniqueReading(sourceMatchedReadings(item.candidates, item.sourcePinyin));
    item.pronunciationId = candidate?.pronunciationId;
    if (candidate) {
      const estimate = estimateMandarinTones(candidate, { forms: candidate.forms });
      item.realizedTones = patch?.realizedTones ?? legacy?.realizedTones ?? estimate.realizedTones;
      item.toneTargets =
        patch?.realizedTones || legacy?.status === 'approved'
          ? item.realizedTones.map((_, i) => i)
          : estimate.toneTargets;
    }
    item.excluded = patch?.excluded === true || legacy?.status === 'rejected';
    return item;
  });
}

const reviewQueueUnlocked = mandarinReviewItems;

function validateAnnotation(annotation, item) {
  if (
    !['approved', 'rejected'].includes(annotation.status) ||
    !annotation.reviewer?.trim() ||
    !annotation.reason?.trim() ||
    !Number.isFinite(Date.parse(annotation.reviewedAt))
  )
    throw Error('Review needs a status, reviewer, date, and reason: ' + item.recordingId);
  if (annotation.recordingSha256 !== item.recordingSha256)
    throw Error('Review refers to different audio bytes: ' + item.recordingId);
  if (annotation.status === 'rejected') return;
  const candidate = item.candidates.find((c) => c.pronunciationId === annotation.pronunciationId);
  if (!candidate || candidate.dictionarySha256 !== annotation.dictionarySha256)
    throw Error('Review refers to a missing or changed dictionary candidate: ' + item.recordingId);
  if (
    !Array.isArray(annotation.realizedTones) ||
    annotation.realizedTones.length !== candidate.syllables.length ||
    !annotation.realizedTones.every((t) => [1, 2, 3, 4, 5].includes(t))
  )
    throw Error('Review must annotate every spoken syllable: ' + item.recordingId);
  for (const reference of annotation.references ?? []) {
    if (
      !Number.isInteger(reference.targetIndex) ||
      reference.targetIndex < 0 ||
      annotation.realizedTones[reference.targetIndex] !== reference.tone
    )
      throw Error('Reference must identify a reviewed spoken target: ' + item.recordingId);
    if (reference.tone !== 5 && candidate.syllables.length !== 1)
      throw Error('Tones 1–4 require isolated reference recordings.');
    if (reference.tone === 5 && candidate.syllables.length < 2)
      throw Error('Neutral-tone reference needs word context.');
  }
}

async function importReviewsUnlocked(root, file) {
  const decisions = await json(file, null);
  if (decisions?.version !== 1 || !decisions.annotations || Array.isArray(decisions.annotations))
    throw Error('Expected a version 1 annotations object.');
  const queue = new Map((await reviewQueueUnlocked(root)).map((item) => [item.recordingId, item]));
  const previous = await json(path.join(directory(root), 'annotations.json'), {
    version: 1,
    annotations: {},
  });
  for (const [id, annotation] of Object.entries(decisions.annotations)) {
    const item = queue.get(id);
    if (!item) throw Error('Unknown recording in review: ' + id);
    validateAnnotation(annotation, item);
  }
  const result = { version: 1, annotations: { ...previous.annotations, ...decisions.annotations } };
  await atomicJSON(path.join(directory(root), 'annotations.json'), result);
  return { imported: Object.keys(decisions.annotations).length };
}

function validateCorrection(patch, item) {
  if (
    !patch ||
    typeof patch !== 'object' ||
    Array.isArray(patch) ||
    Object.keys(patch).some(
      (key) => !['reason', 'excluded', 'pronunciationId', 'realizedTones'].includes(key),
    ) ||
    typeof patch.reason !== 'string' ||
    !patch.reason.trim()
  )
    throw Error('A correction needs supported fields and a reason: ' + item.recordingId);
  if (patch.excluded !== undefined && typeof patch.excluded !== 'boolean')
    throw Error('Exclusion must be true or false.');
  const candidate = patch.pronunciationId
    ? item.candidates.find((c) => c.pronunciationId === patch.pronunciationId)
    : uniqueReading(sourceMatchedReadings(item.candidates, item.sourcePinyin));
  if (patch.pronunciationId && !candidate)
    throw Error('Unknown corrected pronunciation: ' + item.recordingId);
  if (
    patch.realizedTones !== undefined &&
    (!candidate ||
      !Array.isArray(patch.realizedTones) ||
      patch.realizedTones.length !== candidate.syllables.length ||
      !patch.realizedTones.every((t) => [1, 2, 3, 4, 5].includes(t)))
  )
    throw Error('Corrected tones must match an unambiguous pronunciation: ' + item.recordingId);
}

async function correctMandarinUnlocked(root, { recordingId, ...patch }) {
  if (typeof patch.reason !== 'string' || !patch.reason.trim())
    throw Error('A correction needs a reason.');
  const item = (await reviewQueueUnlocked(root)).find((item) => item.recordingId === recordingId);
  if (!item) throw Error('Unknown recording: ' + recordingId);
  const previous = await json(path.join(directory(root), 'corrections.json'), {
    version: 1,
    recordings: {},
  });
  const correction = {
    ...previous.recordings[recordingId],
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
  };
  validateCorrection(correction, item);
  const result = { version: 1, recordings: { ...previous.recordings, [recordingId]: correction } };
  await mkdir(directory(root), { recursive: true });
  await atomicJSON(path.join(directory(root), 'corrections.json'), result);
  return { recordingId, correction };
}

export function coverage(catalog) {
  const playable = catalog.recordings.filter((r) => !r.referenceOnly);
  const byId = new Map(catalog.pronunciations.map((p) => [p.id, p]));
  const singles = playable.filter((r) => byId.get(r.pronunciationId).syllables.length === 1).length;
  const multi = playable.length - singles;
  const hasTone = (r, tone) =>
    r.realizedTones.some((t, i) => t === tone && (r.toneTargets?.includes(i) ?? true));
  const tones = Object.fromEntries(
    [1, 2, 3, 4, 5].map((t) => [t, playable.filter((r) => hasTone(r, t)).length]),
  );
  const referenceTones = new Set(catalog.references.map((r) => r.tone));
  const missing = [];
  if ([1, 2, 3, 4, 5].some((t) => !referenceTones.has(t))) missing.push('tone references');
  if (singles < 20 || multi < 80)
    missing.push('20 single-syllable and 80 multi-syllable recordings');
  if (
    [1, 2, 3, 4].some(
      (t) =>
        !playable.some((r) => byId.get(r.pronunciationId).syllables.length === 1 && hasTone(r, t)),
    )
  )
    missing.push('single-syllable coverage of tones 1–4');
  if (Object.values(tones).some((n) => n === 0)) missing.push('coverage of all spoken tones');
  return { ready: !missing.length, singles, multi, tones, missing };
}

export async function buildMandarinCatalogUnlocked(root, { reviewedOnly = false } = {}) {
  const result = emptyMandarin();
  const entries = (await json(path.join(directory(root), 'entries.json'), { entries: [] })).entries;
  const pronunciations = (
    await json(path.join(directory(root), 'pronunciations.json'), { pronunciations: [] })
  ).pronunciations;
  validateCatalog({ ...emptyMandarin(), entries, pronunciations }, mandarin);
  const recordings = new Map((await archive(root)).map((r) => [r.id, r]));
  const queue = new Map((await reviewQueueUnlocked(root)).map((item) => [item.recordingId, item]));
  const decisions = await json(path.join(directory(root), 'annotations.json'), {
    version: 1,
    annotations: {},
  });
  const corrections = await json(path.join(directory(root), 'corrections.json'), {
    version: 1,
    recordings: {},
  });
  const listening = await loadListeningReviews(root, 'cmn');
  if (corrections.version !== 1 || !corrections.recordings || Array.isArray(corrections.recordings))
    throw Error('Invalid Mandarin corrections.');
  const byPronunciation = new Map(pronunciations.map((p) => [p.id, p]));
  const byEntry = new Map(entries.map((e) => [e.id, e]));
  const stats = {
    assumed: 0,
    reviewed: 0,
    ambiguous: 0,
    unmatched: 0,
    excluded: 0,
    unavailable: 0,
  };
  for (const id of Object.keys(decisions.annotations))
    if (!recordings.has(id)) throw Error('Reviewed recording missing from archive: ' + id);
  for (const id of Object.keys(corrections.recordings))
    if (!recordings.has(id)) throw Error('Unknown corrected recording: ' + id);
  for (const [id, row] of recordings) {
    const item = queue.get(id),
      annotation = decisions.annotations[id],
      patch = corrections.recordings[id];
    if (!item) continue;
    if (annotation) validateAnnotation(annotation, item);
    if (patch) validateCorrection(patch, item);
    if (patch?.excluded || annotation?.status === 'rejected') {
      stats.excluded++;
      continue;
    }
    const decision = activeReview(item, listening.recordings[id], 'cmn');
    if (decision?.status === 'rejected') {
      stats.excluded++;
      continue;
    }
    const reviewed =
      decision?.status === 'approved' || (!decision && annotation?.status === 'approved');
    if (reviewedOnly && !reviewed) continue;
    let candidate = item.candidates.find(
      (c) =>
        c.pronunciationId ===
        (decision?.pronunciationId ?? patch?.pronunciationId ?? annotation?.pronunciationId),
    );
    if (!candidate) {
      candidate = uniqueReading(sourceMatchedReadings(item.candidates, item.sourcePinyin));
    }
    if (!candidate) {
      stats[item.candidates.length ? 'ambiguous' : 'unmatched']++;
      continue;
    }
    const pronunciation = byPronunciation.get(candidate.pronunciationId),
      entry = byEntry.get(pronunciation?.entryId);
    if (!entry || !pronunciation) throw Error('Missing curated reading: ' + id);
    let bytes;
    try {
      bytes = await readFile(path.join(root, row.audio.file));
    } catch (error) {
      if (error.code !== 'ENOENT' || reviewed) throw error;
      stats.unavailable++;
      continue;
    }
    if (bytes.length !== row.audio.bytes || sha256(bytes) !== row.audio.sha256) {
      if (reviewed) throw Error('Reviewed audio failed integrity validation: ' + id);
      stats.unavailable++;
      continue;
    }
    const estimate = estimateMandarinTones(pronunciation, entry);
    const realizedTones =
      decision?.realizedTones ??
      patch?.realizedTones ??
      (reviewed ? annotation.realizedTones : estimate.realizedTones);
    if (!result.entries.some((e) => e.id === entry.id))
      result.entries.push({
        ...entry,
        fullGloss: entry.gloss,
        gloss: displayMandarinGloss(entry.gloss),
      });
    if (!result.pronunciations.some((p) => p.id === pronunciation.id))
      result.pronunciations.push(pronunciation);
    result.recordings.push({
      id,
      pronunciationId: pronunciation.id,
      audio: row.audio.file,
      realizedTones,
      toneTargets:
        decision?.status === 'uncertain'
          ? []
          : (decision?.toneTargets ??
            (patch?.realizedTones || reviewed
              ? realizedTones.map((_, i) => i)
              : estimate.toneTargets)),
      toneEvidence: {
        status:
          decision?.status === 'approved'
            ? 'reviewed'
            : patch?.realizedTones
              ? 'corrected'
              : reviewed
                ? 'reviewed'
                : 'assumed',
        basis: decision
          ? decision.status === 'approved'
            ? 'Human listening review'
            : 'Listening marked uncertain; tone targets omitted'
          : (patch?.reason ??
            (reviewed
              ? annotation.reason
              : row.sourcePinyin
                ? 'Original source Pinyin, matching dictionary reading, and common tone sandhi'
                : 'Source label, dictionary reading, and common tone sandhi')),
      },
      speakerId: row.speaker?.id,
      author: row.attribution.author,
      source: row.source.pageUrl,
      license: row.attribution.license,
      licenseUrl: row.attribution.licenseUrl,
      conversion: row.audio.processing,
    });
    stats[reviewed ? 'reviewed' : 'assumed']++;
    if (decision?.status === 'approved') {
      result.references.push(
        ...(decision.referenceTargets ?? []).map((targetIndex) => ({
          recordingId: id,
          targetIndex,
          tone: realizedTones[targetIndex],
        })),
      );
    } else if (
      !decision &&
      reviewed &&
      (!patch?.pronunciationId || patch.pronunciationId === annotation.pronunciationId)
    )
      result.references.push(
        ...(annotation.references ?? [])
          .filter((reference) => realizedTones[reference.targetIndex] === reference.tone)
          .map((reference) => ({ ...reference, recordingId: id })),
      );
  }
  // Several clips can be reference-quality, while the public catalog selects one per tone.
  result.references = [...new Map(result.references.map((r) => [r.tone, r])).values()];
  if (!reviewedOnly) chooseBetaReferences(result);
  {
    const examples = await loadToneExamples(root);
    if (examples) {
      const reviewedExamples = await applyCatalogReviews(root, { ...emptyMandarin(), ...examples });
      if (reviewedOnly) {
        reviewedExamples.recordings = reviewedExamples.recordings.filter(
          (r) => r.toneEvidence?.status === 'reviewed',
        );
        const ids = new Set(reviewedExamples.recordings.map((r) => r.id));
        reviewedExamples.references = reviewedExamples.references.filter((r) =>
          ids.has(r.recordingId),
        );
        const pronunciations = new Set(reviewedExamples.recordings.map((r) => r.pronunciationId));
        reviewedExamples.pronunciations = reviewedExamples.pronunciations.filter((p) =>
          pronunciations.has(p.id),
        );
        const entries = new Set(reviewedExamples.pronunciations.map((p) => p.entryId));
        reviewedExamples.entries = reviewedExamples.entries.filter((e) => entries.has(e.id));
      }
      result.entries.push(...reviewedExamples.entries);
      result.pronunciations.push(...reviewedExamples.pronunciations);
      result.recordings.push(...reviewedExamples.recordings);
      result.references = [
        ...reviewedExamples.references,
        ...result.references.filter(
          (reference) =>
            !reviewedExamples.references.some((example) => example.tone === reference.tone),
        ),
      ];
    }
  }
  if (new Set(result.references.map((r) => r.tone)).size !== result.references.length)
    throw Error('Choose one reference per Mandarin tone.');
  result.availability = { ...coverage(result), mode: reviewedOnly ? 'reviewed' : 'beta', ...stats };
  validateCatalog(result, mandarin, { publication: true });
  return enrichCatalog(result, mandarin);
}

const curate = (root, task) => withCurationLock(root, 'cmn', task);
export function importDictionary(root, ...args) {
  return curate(root, () => importDictionaryUnlocked(root, ...args));
}
export function prepareMandarin(root, ...args) {
  return curate(root, () => prepareMandarinUnlocked(root, ...args));
}
export function reviewQueue(root, ...args) {
  return curate(root, () => reviewQueueUnlocked(root, ...args));
}
export function importReviews(root, ...args) {
  return curate(root, () => importReviewsUnlocked(root, ...args));
}
export function correctMandarin(root, ...args) {
  return curate(root, () => correctMandarinUnlocked(root, ...args));
}
export function buildMandarinCatalog(root, ...args) {
  return curate(root, () => buildMandarinCatalogUnlocked(root, ...args));
}
export async function exportReview(root, destination) {
  const { listeningItems } = await import('./listening-workflow.mjs');
  const { atomicText } = await import('../lib/json.mjs');
  const items = await listeningItems(root, 'cmn');
  await atomicText(
    destination,
    listeningPage({
      language: 'cmn',
      items,
      qualityIssues,
      maxTone: 5,
      audioBase: pathToFileURL(root + path.sep).href,
    }),
  );
  return { file: destination, recordings: items.length };
}
export function refreshMandarinDictionary(root, file, edition) {
  return curate(root, async () => {
    const result = await importDictionaryUnlocked(root, file, edition);
    await prepareMandarinUnlocked(root);
    return result;
  });
}
