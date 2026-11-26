# Third-party notices

The original application code is licensed under MIT; see LICENSE. That licence
does not replace the licences of the material below.

## Human speech recordings

Wikimedia Commons recordings each keep their own licence:
CC BY-SA 4.0, CC BY 4.0 or CC0. The published catalog.json identifies its creator,
source page, licence URL and conversion credit. The same information is available
in the game's recording directory. The source inventory is data/audio/content.json.
Recordings converted from Ogg to MP3 retain their pronunciation; individual
conversion notes describe the processing. Share-alike recordings and adaptations
remain under their indicated licence.

- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
- CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- CC0: https://creativecommons.org/publicdomain/zero/1.0/

### Mandarin collection archive

The Mandarin collection comes from Wikimedia Commons. Selected dictionary-matched clips are used in the playable beta.
Its per-recording credits, source URLs, selected licences, original licence
evidence, source versions, file hashes and conversion notes live in
data/audio/collections/cmn/recordings.json. Downloaded MP3s live in audio/cmn/.
Accepted licences are CC0 1.0, CC BY 4.0 and CC BY-SA 4.0, as identified for each
recording. Share-alike audio derivatives retain their indicated licence. The
publication build includes only the clips referenced in its playable catalog; the application's MIT licence does not replace audio licences.

The [Shtooka Mandarin collections](https://www.yojik.eu/audiocollections/audiocollections.html#cmn-balm-congcong)
also supply recordings by Congcong, © 2010 Association Shtooka, under
[CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/) and by Yue Tan,
© 2009 Yue Tan, recorded by the University of Caen, under
[CC BY-SA 3.0 US](https://creativecommons.org/licenses/by-sa/3.0/us/).
The originals were converted from FLAC to MP3. The conversion preserves pitch
and speed. Per-clip hashes, source Pinyin when available and attribution are in
`data/audio/mandarin-shtooka.json`.

### Matched Mandarin tone examples

The mā, má, mǎ and mà teaching excerpts come from
[FourMandarinTones.ogg by Wolfdog](https://commons.wikimedia.org/wiki/File:FourMandarinTones.ogg),
licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The excerpts are trimmed and converted to MP3; pitch and speed are unchanged.
These audio adaptations retain CC BY-SA 4.0. Source evidence, cut points and
checksums are retained in data/audio/mandarin-tone-examples.json. Published
catalog entries and the recording directory include their attribution and processing notes.

## Synthetic speech recordings

The Vietnamese word recordings in audio/vi/ are synthetic speech. No person
recorded them: each clip was generated with ElevenLabs (model Eleven v4) using the
voice named in data/content/vi/words.json, and is published unchanged. That file
lists every clip with its size and SHA-256 hash. The game's recording directory
and About page identify these clips as synthetic. The Vietnamese word list, its
frequency ranks and its English meanings were supplied with the recordings by the
contributor who generated them.

## Dictionary readings and meanings

Readings and English glosses include adaptations from:

- CC-Canto, copyright 2015–2017 Pleco Software Incorporated:
  https://github.com/amadeusine/cc-canto-data
  Licensed under CC BY-SA 3.0: https://creativecommons.org/licenses/by-sa/3.0/
- CC-CEDICT and its contributors:
  https://www.mdbg.net/chinese/dictionary?page=cc-cedict
  Licensed under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/

Entries with dictionarySource or glossSource identify their source. Glosses are
selected or adapted to identify the intended word, and readings are aligned to
the game's syllables. Those adaptations retain the applicable share-alike terms.
Manual corrections are recorded separately in data/audio/corrections.json.

Simplified Cantonese spellings are generated at build time with
[OpenCC-JS](https://github.com/nk2028/opencc-js), which bundles
[OpenCC](https://github.com/BYVoid/OpenCC) conversion data. OpenCC-JS code uses
the MIT licence and the conversion data uses the Apache License 2.0.

Expansion selection also cross-checks written forms and readings against Cantonese
Wordnet, by Joanna Ut-Seong Sio and Luis Morgado da Costa:
https://github.com/lmorgadodacosta/CantoneseWN
Licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
Citation: Sio and Morgado da Costa (2019), “Building the Cantonese Wordnet,”
Proceedings of the Tenth Global Wordnet Conference, pp. 206–215. This cross-check
does not imply that a recording is supplied or endorsed by Cantonese Wordnet.

## HSK vocabulary metadata

Mandarin level tags adapt the
[HSK 3.0 word list, all levels by Gushi](https://gushichinese.com/hsk-3.0/downloads)
under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Gushi's
compilation follows the November 2025 HSK examination syllabus. Tone Tower
retains simplified written forms, Pinyin, tone numbers and levels, and combines
the advanced levels into the syllabus's shared 7–9 band. The derived tags retain
CC BY-SA 4.0. The catalog records the source download and checksum.

The Mandarin practice-tier review uses simplified forms, Pinyin and levels
from NihaoLearn's 2021 standard and HSK 2.0 downloads. The practice data records
each exact form-and-reading match and its edition. The older levels inform
Tone Tower's practice tiers. [NihaoLearn data and licences](https://nihaolearn.com/licenses)

The exports' vocabulary data derives from complete-hsk-vocabulary under the
following MIT notice. [Upstream licence](https://github.com/drkameleon/complete-hsk-vocabulary/blob/main/LICENSE)

```text
MIT License

Copyright (c) 2026 Yanis Zafirópulos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Corpus frequency metadata

Written-form frequency counts are from words.hk's corpus word-frequency data:
https://words.hk/faiman/analysis/existingwordcount/
The source declares these counts public domain. Source URLs and snapshot checksums
are retained with the derived ranks. These counts are independent of the words.hk
dictionary's separate licence.

## Fonts

DM Sans is distributed under its bundled SIL Open Font License notice,
including its original copyright information:

- assets/fonts/DMSans-LICENSE.txt

This notice accompanies the font in the published site.
