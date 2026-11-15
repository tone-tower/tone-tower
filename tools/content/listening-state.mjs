import path from 'node:path';
import { createHash } from 'node:crypto';
import { readJSON } from '../lib/json.mjs';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const reviewPath = (root, language) =>
  path.join(root, 'data/content', language, 'listening-reviews.json');
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.trim().length > 0;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const fields = new Set([
  'status',
  'reviewer',
  'reviewedAt',
  'reason',
  'recordingSha256',
  'contentSha256',
  'pronunciationId',
  'realizedTones',
  'toneTargets',
  'referenceTargets',
  'qualityIssues',
]);
export const qualityIssues = ['noise', 'clipping', 'volume', 'silence', 'truncated', 'other'];

export function validateDecision(value, language) {
  if (
    !object(value) ||
    Object.keys(value).some((k) => !fields.has(k)) ||
    !['approved', 'uncertain', 'rejected', 'unreviewed'].includes(value.status) ||
    !text(value.reviewer) ||
    !text(value.reason) ||
    !text(value.reviewedAt) ||
    !Number.isFinite(Date.parse(value.reviewedAt)) ||
    !hash(value.recordingSha256) ||
    !hash(value.contentSha256)
  )
    throw Error('Review needs a supported status, reviewer, date, reason, and evidence hashes.');
  if (value.pronunciationId !== undefined && !text(value.pronunciationId))
    throw Error('Invalid reviewed pronunciation.');
  if (
    value.realizedTones !== undefined &&
    (!Array.isArray(value.realizedTones) ||
      !value.realizedTones.length ||
      !value.realizedTones.every(
        (t) => Number.isInteger(t) && t >= 1 && t <= (language === 'yue' ? 6 : 5),
      ))
  )
    throw Error('Invalid reviewed spoken tones.');
  for (const key of ['toneTargets', 'referenceTargets'])
    if (
      value[key] !== undefined &&
      (!Array.isArray(value[key]) ||
        new Set(value[key]).size !== value[key].length ||
        !value[key].every((i) => Number.isInteger(i) && i >= 0))
    )
      throw Error('Invalid reviewed target indices.');
  if (
    value.qualityIssues !== undefined &&
    (!Array.isArray(value.qualityIssues) ||
      !value.qualityIssues.every((issue) => qualityIssues.includes(issue)) ||
      new Set(value.qualityIssues).size !== value.qualityIssues.length)
  )
    throw Error('Invalid review quality issues.');
  if (value.status === 'approved' && (!value.pronunciationId || !value.realizedTones))
    throw Error('Approval needs a pronunciation and heard tones.');
  if (value.status !== 'approved' && value.referenceTargets?.length)
    throw Error('Only approved targets can be teaching references.');
  if (
    value.status !== 'approved' &&
    (value.realizedTones !== undefined || value.toneTargets !== undefined)
  )
    throw Error('Only an approval can supply heard tones or eligible target positions.');
}

export async function loadListeningReviews(root, language) {
  const value = await readJSON(reviewPath(root, language), {
    version: 1,
    language,
    recordings: {},
  });
  if (
    !object(value) ||
    value.version !== 1 ||
    value.language !== language ||
    !object(value.recordings) ||
    Object.keys(value).some((k) => !['version', 'language', 'recordings'].includes(k))
  )
    throw Error('Invalid listening review registry.');
  for (const decision of Object.values(value.recordings)) validateDecision(decision, language);
  return value;
}

// Include dictionary evidence and effective corrections, but never the listening decision itself.
export function contentFingerprint(candidates, baseline) {
  return digest(
    JSON.stringify({
      candidates: [...candidates].sort((a, b) =>
        a.pronunciationId.localeCompare(b.pronunciationId),
      ),
      baseline,
    }),
  );
}

export function reviewState(item, decision, language) {
  if (!decision) return 'unreviewed';
  validateDecision(decision, language);
  if (
    decision.recordingSha256 !== item.recordingSha256 ||
    decision.contentSha256 !== item.contentSha256
  )
    return 'stale';
  return decision.status;
}

export function validateReviewForItem(decision, item, language) {
  if (reviewState(item, decision, language) === 'stale')
    throw Error('Review refers to changed audio or pronunciation evidence: ' + item.recordingId);
  if (decision.status === 'unreviewed' || decision.status === 'rejected') return;
  const candidate = item.candidates.find((c) => c.pronunciationId === decision.pronunciationId);
  if (decision.status === 'approved' && !candidate)
    throw Error('Unknown reviewed pronunciation: ' + item.recordingId);
  if (decision.pronunciationId && !candidate)
    throw Error('Unknown reviewed pronunciation: ' + item.recordingId);
  const length = candidate?.syllables.length;
  if (decision.realizedTones && (!length || decision.realizedTones.length !== length))
    throw Error('Reviewed tones must match every syllable: ' + item.recordingId);
  for (const key of ['toneTargets', 'referenceTargets'])
    if (decision[key]?.some((i) => !length || i >= length))
      throw Error('Reviewed target is outside the pronunciation: ' + item.recordingId);
  for (const i of decision.referenceTargets ?? []) {
    if (decision.toneTargets && !decision.toneTargets.includes(i))
      throw Error('A reference must be an eligible listening target.');
    if (language === 'cmn' && (decision.realizedTones[i] === 5 ? length < 2 : length !== 1))
      throw Error('Mandarin references need isolated tones 1–4 or neutral tone in word context.');
  }
}

export function activeReview(item, decision, language) {
  const state = reviewState(item, decision, language);
  if (state === 'stale' || state === 'unreviewed') return null;
  validateReviewForItem(decision, item, language);
  return decision;
}
