import type { Catalog, LanguageProfile, ExerciseRow, Tone } from '../types.ts';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Expected a catalog object.');
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function forms(value: unknown) {
  const row = object(value);
  if (!Object.keys(row).length || !Object.values(row).every(text))
    throw Error('Invalid catalog written forms.');
}
function webURL(value: unknown) {
  if (!text(value)) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function validateCatalog(
  input: unknown,
  profile: LanguageProfile,
  { publication = false } = {},
): Catalog {
  const value = object(input);
  if (
    value.version !== 2 ||
    value.language !== profile.id ||
    value.transcriptionSystem !== profile.transcriptionSystem ||
    !['entries', 'pronunciations', 'recordings', 'references'].every((k) => Array.isArray(value[k]))
  )
    throw Error('Unsupported language recording catalog.');
  const rows = (key: string) => {
    const list = value[key];
    if (!Array.isArray(list)) throw Error('Missing catalog ' + key);
    return list.map(object);
  };
  const entries = rows('entries'),
    pronunciations = rows('pronunciations'),
    recordings = rows('recordings'),
    references = rows('references');
  for (const list of [entries, pronunciations, recordings]) {
    const ids = list.map((r) => r.id);
    if (!ids.every(text) || new Set(ids).size !== ids.length)
      throw Error('Missing or duplicate catalog identity.');
  }
  const entryIds = new Set(entries.map((e) => e.id));
  for (const entry of entries) {
    forms(entry.forms);
    if (typeof entry.gloss !== 'string') throw Error('Invalid gloss for ' + entry.id);
  }
  const byPronunciation = new Map(pronunciations.map((p) => [p.id, p]));
  for (const p of pronunciations) {
    if (!entryIds.has(p.entryId) || !Array.isArray(p.syllables) || !p.syllables.length)
      throw Error('Missing pronunciation or entry for ' + p.id);
    const syllables = p.syllables.map(object);
    for (const s of syllables) {
      if (!text(s.transcription) || !profile.tones.includes(s.tone as Tone))
        throw Error('Invalid syllable for ' + p.id);
      if (s.forms !== undefined) forms(s.forms);
      if (s.text !== undefined && typeof s.text !== 'string')
        throw Error('Invalid syllable text for ' + p.id);
    }
    if (p.phonetics !== undefined) {
      const features = object(p.phonetics);
      if (
        features.basis !== 'transcription' ||
        features.syllableCount !== p.syllables.length ||
        !Array.isArray(features.tonePattern) ||
        features.tonePattern.length !== p.syllables.length ||
        !features.tonePattern.every((tone, i) => tone === syllables[i].tone) ||
        !Array.isArray(features.syllables) ||
        features.syllables.length !== p.syllables.length
      )
        throw Error('Invalid phonetic features for ' + p.id);
      for (const feature of features.syllables.map(object))
        if (
          !text(feature.base) ||
          !['initial', 'final', 'coda'].every((k) => typeof feature[k] === 'string') ||
          (feature.checked !== undefined && typeof feature.checked !== 'boolean')
        )
          throw Error('Invalid syllable features for ' + p.id);
    }
  }
  for (const r of recordings) {
    const p = byPronunciation.get(r.pronunciationId),
      length = Array.isArray(p?.syllables) ? p.syllables.length : 0;
    if (!length) throw Error('Missing pronunciation or entry for ' + r.id);
    if (
      !Array.isArray(r.realizedTones) ||
      r.realizedTones.length !== length ||
      !r.realizedTones.every((t) => profile.tones.includes(t))
    )
      throw Error('Missing spoken tone annotations for ' + r.id);
    if (
      !text(r.audio) ||
      !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9._-]+\.mp3$/.test(r.audio) ||
      (publication && !r.audio.startsWith('audio/'))
    )
      throw Error('Invalid local audio path for ' + r.id);
    if (r.referenceOnly !== undefined && typeof r.referenceOnly !== 'boolean')
      throw Error('Invalid reference flag for ' + r.id);
    if (r.synthetic !== undefined && typeof r.synthetic !== 'boolean')
      throw Error('Invalid synthetic flag for ' + r.id);
    if (r.speakerId !== undefined && !text(r.speakerId)) throw Error('Invalid speaker for ' + r.id);
    if (r.speakerEvidence !== undefined) {
      const evidence = object(r.speakerEvidence);
      if (
        !text(r.speakerId) ||
        !text(evidence.name) ||
        !webURL(evidence.source) ||
        evidence.basis !== 'explicit-speaker-credit'
      )
        throw Error('Invalid speaker evidence for ' + r.id);
    }
    if (r.toneEvidence !== undefined) {
      const evidence = object(r.toneEvidence);
      if (
        !['assumed', 'reviewed', 'corrected'].includes(String(evidence.status)) ||
        !text(evidence.basis)
      )
        throw Error('Invalid tone evidence for ' + r.id);
    }
    if (
      r.toneTargets !== undefined &&
      (!Array.isArray(r.toneTargets) ||
        new Set(r.toneTargets).size !== r.toneTargets.length ||
        !r.toneTargets.every((i) => Number.isInteger(i) && i >= 0 && i < length))
    )
      throw Error('Invalid tone targets for ' + r.id);
    for (const field of ['author', 'license', 'conversion'])
      if (
        (publication && (field !== 'license' || r.synthetic !== true) && !text(r[field])) ||
        (r[field] !== undefined && typeof r[field] !== 'string')
      )
        throw Error('Missing or invalid ' + field + ' for ' + r.id);
    for (const field of ['source', 'licenseUrl'])
      if (((publication && r.synthetic !== true) || r[field] !== undefined) && !webURL(r[field]))
        throw Error('Missing or invalid ' + field + ' for ' + r.id);
  }
  const byRecording = new Map(recordings.map((r) => [r.id, r]));
  const seen = new Set();
  for (const ref of references) {
    const r = byRecording.get(ref.recordingId);
    if (
      !r ||
      !Number.isInteger(ref.targetIndex) ||
      Number(ref.targetIndex) < 0 ||
      !Array.isArray(r.realizedTones) ||
      r.realizedTones[Number(ref.targetIndex)] !== ref.tone ||
      seen.has(ref.tone) ||
      (Array.isArray(r.toneTargets) && !r.toneTargets.includes(ref.targetIndex))
    )
      throw Error('Invalid tone reference.');
    seen.add(ref.tone);
  }
  // Shape and relationships above are checked before establishing the typed boundary.
  return input as Catalog;
}
export function catalogRows(
  catalog: Catalog,
  profile: LanguageProfile,
  script = profile.defaultScript,
): ExerciseRow[] {
  validateCatalog(catalog, profile);
  const entries = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  const pronunciations = new Map(catalog.pronunciations.map((p) => [p.id, p]));
  return catalog.recordings.map((recording) => {
    const pronunciation = pronunciations.get(recording.pronunciationId)!;
    const entry = entries.get(pronunciation.entryId)!;
    const forms = entry.forms;
    return {
      ...entry,
      ...recording,
      text: forms[script] ?? forms.default ?? Object.values(forms)[0] ?? '',
      forms,
      wordId: entry.id,
      pronunciationId: pronunciation.id,
      anchor: recording.referenceOnly === true,
      transcription: pronunciation.syllables.map((s) => s.transcription).join(' '),
      syllables: pronunciation.syllables.map((s, i) => ({
        ...s,
        text: s.forms?.[script] ?? s.forms?.default ?? s.text ?? '',
        toneEligible: recording.toneTargets?.includes(i) ?? true,
        dictionaryTone: s.tone,
        tone: recording.realizedTones[i],
      })),
      tone: recording.realizedTones[0],
    };
  });
}
export function referenceRows(catalog: Catalog, rows: ExerciseRow[]): ExerciseRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return catalog.references.map((ref) => {
    const row = byId.get(ref.recordingId);
    if (!row || row.syllables[ref.targetIndex]?.tone !== ref.tone)
      throw Error('Invalid tone reference.');
    return { ...row, tone: ref.tone, targetIndex: ref.targetIndex };
  });
}
export const wordIdentity = (recording: Pick<ExerciseRow, 'id' | 'wordId' | 'pronunciationId'>) =>
  recording.pronunciationId || recording.wordId || recording.id;
export function chooseWordRecording<
  T extends Pick<ExerciseRow, 'id' | 'wordId' | 'pronunciationId'>,
>(recordings: T[], random = Math.random): T {
  const groups = new Map<string, T[]>();
  for (const r of recordings) {
    const key = wordIdentity(r);
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }
  if (!groups.size) throw Error('No eligible recordings.');
  const choices = [...groups.values()];
  const group = choices[Math.floor(random() * choices.length)];
  return group[Math.floor(random() * group.length)];
}
