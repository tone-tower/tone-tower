import { createHash } from 'node:crypto';

export function creditedSpeaker(recording, language) {
  // Only an explicit speaker role is evidence. A creator/uploader/filename alone is insufficient.
  const match = recording.author?.match(/(?:^|\n)Speaker:[ \t]*([^\n]+?)(?=[ \t]+Recorder:|\n|$)/);
  if (!match || !recording.source?.startsWith('https://commons.wikimedia.org/')) return {};
  const name = match[1].trim().normalize('NFC');
  if (!name || /^(?:unknown|anonymous|unidentified)$/i.test(name)) return {};
  return {
    speakerId:
      language + '-commons-credit-' + createHash('sha256').update(name).digest('hex').slice(0, 24),
    speakerEvidence: { name, source: recording.source, basis: 'explicit-speaker-credit' },
  };
}

export function phoneticFeatures(pronunciation, profile) {
  return {
    basis: 'transcription',
    syllableCount: pronunciation.syllables.length,
    tonePattern: pronunciation.syllables.map((s) => s.tone),
    syllables: pronunciation.syllables.map((s) => {
      const base = profile.withoutTones(s.transcription);
      // Spelling helpers return numbered fragments; a final such as ü is not a whole Pinyin syllable.
      const initial = profile
        .practiceSpelling(s.transcription, 'initials')
        .replace(/[1-6]$/, '')
        .replace(/^-$/, '');
      const final = profile.practiceSpelling(s.transcription, 'finals').replace(/[1-6]$/, '');
      const coda = /^(?:m|n|ng|hm|hng)$/.test(base)
        ? ''
        : (final.match(profile.id === 'yue' ? /(ng|[mnptk])$/ : /(ng|n)$/)?.[0] ?? '');
      return {
        base,
        initial,
        final,
        coda,
        ...(profile.id === 'yue' ? { checked: /[ptk]$/.test(coda) } : {}),
      };
    }),
  };
}

export function enrichCatalog(catalog, profile) {
  return {
    ...catalog,
    pronunciations: catalog.pronunciations.map((p) => ({
      ...p,
      phonetics: phoneticFeatures(p, profile),
    })),
    recordings: catalog.recordings.map((r) => ({
      ...r,
      ...(!r.speakerId ? creditedSpeaker(r, profile.id) : {}),
      toneEvidence: r.toneEvidence ?? {
        status: 'assumed',
        basis: 'Source label and dictionary reading; not independently auditioned.',
      },
    })),
  };
}
