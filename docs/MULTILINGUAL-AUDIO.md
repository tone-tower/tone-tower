# Mandarin audio and multilingual content design

Research checked 13 November 2026. The initial independent Mandarin archive
downloader is now implemented; see [the run instructions](MANDARIN-DOWNLOAD.md).
The playable Mandarin beta, language profiles, common runtime catalog, separate sites, and correction tools are implemented; see [Mandarin website and listening review](MANDARIN-WEBSITE.md). The research and remaining enrichment options below remain reference material. Downloads alone do not add playable Mandarin vocabulary.

## Recommended direction

Start with a language-aware recording archive and a Mandarin Commons adapter.
Downloading should require verified source, attribution and file integrity, but
should not require a dictionary match, English meaning, HSK level or playable
pronunciation annotation. Curating recordings into exercises is a separate step.

Use Commons for multiple speakers and word recordings. Consider audio-cmn as a
second source for systematic isolated-syllable coverage. Keep those two exercise
types distinct. Mandarin HSK membership is sourced independently from recording metadata.

## What is available

A live, paginated Commons API audit found:

| Discovery scope                                                                                              | Files found | Interpretation                                                    |
| ------------------------------------------------------------------------------------------------------------ | ----------: | ----------------------------------------------------------------- |
| [Lingua Libre pronunciation-cmn](https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation-cmn) |       4,108 | Main Mandarin recording candidate pool                            |
| [Mandarin pronunciation](https://commons.wikimedia.org/wiki/Category:Mandarin_pronunciation), direct members |          45 | Mixed material, including images and long speech; needs filtering |
| [Lingua Libre pronunciation-zho](https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation-zho) |           4 | Chinese macrolanguage labels; require language confirmation       |

The union contained 4,157 file pages. These are discovery counts, not counts of
usable, licensed-and-reviewed game clips. The audit did not recursively scan
Mandarin dialect, names or other pronunciation subcategories.

Filename parsing identified 20 speaker labels in the `cmn` collection. Its six
largest groups were Fake estate (1,148), CanonNi (845), Luilui6666 (805), Jouketou
(549), Levi Highway (243), and Shangkuanlc (240). Labels are provisional: stable
speaker identity should come from the source metadata, rather than filename text.

Across the parsed candidates, 475 exact written forms appeared under multiple
speaker labels. Examples include 你 (five), 我 and 中国 (four each), and 你好 (two).
These counts do not establish that the recordings use the same reading, accent,
word sense or tone realization. That requires annotation and listening review.

One file from each of the twelve largest filename groups was inspected through
the Commons imageinfo API. The returned selected licences were CC0 or CC BY-SA
4.0. All twelve originals downloaded successfully, matched the source SHA-1
checksums and decoded with FFmpeg/FFprobe. Together they contain 1,224,648 bytes.
This checks transport and decoding, not pronunciation correctness or teaching
suitability. Examples with visible file-page licensing include:

- [CanonNi: 拼音](<https://commons.wikimedia.org/wiki/File:LL-Q9192_(cmn)-CanonNi-拼音.wav>): CC0.
- [Yug: 时候](https://commons.wikimedia.org/wiki/File:LL-Q9192—Yug—时候.wav): CC0; an additional file-page example, outside the twelve-file trial.
- [Luilui6666: 中国菜](<https://commons.wikimedia.org/wiki/File:LL-Q9192_(cmn)-Luilui6666-中国菜.wav>): offers CC BY-SA 4.0 and CC0.
- [雲角: 一](https://commons.wikimedia.org/?curid=71028924): the API selected CC BY-SA 4.0.

Some files offer several alternative licences; preserve the alternatives and
record which one we use. Do not infer a recording's licence from the category,
speaker, Commons page footer or the licence on structured metadata. Commons'
[reuse instructions](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)
explain recording-specific attribution and reuse requirements.

[audio-cmn](https://github.com/hugolpz/audio-cmn) lists 1,707 syllable recordings
by Chen Wang plus a word collection attributed to Yue Tan. It supplies MP3s at
several bitrates and declares CC BY-SA. Confirm the exact licence version and
original credits before importing. Its HSK collection refers to HSK 2000, so that
folder name must not become a current HSK level. Its neutral-tone files also need
inspection: the README mentions historical duplicate tone-5 audio. A filename
alone is not pronunciation evidence.

Use the Commons API rather than depending on a bulk archive: Lingua Libre's
[download guide](https://commons.wikimedia.org/wiki/Help:Lingua_Libre/Download_datasets)
documents archives and category-based tools, but no working Mandarin bulk archive
was verified here. A `zho` label or a Mandarin parent category alone should not
silently qualify dialect recordings as Standard Mandarin.

## Data boundaries

Use explicit language codes (`cmn`, `yue`) and independent transcription-system
IDs (`pinyin`, `jyutping`). A future language can have several writing or
transcription systems. Shared entities must not require Han characters, numbered
tones, or one syllable per written character.

| Entity              | Owns                                                                                                                             | Does not own                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Language profile    | Display name, transcription systems, language-specific validation and exercise capabilities                                      | Source-provider download code                                      |
| Vocabulary entry    | Stable identity, written forms, meanings, optional curriculum memberships                                                        | Speaker and audio licence                                          |
| Pronunciation       | Entry link when known, language, kind (`syllable`, `word`, `phrase`), transcriptions and optional syllable/tone annotations      | Download state or HSK level                                        |
| Speaker             | Stable source-backed identity, credited name, source identity links                                                              | Assumed identity based on uploader; guessed accent or demographics |
| Recording           | Source identity/version, speaker link when known, transcription evidence, original/derived file hashes, attribution and licences | An invented word or meaning to satisfy a schema                    |
| Annotation/review   | Recording-to-pronunciation match, confidence/status, heard pronunciation when reviewed, exclusions with reasons                  | Replacement of the original source claims                          |
| Metadata enrichment | Entry-linked curriculum, frequency or topic facts with source/version/matching evidence                                          | Untraceable difficulty labels                                      |

One entry can have several pronunciations, and one pronunciation can have several
recordings by several speakers. Isolated syllables may have no vocabulary entry.
An archived recording may initially have neither a pronunciation link nor a known
speaker. Unknown values stay absent; downloading must not invent them.

Store dictionary citation forms separately from reviewed realizations in a clip.
For example, a dictionary transcription and a recording annotation can differ
because of tone sandhi. The eventual exercise declares whether it tests spelling,
dictionary tone or the tone heard. Neutral tone needs an explicit annotation;
language-specific transcription rules can represent it as a numbered tone without
making that convention universal. Erhua also prevents assuming a one-to-one
character/syllable alignment.

Keep alternate simplified/traditional forms as sourced forms. Do not merge
homographs, different readings or speaker aliases solely by matching text. A
second host of the same recording is additional provenance, not another speaker.

## Files and pipeline

Proposed locations for the new archive:

```text
data/audio/collections/cmn/
  sources.json          Source configuration, scope and exact licence policy
  recordings.json       Durable downloaded inventory and original source evidence
  speakers.json         Source-backed speaker identities
  annotations.json      Pronunciation links, review outcomes and exclusions

data/content/cmn/
  entries.json          Vocabulary and stable entry IDs, once curated
  pronunciations.json   Syllables/readings and entry links, once curated
  metadata.json         Sourced enrichments, including future HSK memberships

audio/cmn/              Validated game-format derivatives, once selected
.audio-import-cache/cmn/ Discovery pages, API responses, originals and retry state
```

The initial implementation creates source configuration, a recording inventory,
a review file when needed, originals in the cache and validated MP3s in
`audio/cmn/`. Speaker identities are embedded in recording evidence for atomic
saving; standalone speaker and annotation registries remain a later option. Empty
vocabulary registries are unnecessary. Durable inventory is independent of the
cache; if a source changes upstream, reacquiring its pinned original can require
manual review. Commit MP3s together with their metadata when keeping the archive.

The sequence is:

1. **Discover:** source adapters produce candidates with source IDs and evidence.
   Cache pagination and resume it. Refreshing discovery must not remove imported
   records, manual annotations or durable exclusions.
2. **Inspect:** fetch file metadata; validate language evidence and exact licence
   identifiers/URLs. Preserve creator, speaker, recorder and uploader separately
   where supplied. Missing or conflicting metadata goes to review.
3. **Download:** save each original safely, check the provider checksum, compute
   our SHA-256, decode it and save inventory atomically after each success. Pin the
   source file timestamp/hash or repository revision. Redownload changed source
   bytes only through an explicit update; do not silently replace reviewed audio.
4. **Curate:** link to pronunciations/entries, annotate ambiguity and independently
   review representative clips. Retain separate technical and listening outcomes.
5. **Build:** produce a language-specific playable catalog and only its referenced
   derivatives. A successful download alone does not make a recording playable.

Reuse atomic JSON saving, source checksum handling, the operation lock, MP3
conversion/decoding and Commons pacing/backoff. Keep provider-specific discovery
and attribution parsing in adapters. Already suitable MP3s need no re-encoding.
Duration limits belong to collection/exercise policy, rather than a universal
ten-second rule. Preserve processing details when creating a derivative.

Use an exact initial licence allowlist: CC0 1.0, CC BY 4.0 and CC BY-SA 4.0.
Additional versions can be enabled after source-specific review. In particular,
do not copy the current importer's `startsWith('CC BY')` check: it would also
accept a label containing NC or ND. Ambiguous labels, mismatched URLs, deletion
warnings and missing attribution need review rather than automatic inclusion.

Download status should distinguish pending, downloaded, retryable failure and
needs-review. Selection or listening rejection is a durable, reasoned annotation;
temporary network failure is not a pronunciation rejection. Preserve HTTP
cooldowns across restarts, stop safely on Ctrl+C, and detect corrupt/missing local
files rather than treating file existence as successful completion.

## Several speakers without biased practice

Report coverage by pronunciation: number of eligible recordings, distinct verified
speakers, isolated syllables and word tone patterns, plus unmapped/review counts.
Report provisional text overlap separately until pronunciations are verified.
Choose a vocabulary/pronunciation target before choosing a speaker, so a prolific
contributor cannot make one target disproportionately common. The current game's
word-first selection is already a useful starting point.

The first curated batch should include common words recorded by several speakers
and representative isolated syllables. Check speaker balance, audio quality and
same-reading overlap before promising a certain number of voices per exercise.
Do not require every word to have several speakers; retain useful single-speaker
coverage and make the actual availability visible in internal reports.

## HSK 3.0 vocabulary metadata

Tone Tower uses [Gushi's CC BY-SA 4.0 vocabulary export](https://gushichinese.com/hsk-3.0/downloads)
of the November 2025 HSK examination syllabus. The catalog carries `hskSource`
with the syllabus edition, data attribution and pinned export checksum.
Vocabulary entries carry `metadata.hsk` with a string level, one-based Gushi
export row numbers and the match method. Levels 1–6 are individual levels and
`7-9` is the shared advanced band.

A match requires the exact simplified form and dictionary Pinyin, including its
tone sequence. Conflicting source levels for the same spelling and reading stay
untagged. An untagged entry has no resolved membership in this edition. The tags
are available in the catalog for later exercise filters.

### Mandarin coverage as of 2026-11-26

Playable entries count distinct Tone Tower vocabulary IDs with at least one
playable recording. Syllabus coverage counts distinct Gushi export rows linked
by those entries. A single vocabulary entry can link to multiple syllabus rows,
and multiple vocabulary entries can link to the same row. Each level shows the
rows introduced at that level.

| HSK level           | Playable entries | Syllabus rows covered | Playable recordings |
| ------------------- | ---------------: | --------------------: | ------------------: |
| 1                   |              268 |             266 / 300 |                 640 |
| 2                   |              162 |             163 / 200 |                 276 |
| 3                   |              451 |             451 / 500 |                 806 |
| 4                   |              833 |           832 / 1,000 |               1,514 |
| 5                   |            1,334 |         1,336 / 1,600 |               1,561 |
| 6                   |            1,361 |         1,363 / 1,800 |               1,844 |
| 7–9                 |            2,664 |         2,666 / 5,600 |               3,262 |
| **Tagged subtotal** |        **7,073** |    **7,077 / 11,000** |           **9,903** |
| Untagged            |            2,014 |                     — |               2,178 |
| **Catalog total**   |        **9,087** |                       |          **12,081** |

Of the untagged entries, 1,879 have no exact simplified spelling in the import.
Another 109 have a spelling match with a different dictionary reading, and 26
have competing levels for the same spelling and reading. For example, 不客气
has dictionary `bu4 ke4 qi5` in Tone Tower and `bú kèqi` in the syllabus.
等 has matching readings at levels 2 and 4 in the export.

唱歌 (`chàng gē`, `chang4 ge1`) is a Level 1 vocabulary entry in the 2021
proficiency standard. The November 2025 exam syllabus uses 唱歌 in a Level 1
leisure task and lists 唱 and 歌 individually in its Level 1 vocabulary table.
The combined phrase has no row in the Gushi exam vocabulary export.
[2021 proficiency standard](https://www.moe.gov.cn/jyb_xwfb/gzdt_gzdt/s5987/202103/W020210329527301787356.pdf)
[November 2025 exam syllabus](https://download.chinesetest.cn/newhsk-site/Syllabus/H_DG_1110.pdf)

### Vocabulary pools for Mandarin adventures

Tower and Skyrail use each word's minimum practice tier alongside their
existing recording eligibility rules. Free Practice and missed-question
practice use the recordings selected by those activities. On resuming a saved
adventure, the saved recording can finish and new draws use the difficulty's
updated pool.

| Difficulty     | Vocabulary pool                                           | Playable catalog entries |
| -------------- | --------------------------------------------------------- | -----------------------: |
| Easy           | HSK 1–3 plus words assigned to Easy                       |                    1,214 |
| Normal         | Everything in Easy, HSK 4–6, and words assigned to Normal |                    5,688 |
| Hard / Extreme | Full vocabulary pool                                      |                    9,087 |

Practice tiers and November 2025 exam vocabulary labels are tracked separately.
Of the 2,014 playable entries without a 2025 label, 333 received Easy, 946
Normal, and 735 Hard. Hard includes words kept for the full pool because their
usefulness at an earlier difficulty is less clear. Vocabulary difficulty and
recording quality are evaluated independently.

The practice-tier import checked each entry against NihaoLearn's exports of
the 2021 proficiency standard and HSK 2.0 (2009). It records a level when a
single level matches the simplified form and dictionary reading. When both
sources match, the 2021 standard takes precedence. Its bands 1–3 map to Easy,
4–6 to Normal, and 7–9 to Hard. With HSK 2.0 alone, levels 1–3 map to Easy, 4–5
to Normal, and 6 to Hard. 唱歌 matches 2021 Level 1 and HSK 2.0 Level 2 and
appears from Easy. [NihaoLearn exports](https://nihaolearn.com/resources)

Of the 2,014 entries, 557 matched at least one older list. The other 1,457
received individual editorial tier estimates. The source data in
`data/content/cmn/practice-tiers.json` retains matches, editorial decisions
and the checksums of both older downloads. New vocabulary with no tier evidence
starts in Hard.

### Rebuilding labels

The source projection is `data/content/cmn/hsk.json`. To regenerate it, pass the
pinned Gushi all-levels word JSON to the importer, then rebuild the catalog.

```sh
npm run mandarin:hsk -- --file path/to/hsk-3.0-words-all.json
npm run catalog
npm run mandarin:status
```

With a current generated catalog, regenerate the supplementary tiers using the
pinned 2021 and HSK 2.0 downloads. The importer preserves editorial assignments
whose vocabulary form and reading still match. To change decisions, pass
`--assessments` with a JSON object of vocabulary IDs mapped to
`{ "tier": "easy", "reason": "..." }` objects, then rebuild.

```sh
npm run mandarin:practice-tiers -- --file path/to/hsk-2021-all.json --legacy path/to/hsk-2.0-all.json
```

## Original implementation sequence and remaining limits

1. Implement the collection manifest and Commons discovery/inspection adapter;
   prove resumable download, integrity checks and source-backed speaker identity
   with a small batch across several speakers.
2. Download the selected Mandarin archive and generate a coverage report. Retain
   unannotated recordings without exposing them to the game.
3. Add pronunciation/word curation; evaluate audio-cmn for missing isolated
   syllables after resolving its licence details and neutral-tone questions.
4. Add sourced curriculum metadata when useful.
5. Generalize runtime catalogs, language selection, exercise tone/spelling rules,
   credits and saved progress, then migrate the Cantonese pipeline deliberately.

Do not first rename every `jyutping` property or move the existing Cantonese MP3s.
The Cantonese source assembler validates six tone anchors, flat audio paths and Jyutping; the common runtime adapter and separate Mandarin curation builder now provide the language boundary. The new archive can exist
independently until runtime support is implemented. Preserve existing Cantonese
word/recording IDs and progress throughout that later migration.

The audit response is cached at `.audio-import-cache/mandarin-source-audit.json`.
The bounded download trial saves twelve source originals and its integrity/decode
results under `.audio-import-cache/mandarin-samples/`; these are disposable research
files. They are separate from the implemented collection downloader's cache in
`.audio-import-cache/cmn/`. The collection downloader has additionally been tested
with a bounded live batch. Pronunciation curation tooling and shared game support are implemented; the beta now trusts dictionary-matched source labels, with separate corrections and optional listening review.
