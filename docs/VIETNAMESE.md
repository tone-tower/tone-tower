# Vietnamese tones

Vietnamese lives at `/vietnamese/` with its own guide, practice, About page and
saved progress. It offers Tone Tower only.

```sh
npm start
```

Open http://127.0.0.1:4173/vietnamese/.

## What the player sees

A recording of a word of two to four syllables plays, and one syllable is
highlighted. The word is displayed without its tones, so `xin chào` appears as
`xin chao`. On every syllable a dust creature sits above the vowel that carries
the tone mark and a smaller one sits below it. Both are always shown, and their
position depends only on the toneless spelling, so the cover never hints at a
dot below (`dấu nặng`) or at a syllable with no mark. The English meaning is
shown beneath the word from the start. A meaning may quote Vietnamese, such as a
phrase the word belongs to or another spelling of it. Those syllables are shown
without their tones as well, so `lifesaving (áo cứu sinh)` appears as
`lifesaving (ao cưu sinh)` until a door is chosen.

Each door shows a written tone mark, drawn large, above its name:

| Key | Door        | Tone ID |
| --- | ----------- | ------- |
| 1   | `dấu sắc`   | `sắc`   |
| 2   | `dấu huyền` | `huyền` |
| 3   | `dấu hỏi`   | `hỏi`   |
| 4   | `dấu ngã`   | `ngã`   |
| 5   | `dấu nặng`  | `nặng`  |
| 6   | `không dấu` | `ngang` |

The order follows the VNI typing keys 1–5, with the unmarked tone last; its door
shows an empty dotted slot. After any choice the creatures leave and the whole
word appears, with the name of the highlighted syllable’s tone beneath it, and
the meaning gets its tones back. With reduced motion the cover is removed
without animation. The word’s size follows its letter count, so the longest
four-syllable words stay on one line on a phone.

## Profile

`vietnamese` in `src/languages/vietnamese/profile.ts` uses named tone IDs and
`challenges: ['tone']`. A few optional profile fields carry what differs from the
romanised languages; the shared game reads them without checking the language:

- `toneDefinitions[].markPath` is the SVG path of the written mark. A door, guide
  tile or practice button draws it in place of a tone number; an empty string
  draws the empty slot.
- `concealTone(text)` returns a syllable’s toneless spelling and the index of the
  letter that carries the mark. The prompt then covers that letter on every
  syllable until the answer is known.
- `concealMeaning(text)` returns a meaning with the tones removed from the
  Vietnamese syllables it quotes. The prompt shows that version while the word
  is covered. Borrowed words such as `attaché` are left as written.
- `copy` and `guideName` replace wording that assumes a separate romanisation,
  Skyrail or human recordings: page titles and descriptions, the navigation
  label, the home introduction, and the recording credits.

`src/languages/vietnamese.ts` splits a syllable into letters and tone and finds
the marked vowel. Open `oa`, `oe` and `uy` use the traditional placement
(`hòa`, `khỏe`, `thủy`), matching the word list. Vietnamese letters are missing
from the bundled DM Sans, so Vietnamese text uses a system font stack.

## Word list and recordings

`data/content/vi/words.json` is the versioned source. Each word has its
spelling, frequency rank, English meaning and, per voice, the
clip’s path, size and SHA-256 hash. Tones are read from the spelling. Clips live
in `audio/vi/` as `<voice>-<word>.mp3`, with each syllable in the ASCII VNI
convention and hyphens between syllables (`xin chào` → `xin-chao2`,
`được phép` → `d9u7o7c5-phep1`), so names are safe on every file system and in
URLs.

Games ask words of two or more syllables. Isolated syllables are left out
because a synthetic voice reads them less reliably than words. The guide’s tone
references are words too, chosen so that both syllables carry the same tone:
`chú ý`, `hoàn toàn`, `đảm bảo`, `mãi mãi`, `hiện tại` and `hôm nay`. They are ordinary words and can also be asked. The shared home, practice controls and rewards use the current application UI.

The recordings are synthetic speech generated with ElevenLabs, not recordings of
a person. The catalog marks each one `synthetic` and credits the voice, and the
Voices & credits section on About identifies the voice.

Import a voice from a frequency list and a folder of clips named
`<rank>_<word>.mp3`:

```sh
npm run vietnamese:import -- --csv path/to/vi_words.csv \
  --audio path/to/clips --voice tuananh \
  --name "Tuan Anh" --generator "ElevenLabs Eleven v4"
npm run catalog
npm run vietnamese:status
```

The list needs `rank`, `word`, `english` and `per_million` columns. `english`
may be empty, though every word in the committed list has a meaning. To change
meanings, edit the list and run the same import again; it rewrites them from the
list. Clips are copied unchanged. The command reports single syllables
it left out, repeated words (the first, most frequent row is kept) and rows
without a clip. Two options narrow or widen the selection:

- `--max-rank 5000` keeps only the most frequent words.
- `--min-syllables 1` also takes single syllables.

An import replaces that voice: clips of words that are no longer selected are
deleted from `audio/vi/`, and other voices are untouched. A second voice ID adds
another speaker for the same words, and the game then picks a word first and a
speaker second. `--name` and `--generator` are only needed for a new voice.

`npm run catalog` builds `catalogs/vi.json` and fails if a clip is missing or
differs from its recorded hash. `npm run vietnamese:status -- --release` also
requires 20 words containing each tone and the six tone references. The
references are always imported, whatever `--max-rank` says.

To replace or remove a wrong clip, correct the supplied CSV/audio and rerun the import for that voice. Other voices are preserved.

Imports and catalog builds use the same Vietnamese curation lock. An import validates and stages the full selection before replacing audio, keeps rollback copies until the manifest is committed, and removes obsolete clips afterward. If interrupted, builds stop rather than reading a mixed collection. Recover explicitly with `npm run vietnamese:import -- --recover`, then rerun the import if needed.

Spoken tones are inferred from written Vietnamese and remain marked as assumed; synthetic speech can pronounce them incorrectly. Vietnamese support in the optional listening-review tools is deferred. No manual review is required to build or play.
