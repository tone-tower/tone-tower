import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  activeReview,
  contentFingerprint,
  digest,
  loadListeningReviews,
} from './listening-state.mjs';

export function pronunciationCandidates(catalog) {
  const entries = new Map(catalog.entries.map((e) => [e.id, e]));
  return catalog.pronunciations.map((p) => {
    const entry = entries.get(p.entryId);
    return {
      pronunciationId: p.id,
      entryId: entry.id,
      forms: entry.forms,
      gloss: entry.gloss,
      syllables: p.syllables,
      dictionarySource: entry.dictionarySource ?? null,
    };
  });
}

export async function catalogReviewItems(root, catalog) {
  const candidates = pronunciationCandidates(catalog);
  const byId = new Map(candidates.map((c) => [c.pronunciationId, c]));
  const byForm = new Map();
  for (const candidate of candidates)
    for (const form of new Set(Object.values(candidate.forms))) {
      if (!byForm.has(form)) byForm.set(form, []);
      byForm.get(form).push(candidate);
    }
  const items = [];
  const makeItem = async (r) => {
    const current = byId.get(r.pronunciationId);
    const alternatives = new Map();
    for (const form of Object.values(current.forms))
      for (const c of byForm.get(form) ?? []) alternatives.set(c.pronunciationId, c);
    const matches = [...alternatives.values()];
    const bytes = await readFile(path.join(root, r.audio)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    return {
      recordingId: r.id,
      text: current.forms.default ?? Object.values(current.forms)[0],
      audio: r.audio,
      source: r.source,
      speaker: r.speakerEvidence?.name ?? r.author,
      speakerId: r.speakerId,
      recordingSha256: bytes ? digest(bytes) : null,
      candidates: matches,
      pronunciationId: r.pronunciationId,
      realizedTones: r.realizedTones,
      toneTargets: r.toneTargets ?? r.realizedTones.map((_, i) => i),
      audioAvailable: bytes !== null,
      contentSha256: contentFingerprint(matches, {
        pronunciationId: r.pronunciationId,
        realizedTones: r.realizedTones,
        toneTargets: r.toneTargets ?? null,
        source: r.source,
        audio: r.audio,
      }),
    };
  };
  for (let start = 0; start < catalog.recordings.length; start += 32) {
    items.push(...(await Promise.all(catalog.recordings.slice(start, start + 32).map(makeItem))));
  }
  return items;
}

export async function applyCatalogReviews(root, catalog) {
  const saved = await loadListeningReviews(root, catalog.language);
  if (!Object.keys(saved.recordings).length) return catalog;
  const items = new Map((await catalogReviewItems(root, catalog)).map((r) => [r.recordingId, r]));
  const recordings = [];
  const explicitReferences = [];
  for (const original of catalog.recordings) {
    const item = items.get(original.id);
    const decision = activeReview(item, saved.recordings[original.id], catalog.language);
    if (decision?.status === 'rejected') continue;
    const row = { ...original };
    if (decision?.status === 'approved') {
      row.pronunciationId = decision.pronunciationId;
      row.realizedTones = decision.realizedTones;
      row.toneTargets = decision.toneTargets ?? decision.realizedTones.map((_, i) => i);
      row.toneEvidence = { status: 'reviewed', basis: 'Human listening review' };
      explicitReferences.push(
        ...(decision.referenceTargets ?? []).map((targetIndex) => ({
          recordingId: row.id,
          targetIndex,
          tone: row.realizedTones[targetIndex],
        })),
      );
    } else if (decision?.status === 'uncertain') {
      row.toneTargets = [];
    }
    recordings.push(row);
  }
  const byId = new Map(recordings.map((r) => [r.id, r]));
  const eligible = (r, i, tone) =>
    r && r.realizedTones[i] === tone && (r.toneTargets?.includes(i) ?? true);
  const references = [];
  for (const old of catalog.references) {
    const explicit = explicitReferences.find((r) => r.tone === old.tone);
    if (explicit) {
      references.push(explicit);
      continue;
    }
    if (eligible(byId.get(old.recordingId), old.targetIndex, old.tone)) {
      references.push(old);
      continue;
    }
    // Keep the language usable when a reference is rejected. The replacement retains its evidence.
    const replacement = recordings.find(
      (r) => r.realizedTones.length === 1 && eligible(r, 0, old.tone),
    );
    if (replacement)
      references.push({ tone: old.tone, recordingId: replacement.id, targetIndex: 0 });
  }
  // A rejected teaching-only example must not leak into ordinary exercise selection.
  return { ...catalog, recordings, references };
}
