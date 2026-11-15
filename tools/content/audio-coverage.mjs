import path from 'node:path';
import { readJSON } from '../lib/json.mjs';
import { withCurationLock } from './curation-lock.mjs';
import { cantoneseReviewCatalog } from '../catalog/catalog.mjs';
import { buildMandarinCatalogUnlocked } from './mandarin.mjs';
import { applyCatalogReviews } from './listening-items.mjs';
import { listeningItemsUnlocked } from './listening-workflow.mjs';
import { digest, loadListeningReviews } from './listening-state.mjs';

const counts = (values) =>
  values.reduce((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
export const measurementPath = (root, language) =>
  path.join(root, 'data/content', language, 'audio-measurements.json');

export function validateMeasurements(value, language) {
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (
    !object(value) ||
    value.version !== 1 ||
    value.language !== language ||
    !object(value.recordings)
  )
    throw Error('Invalid audio measurement registry.');
  const flags = ['full-scale-samples', 'quiet', 'leading-silence', 'trailing-silence'];
  for (const row of Object.values(value.recordings)) {
    if (
      !object(row) ||
      row.measurementVersion !== 1 ||
      !/^[a-f0-9]{64}$/.test(row.recordingSha256 ?? '') ||
      typeof row.measuredAt !== 'string' ||
      !Number.isFinite(Date.parse(row.measuredAt)) ||
      !Number.isFinite(row.duration) ||
      row.duration <= 0 ||
      !Number.isInteger(row.sampleRate) ||
      row.sampleRate <= 0 ||
      !Number.isInteger(row.channels) ||
      row.channels < 1 ||
      row.channels > 32 ||
      ![row.peakDb, row.rmsDb].every((v) => v === null || Number.isFinite(v)) ||
      !Number.isFinite(row.fullScaleSampleFraction) ||
      row.fullScaleSampleFraction < 0 ||
      row.fullScaleSampleFraction > 1 ||
      ![row.leadingSilenceSeconds, row.trailingSilenceSeconds].every(
        (v) => Number.isFinite(v) && v >= 0 && v <= row.duration,
      ) ||
      !Array.isArray(row.flags) ||
      !row.flags.every((v) => flags.includes(v)) ||
      new Set(row.flags).size !== row.flags.length
    )
      throw Error('Invalid audio measurements.');
  }
  return value;
}

export function contrastCandidates(catalog) {
  const recordings = new Map(catalog.pronunciations.map((p) => [p.id, []]));
  for (const r of catalog.recordings)
    if (!r.referenceOnly && r.toneTargets?.length !== 0) recordings.get(r.pronunciationId).push(r);
  const bases = new Map();
  for (const p of catalog.pronunciations) {
    if (p.syllables.length !== 1 || !recordings.get(p.id).length) continue;
    const base = p.phonetics?.syllables[0].base;
    if (!base) continue;
    if (!bases.has(base)) bases.set(base, []);
    bases.get(base).push(p);
  }
  return {
    status: 'automatically-proposed-not-reviewed-teaching-sets',
    samePronunciationVoices: [...recordings]
      .filter(([, rows]) => new Set(rows.map((r) => r.speakerId).filter(Boolean)).size > 1)
      .map(([pronunciationId, rows]) => ({
        pronunciationId,
        speakers: [...new Set(rows.map((r) => r.speakerId).filter(Boolean))],
        recordingIds: rows.map((r) => r.id),
      })),
    sameSyllableDifferentTones: [...bases]
      .filter(([, ps]) => new Set(ps.map((p) => p.syllables[0].tone)).size > 1)
      .map(([base, ps]) => {
        const speakers = new Map();
        for (const p of ps)
          for (const r of recordings.get(p.id)) {
            if (!r.speakerId) continue;
            if (!speakers.has(r.speakerId)) speakers.set(r.speakerId, new Set());
            speakers.get(r.speakerId).add(r.realizedTones[0]);
          }
        return {
          base,
          members: ps.map((p) => ({
            pronunciationId: p.id,
            dictionaryTone: p.syllables[0].tone,
            recordings: recordings.get(p.id).map((r) => ({
              id: r.id,
              heardTone: r.realizedTones[0],
              speakerId: r.speakerId ?? null,
              evidence: r.toneEvidence?.status ?? 'assumed',
            })),
          })),
          sameSpeakerComparisons: [...speakers]
            .filter(([, tones]) => tones.size > 1)
            .map(([speakerId, tones]) => ({ speakerId, tones: [...tones].sort() })),
        };
      }),
  };
}

export function coverageReport(catalog, items, saved, measurements = { recordings: {} }) {
  const byPronunciation = new Map(catalog.pronunciations.map((p) => [p.id, p]));
  const playable = catalog.recordings.filter((r) => !r.referenceOnly);
  const groups = new Map();
  for (const r of playable) {
    if (!groups.has(r.pronunciationId)) groups.set(r.pronunciationId, []);
    groups.get(r.pronunciationId).push(r);
  }
  const known = playable.filter((r) => r.speakerId);
  const linkedIds = new Set(known.filter((r) => !r.speakerEvidence).map((r) => r.speakerId));
  const creditedIds = new Set(
    known
      .filter((r) => r.speakerEvidence?.basis === 'explicit-speaker-credit')
      .map((r) => r.speakerId),
  );
  const validMeasurements = items
    .filter(
      (item) => measurements.recordings[item.recordingId]?.recordingSha256 === item.recordingSha256,
    )
    .map((item) => ({
      recordingId: item.recordingId,
      ...measurements.recordings[item.recordingId],
    }));
  const levels = validMeasurements
    .map((m) => m.rmsDb)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const median = levels.length ? levels[Math.floor(levels.length / 2)] : null;
  const knownItemIds = new Set(items.map((r) => r.recordingId));
  const unresolvedMatches = items.filter(
    (i) => !i.excluded && !['approved', 'rejected'].includes(i.reviewStatus) && !i.pronunciationId,
  );
  return {
    version: 1,
    language: catalog.language,
    snapshotSha256: digest(
      JSON.stringify(
        items.map((i) => [i.recordingId, i.recordingSha256, i.contentSha256, i.previousRevision]),
      ),
    ),
    summary: {
      recordings: catalog.recordings.length,
      playableRecordings: playable.length,
      distinctPronunciations: groups.size,
      knownSpeakerIdentities: new Set(known.map((r) => r.speakerId)).size,
      sourceLinkedSpeakers: linkedIds.size,
      explicitCreditSpeakers: creditedIds.size,
      recordingsWithUnknownSpeaker: playable.length - known.length,
      pronunciationsWithMultipleRecordings: [...groups.values()].filter((g) => g.length > 1).length,
      pronunciationsWithMultipleKnownSpeakers: [...groups.values()].filter(
        (g) => new Set(g.map((r) => r.speakerId).filter(Boolean)).size > 1,
      ).length,
      reviewProgress: counts(items.map((i) => i.reviewStatus)),
      playableToneEvidence: counts(playable.map((r) => r.toneEvidence?.status ?? 'assumed')),
      unresolvedMatches: {
        ambiguous: unresolvedMatches.filter((i) => i.candidates.length > 1).length,
        unmatched: unresolvedMatches.filter((i) => !i.candidates.length).length,
        unavailableAudio: items.filter((i) => !i.audioAvailable).length,
      },
      measurements: {
        current: validMeasurements.length,
        missingOrStale: items.length - validMeasurements.length,
      },
    },
    speakers: counts(known.map((r) => r.speakerId)),
    syllableCounts: counts(
      [...groups.keys()].map((id) => byPronunciation.get(id).syllables.length),
    ),
    dictionaryTonePatterns: counts(
      [...groups.keys()].map((id) =>
        byPronunciation
          .get(id)
          .syllables.map((s) => s.tone)
          .join('-'),
      ),
    ),
    spokenTonePatterns: counts(
      playable.filter((r) => r.toneTargets?.length !== 0).map((r) => r.realizedTones.join('-')),
    ),
    references: catalog.references.map((ref) => ({
      ...ref,
      evidence: catalog.recordings.find((r) => r.id === ref.recordingId)?.toneEvidence,
    })),
    staleReviews: items.filter((i) => i.reviewStatus === 'stale').map((i) => i.recordingId),
    retainedReviewsOutsideCurrentInventory: Object.keys(saved.recordings).filter(
      (id) => !knownItemIds.has(id),
    ),
    unresolved: items
      .filter((i) => unresolvedMatches.includes(i) || !i.audioAvailable)
      .map((i) => ({
        recordingId: i.recordingId,
        text: i.text,
        candidates: i.candidates.map((c) => c.pronunciationId),
        audioAvailable: i.audioAvailable,
      })),
    audioQuality: {
      note: 'Automatic measurements flag candidates for inspection; they are not listening review.',
      medianRmsDb: median,
      flagged: validMeasurements
        .filter(
          (m) =>
            m.flags?.length ||
            (median !== null && m.rmsDb !== null && Math.abs(m.rmsDb - median) >= 12),
        )
        .map((m) => ({
          ...m,
          flags: [
            ...(m.flags ?? []),
            ...(median !== null && m.rmsDb !== null && Math.abs(m.rmsDb - median) >= 12
              ? ['level-outlier']
              : []),
          ],
        })),
    },
    contrastCandidates: contrastCandidates(catalog),
  };
}

export function audioCoverage(root, language) {
  return withCurationLock(root, language, async () => {
    const items = await listeningItemsUnlocked(root, language);
    const catalog =
      language === 'cmn'
        ? await buildMandarinCatalogUnlocked(root)
        : await applyCatalogReviews(
            root,
            await cantoneseReviewCatalog(root, { validateFiles: false }),
          );
    const saved = await loadListeningReviews(root, language);
    const measurements = await readJSON(measurementPath(root, language), {
      version: 1,
      language,
      recordings: {},
    });
    return coverageReport(catalog, items, saved, validateMeasurements(measurements, language));
  });
}
