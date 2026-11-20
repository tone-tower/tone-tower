import { formatPinyin } from './pinyin.ts';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

const toneNames = ['First tone', 'Second tone', 'Third tone', 'Fourth tone', 'Neutral tone'];
const referenceMeanings = {
  'commons-113935458': 'he',
  'commons-113935462': 'you (polite)',
  'commons-147778719': 'horse',
  'commons-113935480': 'to be',
  'commons-113935685': 'mother',
};

function toneExamples(anchors, definitions) {
  return /* HTML */ `<div class="guide-tones">
      ${definitions
        .map((tone) => {
          const word = anchors.find((anchor) => anchor.tone === tone.value);
          const target = word?.targetIndex ?? 0;
          const name = toneNames[tone.value - 1];
          const transcription = word?.syllables
            .map((syllable, index) => {
              const text = escape(formatPinyin(syllable.transcription));
              return index === target && word.syllables.length > 1 ? `<mark>${text}</mark>` : text;
            })
            .join(' ');
          const characters = word?.syllables
            .map((syllable, index) =>
              index === target && word.syllables.length > 1
                ? `<mark lang="cmn">${escape(syllable.text)}</mark>`
                : `<span lang="cmn">${escape(syllable.text)}</span>`,
            )
            .join('');
          const meaning = word && (referenceMeanings[word.id] || word.gloss);
          return /* HTML */ `<button
            class="guide-tone"
            type="button"
            data-guide-tone="${escape(tone.value)}"
            ${word ? '' : 'disabled'}
            aria-label="${word ? `Hear ${escape(formatPinyin(word.transcription))}, ${escape(name)}${word.syllables.length > 1 ? ', highlighted syllable' : ''}` : `${escape(name)}, recording unavailable`}"
          >
            <span class="pinyin-tone-name">${escape(name)}</span>
            ${
              tone.value === 5
                ? '<span class="pinyin-neutral-cue">Pitch varies</span>'
                : `<svg viewBox="0 0 100 36" aria-hidden="true"><path d="${escape(tone.path)}" /></svg>`
            }
            <strong>${transcription || '—'}</strong>
            <span
              >${characters || ''}${word ? ` · ${escape(meaning)}` : 'Example unavailable'}</span
            >
            <small>${escape(tone.description)}</small>
          </button>`;
        })
        .join('')}
    </div>
    <p id="guide-status" class="small" role="status" aria-live="polite">
      Choose a tone to listen. For neutral tone, listen to the highlighted second syllable.
    </p>`;
}

function inlineWordAudio(recordings, id, transcription) {
  const word = recordings.find((entry) => entry.id === id && entry.transcription === transcription);
  const pinyin = escape(formatPinyin(transcription));
  if (!word) return `<b>${pinyin}</b>`;
  return /* HTML */ `<button
    class="guide-word-audio"
    data-guide-word="${escape(word.id)}"
    type="button"
    aria-label="Hear ${pinyin}, ${escape(word.text)}"
  >
    <span aria-hidden="true">▶</span> <b>${pinyin}</b> <span lang="cmn">${escape(word.text)}</span>
  </button>`;
}

function resourcesMarkup() {
  return /* HTML */ `<div class="resource-links">
    <a href="https://www.ctcfl.ox.ac.uk/materials_pinyin-notes/" target="_blank" rel="noopener">
      Oxford: Pinyin pronunciation lessons ↗
      <span class="resource-type"
        >English explanations · lessons with listening examples · for beginners</span
      >
      <span
        >Introduces vowels, consonants, spelling and tones with instructions for making the
        sounds.</span
      >
    </a>
    <a href="https://studycli.org/pinyin-chart/" target="_blank" rel="noopener">
      Chinese Language Institute: interactive Pinyin chart ↗
      <span class="resource-type"
        >English labels · audio reference · for looking up a syllable</span
      >
      <span
        >Compare syllables and their four full tones. Use a chart alongside pronunciation
        lessons.</span
      >
    </a>
    <a
      href="https://www.polyu.edu.hk/bepth/introduction-to-phonetics/spelling-rules-in-pinyin/?sc_lang=en"
      target="_blank"
      rel="noopener"
    >
      PolyU: Pinyin spelling rules ↗
      <span class="resource-type">English explanations · illustrated spelling reference</span>
      <span
        >Check y/w spellings, the dots on ü, shortened finals, tone-mark placement and
        apostrophes.</span
      >
    </a>
    <a href="https://web.mit.edu/~jinzhang/www/pinyin/tones/" target="_blank" rel="noopener">
      MIT: Mandarin tones ↗
      <span class="resource-type"
        >English explanations · tone reference · for connected speech</span
      >
      <span
        >Explains low third tones, neutral tone and common tone changes with word examples.</span
      >
    </a>
    <a href="https://www.mdbg.net/chinese/dictionary" target="_blank" rel="noopener">
      MDBG: Chinese–English dictionary ↗
      <span class="resource-type">English definitions · word lookup · dictionary Pinyin</span>
      <span
        >Look up a word’s meaning and dictionary reading, including simplified and traditional
        forms.</span
      >
    </a>
  </div>`;
}

const audioStatus = /* HTML */ `<span
  class="sr-only guide-example-status"
  role="status"
  aria-live="polite"
></span>`;

export function mandarinGuide(anchors, definitions, recordings = []) {
  const tones = toneExamples(anchors, definitions);
  const matchedTones = [1, 2, 3, 4].every((tone) =>
    anchors.some(
      (word) =>
        word.tone === tone &&
        word.transcription === 'ma' + tone &&
        word.speakerId === 'commons-user-Wolfdog',
    ),
  );
  const toneCredit = matchedTones
    ? /* HTML */ `<p class="small">
        Four-tone audio: excerpts from
        <a
          href="https://commons.wikimedia.org/wiki/File:FourMandarinTones.ogg"
          target="_blank"
          rel="noopener"
          >Wolfdog’s recording</a
        >,
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener"
          >CC BY-SA 4.0</a
        >. Trimmed and converted to MP3; pitch and speed unchanged.
      </p>`
    : '';
  const audio = (id, transcription) => inlineWordAudio(recordings, id, transcription);
  return /* HTML */ `<article class="info-page sound-page pinyin-guide">
    <header class="page-heading">
      <button class="text-button back-link" data-page="home" type="button">← Home</button>
      <span class="eyebrow" lang="cmn">拼音</span>
      <h1 tabindex="-1">Pinyin guide</h1>
      <p class="lead guide-introduction">
        Pinyin writes Mandarin pronunciation with Latin letters and tone marks. It helps you read
        and say a word before you know its Chinese characters.
      </p>
      <p class="small guide-introduction">
        The letters follow Mandarin sound rules. Familiar-looking spellings can sound different from
        English, so listen to the examples as you read. You do not need to know Chinese characters
        to start.
      </p>
    </header>
    <section class="info-section" aria-labelledby="pinyin-structure-heading">
      <h2 id="pinyin-structure-heading">Syllable structure</h2>
      <p>
        An <b>initial</b> starts the sound. A <b>final</b> contains the vowel and any ending. The
        <b>tone</b> is the pitch pattern of the whole syllable.
      </p>
      <div class="syllable-lesson">
        <div
          class="lesson-equation"
          aria-label="m, initial, plus a, final, with third tone, equals mǎ"
        >
          <span><b>m</b><small>initial</small></span
          ><i aria-hidden="true">+</i> <span><b>a</b><small>final</small></span
          ><i aria-hidden="true">+</i>
          <span class="lesson-tone"><b>ˇ</b><small>third tone</small></span
          ><i aria-hidden="true">=</i>
          <span class="lesson-result"
            ><b>mǎ</b><small><span lang="cmn">马 / 馬</span> · horse</small></span
          >
        </div>
        <button
          data-guide-tone="3"
          class="secondary"
          type="button"
          ${anchors.some((word) => word.tone === 3 && word.transcription === 'ma3') ? '' : 'disabled'}
          aria-label="Hear mǎ, third tone"
        >
          ▶ Hear mǎ
        </button>
      </div>
      <p>
        In <b>hǎo</b> (<span lang="cmn">好</span>, good), the parts are <b>h + ao</b>, with the
        third tone. The final <b>ao</b> moves from one vowel position to another in one syllable.
      </p>
      <p class="small">
        Some syllables have no consonant initial: <b>ài</b> (<span lang="cmn">爱 / 愛</span>, love)
        starts with a vowel. The mark belongs over a vowel; it tells you how to pronounce the whole
        syllable.
      </p>
    </section>
    <section class="info-section" aria-labelledby="pinyin-initials-heading">
      <span class="eyebrow">01</span>
      <h2 id="pinyin-initials-heading">Initials</h2>
      <p>
        Mandarin has <b>21 consonant initials</b>. The spellings <b>zh, ch</b> and <b>sh</b> each
        represent one initial. Start with <b>m, f, n, l</b> and <b>s</b>, which are close to their
        English sounds.
      </p>
      <p>
        The pairs <b>b/p, d/t, g/k, j/q, zh/ch</b> and <b>z/c</b> differ mainly in the puff of air
        after the release, called <b>aspiration</b>. The second sound has the stronger puff. Hold a
        loose piece of paper just in front of your mouth and say <b>bā</b>, then <b>pā</b> at a
        similar volume: the paper should move more with <b>pā</b>.
      </p>
      <dl class="spelling-notes">
        <div>
          <dt>b / p<br />m / f</dt>
          <dd class="guide-example-block">
            Close and release both lips for <b>b/p</b>. Compare ${audio('commons-124599289', 'ba1')}
            (scar) and ${audio('commons-124578100', 'pa1')} (lie on your stomach). <b>m</b> also
            closes the lips, with air through the nose; <b>f</b> uses the lower lip against the
            upper teeth. ${audioStatus}
          </dd>
        </div>
        <div>
          <dt>d / t<br />n / l</dt>
          <dd class="guide-example-block">
            Place the tongue tip just behind the upper front teeth, then release it for <b>d/t</b>.
            Compare ${audio('commons-124566736', 'da1')} (put up) and
            ${audio('commons-124599279', 'ta1')} (collapse). For <b>n</b>, air goes through the
            nose; for <b>l</b>, around the sides of the tongue. ${audioStatus}
          </dd>
        </div>
        <div>
          <dt>g / k / h</dt>
          <dd>
            Raise the back of the tongue towards the soft palate. Close and release for <b>g/k</b>;
            leave a narrow gap for the friction of <b>h</b>. Mandarin <b>b, d, g</b> are useful to
            approach through the English <b>p, t, k</b> after <b>s</b> in <i>spin, stop, skin</i>,
            with little puff of air.
          </dd>
        </div>
        <div>
          <dt>j / q / x</dt>
          <dd class="guide-example-block">
            Keep the tongue tip behind the lower front teeth and raise its front towards the hard
            palate. <b>j/q</b> begin with a brief closure; <b>q</b> adds a puff. <b>x</b> lets air
            hiss through a narrow gap. Hear ${audio('commons-71029065', 'ji1')} (strike),
            ${audio('commons-113935501', 'qi1')} (seven) and ${audio('commons-71029014', 'xi1')}
            (knee). These are not the English letter names “jay”, “cue” and “ex”. ${audioStatus}
          </dd>
        </div>
        <div>
          <dt>z / c / s</dt>
          <dd class="guide-example-block">
            Keep the tongue forward, near the upper front teeth. <b>z/c</b> start with a brief
            closure and release into an s-like sound: try the <b>ts</b> of English <i>cats</i> as
            one sound at the beginning of a syllable. <b>c</b> adds a stronger puff. <b>s</b> is a
            continuous hiss, as in ${audio('commons-113935505', 'si4')} (four). ${audioStatus}
          </dd>
        </div>
        <div>
          <dt>zh / ch<br />sh / r</dt>
          <dd class="guide-example-block">
            Raise the tongue tip towards the roof of the mouth, farther back than for <b>z/c/s</b>.
            <b>zh/ch</b> start with a closure; <b>ch</b> adds a puff. <b>sh</b> is a continuous
            hiss. Compare ${audio('commons-113935587', 'zhi1')} (branch),
            ${audio('commons-113935540', 'chi1')} (eat) and ${audio('commons-113935480', 'shi4')}
            (to be). <b>r</b> uses a similar raised tongue position with voice, as in
            ${audio('commons-71028946', 'ren2')} (person); do not tap or trill it. ${audioStatus}
          </dd>
        </div>
      </dl>
      <p class="small">
        For demonstrations of tongue position, see
        <a
          href="https://www.polyu.edu.hk/bepth/introduction-to-phonetics/initials/initial-groups/"
          target="_blank"
          rel="noopener"
          >PolyU’s initial groups</a
        >. The English comparisons are starting points; use the recordings to refine the sound.
      </p>
    </section>
    <section class="info-section" aria-labelledby="pinyin-finals-heading">
      <span class="eyebrow">02</span>
      <h2 id="pinyin-finals-heading">Finals</h2>
      <p>
        A final can be a vowel, a smooth combination of vowels, or a vowel sequence ending in
        <b>-n</b> or <b>-ng</b>. Keep the whole final within one syllable.
      </p>
      <dl class="spelling-notes">
        <div>
          <dt>a / o / e</dt>
          <dd>
            For <b>a</b>, open the mouth wide. For <b>o</b>, round the lips. For <b>e</b>, keep the
            lips unrounded and the tongue towards the back: it is not the English letter name “ee”.
            Vowel quality can change in combinations; <b>e</b> in <b>ie</b> and <b>üe</b> is more
            open and forward than in <b>gē</b>.
          </dd>
        </div>
        <div>
          <dt>i / u / ü</dt>
          <dd class="guide-example-block">
            <b>i</b> in <b>nǐ</b> is close to “ee”; <b>u</b> in <b>bù</b> is close to “oo”, with
            rounded lips. For <b>ü</b>, keep the tongue in the position for <b>i</b> and round the
            lips without moving it back. Hear ${audio('commons-190673878', 'lü3')} (aluminium).
            <b>ü</b> is one vowel, not “you”. ${audioStatus}
          </dd>
        </div>
      </dl>
      <div class="guide-table">
        <table>
          <caption>
            Examples of final structures
          </caption>
          <thead>
            <tr>
              <th scope="col">Final</th>
              <th scope="col">Structure</th>
              <th scope="col">Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>a</b></td>
              <td>Vowel alone</td>
              <td><b>m + a → mǎ</b>, third tone · horse</td>
            </tr>
            <tr>
              <td><b>ao</b></td>
              <td>Vowel combination</td>
              <td><b>h + ao → hǎo</b>, third tone · good</td>
            </tr>
            <tr>
              <td><b>ua</b></td>
              <td>Glide into a vowel</td>
              <td class="guide-example-block">
                <b>h + ua →</b> ${audio('commons-71028979', 'hua1')} · flower ${audioStatus}
              </td>
            </tr>
            <tr>
              <td><b>in</b></td>
              <td>Vowel with -n</td>
              <td class="guide-example-block">
                <b>l + in →</b> ${audio('commons-113935478', 'lin2')} · woods ${audioStatus}
              </td>
            </tr>
            <tr>
              <td><b>ing</b></td>
              <td>Vowel with -ng</td>
              <td class="guide-example-block">
                <b>l + ing →</b> ${audio('commons-113935538', 'ling2')} · zero ${audioStatus}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        In <b>-n</b>, the tongue tip closes behind the upper teeth. In <b>-ng</b>, the back of the
        tongue closes against the soft palate, like the ending of English <i>sing</i>. Do not add a
        separate <b>g</b> or an extra vowel. The vowel can change too, so listen to the whole final
        when comparing <b>lín</b> and <b>líng</b>.
      </p>
      <details class="guide-detail">
        <summary>Why does i sound different in shì and nǐ?</summary>
        <p>
          After <b>z, c, s</b> and <b>zh, ch, sh, r</b>, written <b>i</b> does not have the “ee”
          vowel of <b>nǐ</b>. Keep the tongue near the initial’s position and continue with voice.
          The forward-tongue group and the raised-tip group also differ from one another.
        </p>
        <p class="guide-example-block">
          Compare ${audio('commons-113935505', 'si4')} (four) and
          ${audio('commons-113935480', 'shi4')} (to be), then ${audio('commons-113935451', 'ni3')}
          (you). The initials and, for <b>nǐ</b>, the tone differ too; listen specifically for the
          vowel-like part. ${audioStatus}
        </p>
      </details>
      <details class="guide-detail">
        <summary>Where did the dots on ü go?</summary>
        <p>
          After <b>j, q</b> and <b>x</b>, write <b>u</b> for the ü sound: <b>jū, qù, xué</b>. The
          dots are unnecessary there because those initials do not combine with the plain
          <b>u</b> vowel. The sound remains rounded and forward.
        </p>
        <p>
          Without a consonant initial, ü finals are written <b>yu, yue, yuan, yun</b>, as in
          <b>yǔ</b> (rain). After <b>n</b> and <b>l</b>, keep the dots: <b>nǚ, lǜ</b>. Compare
          <b>lù</b> (road) and <b>lǜ</b> (green): the dots distinguish different vowels.
        </p>
      </details>
      <details class="guide-detail">
        <summary>What do y, w and shortened finals do?</summary>
        <p>
          Pinyin uses <b>y</b> and <b>w</b> to spell syllables without a consonant initial:
          <b>i → yī</b>, <b>ia → yā</b>, <b>u → wū</b>, <b>ua → wā</b>. These are spelling
          conventions, so y/w are separate from the 21 consonant initials.
        </p>
        <p>
          After a consonant initial, <b>iou, uei</b> and <b>uen</b> shorten to <b>iu, ui</b> and
          <b>un</b>: <b>liú, shuǐ, lùn</b>. The written vowels do not give a letter-by-letter
          English reading. In <b>jun, qun, xun</b>, the final comes from <b>ün</b>, with the dots
          omitted.
        </p>
        <p>
          The final <b>er</b> is r-coloured, as in <b>ér</b>. A suffix written <b>-r</b> can also
          merge into a preceding syllable, as in <b>huār</b> (flower), rather than adding a separate
          <b>ér</b> syllable.
        </p>
        <p>
          See
          <a
            href="https://www.polyu.edu.hk/bepth/introduction-to-phonetics/spelling-rules-in-pinyin/?sc_lang=en"
            target="_blank"
            rel="noopener"
            >PolyU’s spelling reference</a
          >
          for the full patterns.
        </p>
      </details>
    </section>
    <section class="info-section" aria-labelledby="pinyin-tones-heading">
      <span class="eyebrow">03</span>
      <h2 id="pinyin-tones-heading">Four tones and a neutral tone</h2>
      <p>
        Tone is part of a word’s pronunciation: changing it can change the meaning.
        <b>mā, má, mǎ, mà</b> show the four tone marks.
        ${
          matchedTones
            ? 'These four examples keep <b>ma</b> the same and use one speaker, so you can concentrate on the pitch movement.'
            : 'Listen to the examples below and concentrate on the pitch movement.'
        }
      </p>
      ${tones} ${toneCredit}
      <div class="guide-note">
        <p>
          <b>First tone</b> is high and level. <b>Second tone</b> rises. <b>Third tone</b> is low,
          sometimes dipping and rising. <b>Fourth tone</b> falls from high to low. Use a comfortable
          range in your own voice; pitch is relative to the speaker.
        </p>
      </div>
      <p>
        <b>Neutral tone</b> is short and unstressed. Its pitch depends on what comes before it; it
        is not a fifth fixed pitch shape. In <b>māma</b> (mother), the second syllable is neutral.
      </p>
      <p class="small">
        The lines are simplified pitch guides, not measurements of these recordings. The examples
        ${matchedTones ? 'use one speaker for the four full tones; neutral tone uses a different speaker’s whole-word recording.' : 'include different speakers.'}
        A full dip-and-rise is most useful for practising third tone on its own; in connected speech
        it often stays low.
      </p>
      <details class="guide-detail">
        <summary>Where does the tone mark go?</summary>
        <p>
          Put the mark on <b>a</b> if there is one; otherwise on <b>e</b>; in <b>ou</b>, on
          <b>o</b>. In the remaining combinations, mark the last vowel. Compare
          <b>hǎo, méi, dōu, liú</b> and <b>duì</b>. A marked <b>i</b> loses its dot: <b>nǐ</b>.
        </p>
        <p>
          In tone-marked learning materials, a neutral syllable has no mark: <b>māma</b>. Names and
          other ordinary text sometimes omit all tone marks; a missing mark in that context does not
          tell you the tone.
        </p>
      </details>
      <details class="guide-detail">
        <summary>Why does third tone often sound low instead of dipping?</summary>
        <p>
          Before a first, second or fourth tone, third tone usually stays low without the final
          rise. It is still third tone. Before another third tone, the first one instead becomes a
          rising second tone: <b>nǐ hǎo → ní hǎo</b>. This contextual change is called
          <b>tone sandhi</b>; the dictionary spelling remains <b>nǐ hǎo</b>.
        </p>
        <p class="guide-example-block">
          Hear ${audio('commons-113935451', 'ni3')} (you) on its own, then
          ${audio('commons-113935637', 'ni3 hao3')} (hello). Listen to the first syllable of the
          greeting. These recordings are by the same speaker. ${audioStatus}
        </p>
        <p>
          Longer strings of third tones depend on how words are grouped. Start with two-syllable
          examples;
          <a href="https://web.mit.edu/~jinzhang/www/pinyin/tones/" target="_blank" rel="noopener"
            >MIT’s tone notes</a
          >
          explain both the low third tone and changes in longer phrases.
        </p>
      </details>
      <details class="guide-detail">
        <summary>Why do 一 and 不 change tone?</summary>
        <p>
          <span lang="cmn">不</span> is <b>bù</b> in the dictionary. Before a fourth tone, it
          normally becomes <b>bú</b>: <b>bù shì → bú shì</b> (is not).
        </p>
        <p>
          <span lang="cmn">一</span> is <b>yī</b> on its own and when counting. In ordinary
          connected speech it usually becomes <b>yí</b> before a fourth tone, as in
          <b>yī gè → yí gè</b> (one), and <b>yì</b> before a first, second or third tone, as in
          <b>yī tiān → yì tiān</b> (one day). It keeps <b>yī</b> in ordinal numbers such as
          <b>dì yī</b> (first).
        </p>
        <p>
          These are common patterns, not a rule to change every written occurrence. Some teaching
          materials show the spoken tones; dictionaries usually keep the original readings.
          <a
            href="https://www.polyu.edu.hk/bepth/introduction-to-phonetics/tones/tone-sandhi/"
            target="_blank"
            rel="noopener"
            >PolyU’s tone-sandhi lesson</a
          >
          gives further examples.
        </p>
      </details>
    </section>
    <section class="info-section" aria-labelledby="pinyin-resources-heading">
      <h2 id="pinyin-resources-heading">Further learning and references</h2>
      <p>
        Lessons explain how to make the sounds; charts help you look up and compare them. Choose a
        resource for the kind of help you need.
      </p>
      ${resourcesMarkup()}
    </section>
    <section class="info-section" aria-labelledby="pinyin-practice-heading">
      <span class="eyebrow">04</span>
      <h2 id="pinyin-practice-heading">Practising with Tone Tower</h2>
      <div class="info-grid">
        <div class="info-card">
          <h3>Tone Tower</h3>
          <p>
            Listen to the highlighted syllable and choose its spoken tone. There is no typing or
            timer, and you can replay the recording.
          </p>
          <button class="text-button" data-start-world="tone" type="button">
            Choose Tower difficulty →
          </button>
        </div>
        <div class="info-card">
          <h3>Skyrail</h3>
          <p>
            Type the recording’s dictionary Pinyin within the time limit. Spelling accepts
            <b>ni hao</b>; With tones accepts <b>nǐ hǎo</b>. You can also type the tone number after
            each syllable: <b>ni3 hao3</b>.
          </p>
          <button class="text-button" data-start-world="tide" type="button">
            Choose Skyrail settings →
          </button>
        </div>
      </div>
      <p>
        <a href="practice/" data-page="practice">Practice</a>
        offers exercises without a timer or lives. Focus on a tone pair, initials, finals or full
        spelling.
      </p>
      <details class="guide-detail">
        <summary>How do I type tone marks and ü?</summary>
        <p>
          Use the tone and ü buttons beside the answer field, or type numbers: <b>mǎ → ma3</b>. For
          <b>lǜ</b>, you can enter <b>lü4</b>, <b>lv4</b> or <b>lu:4</b>. Plain <b>lu4</b> spells
          <b>lù</b>, a different syllable. Neutral tone accepts an unmarked syllable, <b>5</b> or
          <b>0</b>: <b>māma</b>, <b>ma1 ma5</b> or <b>ma1 ma0</b>.
        </p>
        <p>
          Spaces can separate syllables. An apostrophe makes a boundary clear before a vowel:
          <b>Xī’ān</b> (the city) has two syllables, while <b>xiān</b> has one. You can type
          <b>xi1 an1</b> or <b>xi1'an1</b>. In Spelling mode, tone marks and numbers are optional.
        </p>
        <p>
          Initials and Finals practice follows the written spelling: <b>y</b> and <b>w</b> count as
          onsets there, and <b>jū</b> splits into <b>j + u</b>. Use <b>-</b> for no initial. In With
          tones, add a tone number to an initial answer, such as <b>m3</b>.
        </p>
      </details>
      <details class="guide-detail">
        <summary>Which tone does the game expect when speech changes it?</summary>
        <p>
          For <b>nǐ hǎo</b>, Tone Tower asks for the rising second tone normally heard on the first
          syllable. Skyrail expects the dictionary spelling <b>nǐ hǎo</b>. Feedback shows both when
          they differ.
        </p>
        <p>
          Mandarin is in beta. Spoken-tone labels can be automatic estimates from dictionary
          readings and common tone changes; an estimate is not a human listening review. If a
          recording or answer seems wrong, use its feedback link to report it.
        </p>
      </details>
      <p class="small">
        Changing simplified/traditional characters changes the writing shown, not the recording.
        Recordings retain their source attribution and licences in
        <a href="about/" data-page="about">recording directory on the About page</a>.
      </p>
    </section>
    <div class="info-actions">
      <button class="primary" data-page="home" type="button">Go to the games →</button>
      <button class="text-button" data-page="about" type="button">About Tone Tower</button>
    </div>
  </article>`;
}
