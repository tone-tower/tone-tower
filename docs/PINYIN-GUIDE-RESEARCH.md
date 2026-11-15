# Pinyin guide research

Reviewed 13 November 2026. The guide addresses English-speaking beginners without assuming Mandarin or Cantonese knowledge. Its teaching sequence and visual components follow the Jyutping guide: syllable structure, initials, finals, tones, further learning, then the games. More detailed spelling and connected-speech explanations sit beside the relevant lesson in expandable answers.

## Notation and teaching choices

Teach standard tone-marked Pinyin, such as **mǎ**, and refer to the first, second, third and fourth tones in prose. Numbered forms such as **ma3** are typing alternatives, confined to game instructions. The four full tones and neutral tone remain the five game categories; this change does not alter answers or stored content.

- [Oxford CTCFL’s pronunciation notes](https://www.ctcfl.ox.ac.uk/materials_pinyin-notes/) provide an English-language introduction to vowels, consonants and final combinations. Use mouth positions and listening rather than treating English analogies as exact equivalents. Its description of fricatives as aspirated is not adopted: the guide teaches aspiration through the six stop/affricate pairs.
- [PolyU’s initial groups](https://www.polyu.edu.hk/bepth/introduction-to-phonetics/initials/initial-groups/) support the distinction between forward z/c/s, raised-tip zh/ch/sh/r and j/q/x with the tongue tip behind the lower teeth. Pinyin b/d/g should not be taught as the English voiced consonants; the small-puff English sounds after s provide an approximation. PolyU also includes Cantonese comparisons; the new guide does not assume that background.
- [PolyU’s spelling rules](https://www.polyu.edu.hk/bepth/introduction-to-phonetics/spelling-rules-in-pinyin/?sc_lang=en) cover y/w forms, omitted ü dots, shortened iou/uei/uen, tone marks, apostrophes and the -r suffix. Distinguish the ü-based final in jun/qun/xun from shortened uen. Teach 21 consonant initials, explaining y/w separately. Practice still splits written syllables according to the existing app contract.
- [MIT’s Mandarin tone notes](https://web.mit.edu/~jinzhang/www/pinyin/tones/) distinguish the low third tone from its full dip-and-rise and discuss phrase grouping. The introductory explanation does not imply that every third tone must rise. A third tone before another third tone commonly becomes a rising second tone while dictionary Pinyin retains the original reading.
- [PolyU’s neutral-tone lesson](https://www.polyu.edu.hk/bepth/introduction-to-phonetics/tones/neutral-tone/) describes short, unstressed syllables whose pitch depends on context. The guide plays a whole word and highlights the target syllable in both Pinyin and characters. No fixed fifth contour is drawn.
- [PolyU’s tone-sandhi lesson](https://www.polyu.edu.hk/bepth/introduction-to-phonetics/tones/tone-sandhi/) supports the common 一/不 patterns. Explain these as contextual pronunciations; include counting and ordinal exceptions for 一. Dictionary spellings and the app’s estimated spoken-tone targets stay separate. No estimate is described as a human review.

The tone-mark rule matches the application formatter: a first, then e, then o in ou, otherwise the last vowel. Unmarked neutral syllables are discussed within tone-marked learning materials; text that omits every tone mark does not encode neutral tone everywhere.

## Resources

The five resource cards have distinct purposes: Oxford introductory lessons, [CLI’s interactive audio chart](https://studycli.org/pinyin-chart/) for lookup/comparison, PolyU spelling reference, MIT connected-tone reference and [MDBG](https://www.mdbg.net/chinese/dictionary) for meanings and dictionary readings. Do not present a dictionary or a chart as a complete pronunciation course. No third-party recordings are imported or embedded.

## Existing audio selections

IDs select recordings as well as spellings. Inline examples require both to match; if unavailable they become marked-Pinyin text rather than silently choosing another word. Characters come from the selected catalog row so script preferences are respected. Transcriptions are formatted from the catalog’s numbered internal representation before display.

| Lesson                                    | Recording IDs                                                                | Pinyin and actual characters      |
| ----------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Lip aspiration, same speaker              | commons-124599289 / commons-124578100                                        | bā 疤 / pā 趴                     |
| Tongue-tip aspiration, same speaker       | commons-124566736 / commons-124599279                                        | dā 搭 / tā 塌                     |
| j/q/x examples                            | commons-71029065 / commons-113935501 / commons-71029014                      | jī 击 / qī 七 / xī 膝             |
| Forward s                                 | commons-113935505                                                            | sì 四                             |
| Raised tongue-tip examples                | commons-113935587 / commons-113935540 / commons-113935480 / commons-71028946 | zhī 枝 / chī 吃 / shì 是 / rén 人 |
| Rounded front vowel                       | commons-190673878                                                            | lǚ 铝                             |
| Glide                                     | commons-71028979                                                             | huā 花                            |
| Nasal endings, same speaker               | commons-113935478 / commons-113935538                                        | lín 林 / líng 零                  |
| Third tone alone/in context, same speaker | commons-113935451 / commons-113935637                                        | nǐ 你 / nǐ hǎo 你好               |

The four full-tone references now use **mā, má, mǎ, mà** from [Wolfdog’s FourMandarinTones.ogg](https://commons.wikimedia.org/wiki/File:FourMandarinTones.ogg), under CC BY-SA 4.0. They share a speaker and recording session. Their IDs are commons-83387745-ma1 through commons-83387745-ma4. The original source version, licence evidence, CC-CEDICT word evidence, cut points and MP3 hashes are retained in `data/audio/mandarin-tone-examples.json`. These reference-only entries are excluded from normal questions and exercise-coverage counts. Existing archive recordings keep their IDs.

The pinned original has SHA-1 `db81e637a2f1908eacb7244845fbf9162e410ec8`. Excerpts retain leading/trailing silence around the detected utterances: 0.40–1.22, 1.75–2.60, 3.10–4.00 and 4.55–5.16 seconds. They are trimmed and converted with FFmpeg without pitch, speed or loudness changes. Technical checks establish decode integrity, intact boundaries and the source-labelled order; they are not recorded as a human pronunciation review. No native-speaker status is inferred from the uploader’s identity.

Neutral tone retains commons-113935685 (māma 妈妈, target index 1) by Luilui6666. Its second syllable remains highlighted and the whole word is played. The guide explicitly distinguishes this separate speaker and contextual example from the matched four-tone set.

Reproduce the source import with `npm run mandarin:tones -- inspect`, `npm run mandarin:dictionary`, then `npm run mandarin:tones -- import` and `npm run catalog`, sequentially. Inspection/download uses the audio lock and shared Commons pacing. Import also takes the Mandarin curation lock; builds only read the registry and validate excerpt hashes. The cut-point configuration is `data/content/cmn/tone-example-segments.json`. Originals remain in the ignored cache. Derived audio files include a content hash so an interrupted re-import cannot invalidate the previously published registry. Updated imports retain recording IDs and publish the new registry atomically.

The s/sh/i comparison changes initials and, for nǐ, tone; its explanation makes this explicit. Lín/líng also illustrate possible vowel-quality differences, not just a consonant replacement. Existing attribution, licences, original files and review metadata remain unchanged.
