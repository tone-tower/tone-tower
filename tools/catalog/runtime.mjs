import { Converter } from 'opencc-js';

const simplify = Converter({ from: 'hk', to: 'cn' });

// Cantonese inventory remains a source format; only this common format is published.
export function cantoneseCatalog(source) {
  return {
    version: 2,
    language: 'yue',
    transcriptionSystem: 'jyutping',
    entries: source.words.map((word) => {
      const traditional = word.character ?? word.syllables.map((s) => s.character).join('');
      return {
        id: word.id,
        forms: { default: traditional, traditional },
        gloss: word.gloss,
        dictionarySource: word.dictionarySource,
        glossSource: word.glossSource,
        metadata: word.metadata,
      };
    }),
    pronunciations: source.words.map((word) => ({
      id: word.id,
      entryId: word.id,
      kind: word.syllables.length === 1 ? 'syllable' : 'word',
      syllables: word.syllables.map((s) => ({
        text: s.character,
        transcription: s.jyutping,
        tone: s.tone,
      })),
    })),
    recordings: source.recordings.map((row) => ({
      ...row,
      wordId: undefined,
      anchor: undefined,
      pronunciationId: row.wordId,
      referenceOnly: row.anchor === true,
      realizedTones: source.words
        .find((word) => word.id === row.wordId)
        .syllables.map((s) => s.tone),
    })),
    references: source.recordings
      .filter((row) => row.anchor)
      .map((row) => ({
        tone: source.words.find((word) => word.id === row.wordId).syllables[0].tone,
        recordingId: row.id,
        targetIndex: 0,
      })),
  };
}

export function withSimplifiedCantonese(catalog) {
  const simplifiedEntries = new Map();
  const pronunciations = catalog.pronunciations.map((pronunciation) => {
    const traditional = pronunciation.syllables.map((syllable) => syllable.text).join('');
    const simplifiedCharacters = [...simplify(traditional)];
    // Convert the whole word for context, then keep the original syllable boundaries.
    const aligned = simplifiedCharacters.length === [...traditional].length;
    let offset = 0;
    const syllables = pronunciation.syllables.map((syllable) => {
      const end = offset + [...syllable.text].length;
      const simplified = aligned
        ? simplifiedCharacters.slice(offset, end).join('')
        : simplify(syllable.text);
      offset = end;
      return { ...syllable, forms: { traditional: syllable.text, simplified } };
    });
    simplifiedEntries.set(
      pronunciation.entryId,
      syllables.map((syllable) => syllable.forms.simplified).join(''),
    );
    return { ...pronunciation, syllables };
  });
  const entries = catalog.entries.map((entry) => ({
    ...entry,
    forms: { ...entry.forms, simplified: simplifiedEntries.get(entry.id) },
  }));
  return { ...catalog, entries, pronunciations };
}
