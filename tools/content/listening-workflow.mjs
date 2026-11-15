import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readJSON } from '../lib/json.mjs';
import { writeCurationJSON } from './curation-json.mjs';
import { withCurationLock } from './curation-lock.mjs';
import { cantoneseReviewCatalog } from '../catalog/catalog.mjs';
import { mandarinReviewItems } from './mandarin.mjs';
import { emptyMandarin } from './mandarin.mjs';
import { loadToneExamples } from './tone-examples.mjs';
import { catalogReviewItems } from './listening-items.mjs';
import {
  digest,
  loadListeningReviews,
  reviewPath,
  reviewState,
  validateReviewForItem,
} from './listening-state.mjs';

export const decisionRevision = (decision) => digest(JSON.stringify(decision ?? null));

// Callers own the language's curation lock so snapshots and imports cannot race.
export async function listeningItemsUnlocked(root, language) {
  let items;
  if (language === 'yue') {
    items = await catalogReviewItems(
      root,
      await cantoneseReviewCatalog(root, { validateFiles: false }),
    );
  } else if (language === 'cmn') {
    items = await mandarinReviewItems(root);
    const examples = await loadToneExamples(root);
    if (examples)
      items.push(...(await catalogReviewItems(root, { ...emptyMandarin(), ...examples })));
  } else throw Error('Unknown review language: ' + language);
  const saved = await loadListeningReviews(root, language);
  const annotate = async (item) => {
    item.decision = saved.recordings[item.recordingId] ?? null;
    item.reviewStatus = reviewState(item, item.decision, language);
    item.previousRevision = decisionRevision(item.decision);
    // Read actual bytes as well as pinned inventory hashes. Corrupt archives cannot be approved.
    if (item.audioAvailable !== undefined) return;
    try {
      item.audioAvailable =
        digest(await readFile(path.join(root, item.audio))) === item.recordingSha256;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      item.audioAvailable = false;
    }
  };
  for (let start = 0; start < items.length; start += 32) {
    await Promise.all(items.slice(start, start + 32).map(annotate));
  }
  return items;
}

export function listeningItems(root, language) {
  return withCurationLock(root, language, () => listeningItemsUnlocked(root, language));
}

export async function importListeningReviews(root, language, file) {
  return withCurationLock(root, language, async () => {
    const incoming = await readJSON(file);
    const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (
      !object(incoming) ||
      incoming.version !== 1 ||
      incoming.language !== language ||
      !object(incoming.recordings) ||
      !object(incoming.previous) ||
      Object.keys(incoming).some(
        (k) => !['version', 'language', 'recordings', 'previous'].includes(k),
      ) ||
      Object.keys(incoming.previous).some((id) => !Object.hasOwn(incoming.recordings, id))
    )
      throw Error('Expected an exported version 1 listening review batch for ' + language);
    const items = new Map(
      (await listeningItemsUnlocked(root, language)).map((r) => [r.recordingId, r]),
    );
    const saved = await loadListeningReviews(root, language);
    for (const [id, decision] of Object.entries(incoming.recordings)) {
      const item = items.get(id);
      if (!item) throw Error('Unknown recording in review: ' + id);
      if (!item.audioAvailable) throw Error('Missing or changed audio: ' + id);
      validateReviewForItem(decision, item, language);
      if (
        incoming.previous[id] !== item.previousRevision &&
        decisionRevision(decision) !== item.previousRevision
      )
        throw Error(
          'Conflicting review changed since export: ' + id + '. Refresh the review page.',
        );
    }
    const result = { ...saved, recordings: { ...saved.recordings, ...incoming.recordings } };
    await writeCurationJSON(reviewPath(root, language), result);
    return {
      language,
      imported: Object.keys(incoming.recordings).length,
      file: reviewPath(root, language),
    };
  });
}
