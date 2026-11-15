# Optional listening review and audio coverage

Source-matched recordings remain playable without listening approval. The shared
tools prepare both languages for gradual review; they never turn a dictionary
match, a speaker credit, or an automatic measurement into human approval.

## Review a few recordings

Start the internal review server for one language:

```sh
npm run audio:review -- --language yue
# Or Mandarin:
npm run audio:review -- --language cmn
```

Open the printed localhost URL (normally http://127.0.0.1:4180/). Use `--port 4181`
to choose another port. This server is separate from `npm start`: it serves only
the review page and the audio in its current review snapshot. It does not expose
the source inventory or accept writes over HTTP. Stop it with Ctrl+C.

Search characters, transcription, meaning, recording ID, or speaker. Filter by
speaker or review status. Enter a reviewer name and a reason, then explicitly
save a draft for each recording you assess:

- **approved:** confirm a candidate reading and the tones actually heard. You can
  correct the spoken tones without changing dictionary transcription. Optional
  eligible target positions restrict tone questions to reliable syllables.
- **uncertain:** retain suitable spelling exercises while disabling tone questions
  for this recording. No listening approval is asserted.
- **rejected:** exclude the recording from the playable catalog and distribution.
- **unreviewed:** clear the shared listening decision and return to the existing
  source, legacy review, and correction rules.

Teaching-reference positions are optional and zero based. Mark them only for
reference-quality audio. Mandarin tones 1–4 require isolated references; neutral
tone needs word context. Several recordings may be reference-quality; the public
catalog still selects one reference per tone. Audio issue tags record observations
without automatically excluding a clip.

Drafts persist in this browser at this localhost origin. Save before changing
filters or pages. Export edited reviews to a JSON file; export includes only
current drafts, not every untouched item. Persist the decisions in the project:

```sh
npm run audio:import-review -- --language yue --file path/to/yue-listening-reviews.json
npm run catalog
```

Replace `yue` with `cmn` for Mandarin. Refresh the review page after importing.
Drafts based on superseded decisions or evidence are marked outdated and omitted
from export until saved again after review. Use the same port/browser to recover
existing drafts. Browser drafts are convenient working copies; imported JSON is
the durable record.

To export a standalone internal HTML page instead of starting a server:

```sh
npm run audio:review -- --language yue --file path/to/local-review.html
```

Its audio links point to this machine's local files. Keep it private and local.
`mandarin:review` and `mandarin:import-review` are aliases for the shared tools.
Previously exported Mandarin `annotations` batches remain accepted by the import
command; their original validation and storage are retained.

## Evidence, persistence, and concurrency

Shared decisions live in `data/content/<language>/listening-reviews.json`, created
on first import. Commit it when keeping the decisions. Each decision identifies
the reviewed MP3 SHA-256 and a fingerprint of the candidate pronunciations and
effective source corrections. Changing relevant evidence makes the decision stale;
stale shared decisions are reported and are not reapplied as current approval,
exclusion, or uncertainty. Ordinary beta eligibility then follows current evidence.
Reviewer names and shared review notes stay internal; published tone evidence uses
a general description of the review outcome.

Imports validate the complete batch before writing, preserve unrelated decisions,
and reject conflicting edits made since export. Reimporting an identical batch is
safe. Reviews survive dictionary preparation, downloads, and catalog builds.
Explicit source corrections/exclusions remain authoritative; use the existing
correction tools to restore a source-level exclusion or introduce a reading that
is absent from the candidate list. Changing such evidence requires a fresh review.

Curation snapshots, imports, and measurements use the same language curation lock
as its catalog builder. Audio downloads retain their separate lock. Run one
curation/build command at a time. No command bypasses another writer's lock.

## Inspect coverage and proposed listening sets

```sh
npm run audio:coverage
npm run audio:coverage -- --language yue
npm run audio:coverage -- --language cmn --file path/to/coverage.json
```

The default writes internal reports to `.audio-import-cache/<language>/coverage.json`
and prints a summary. Reports include playable recordings and distinct
pronunciations, speaker coverage, syllable counts, dictionary and spoken tone
patterns, current/stale review progress, unresolved matches, and measurement gaps.
Teaching-only examples are counted separately from playable exercise pools.

Proposed listening sets identify the same pronunciation across known speakers and
single syllables with different tones. They include available same-speaker
comparisons and recording-level tone evidence. They are candidate material, not
reviewed teaching sets, and do not affect game selection.

Speaker IDs derived from Cantonese source data use an explicit `Speaker:` credit
and its Commons source page. Generic authors, uploaders, and filename labels do
not establish a speaker. These IDs group exact credited names within a language;
they do not independently verify personal identity, merge aliases, or infer accent
or demographics. Reports distinguish these credit identities from pre-existing
source-linked identities and keep unknown speakers out of diversity counts.

Both catalogs include pronunciation-level `phonetics`: syllable count, dictionary
tone pattern, and transcription-derived base, initial, final, and coda per
syllable, plus Cantonese checked-syllable flags. Initial/final features follow the
language's spelling exercises, including Pinyin orthographic y/w; they are not IPA
transcriptions or listening measurements. Entry-level sourced frequency metadata
is preserved. No topics, curriculum levels, or difficulty labels are guessed.

## Measure audio without altering it

```sh
npm run audio:analyze
# Or process a limited number of previously unmeasured/changed clips:
npm run audio:analyze -- --language cmn --limit 50
npm run audio:coverage
```

FFmpeg decodes local MP3s without changing their pitch, speed, volume, or bytes.
The tool stores hash-bound measurements in
`data/content/<language>/audio-measurements.json`: duration, sample rate, channel
count, peak/RMS dB relative to full scale, fraction of decoded samples at or above
full scale, and leading/trailing silence. Silent audio has `null` dB levels.

Inspection flags identify full-scale samples, RMS below −35 dB, and more than
0.5 seconds of leading/trailing silence using a −45 dB frame threshold. Coverage
reports also flag RMS differences of at least 12 dB from the measured median.
These are screening heuristics: full-scale samples do not establish audible
clipping, and RMS is not perceptual loudness. Measurements never approve or reject
a pronunciation. Stale measurements are omitted from current coverage.

Analysis checkpoints periodically and skips unchanged measured recordings on
resumption. It can include unmatched archived Mandarin recordings, which remain
outside gameplay. Dictionaries, reviews, measurements, HTML exports, and coverage
reports remain outside the published distribution. Builds only read source data.
