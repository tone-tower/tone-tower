import { soundPageMarkup as cantoneseGuide } from '../languages/cantonese-guide.js';
import { mandarinGuide } from '../languages/mandarin-guide.js';
import { vietnameseGuide } from '../languages/vietnamese-guide.js';
import { textLanguage } from '../languages/text-language.ts';
import { site } from '../site.ts';
import { languages } from '../languages/profiles.ts';
import { escape } from './dom.ts';
const guides = {
  yue: cantoneseGuide,
  cmn: mandarinGuide,
  vi: vietnameseGuide,
};
export function soundPageMarkup(
  anchors,
  definitions,
  rows,
  profile,
  script = profile.defaultScript,
) {
  return guides[profile.id](anchors, definitions, rows, textLanguage(profile, script));
}
export function aboutPageMarkup({ recordingCount, profile }) {
  const count =
    Number.isSafeInteger(recordingCount) && recordingCount > 0
      ? recordingCount.toLocaleString('en') + ' '
      : '';
  const hasSpellingGame = profile.challenges.includes('tide');
  const guide = escape(profile.guideName ?? profile.romanization + ' guide');
  const romanization = escape(profile.romanization);
  const notation = {
    yue: /* HTML */ `The Cantonese games use Jyutping. In <b>fu2</b>, the letters give the
      pronunciation and the number gives the tone.`,
    cmn: /* HTML */ `The Mandarin games use Pinyin. In <b>mǎ</b>, the mark over the vowel gives the
      tone. You can also type the syllable as <b>ma3</b>.`,
    vi: /* HTML */ `In Vietnamese, five of the six tones are written with marks on a vowel. The
      level tone, <b lang="vi">ngang</b>, is written without a tone mark.`,
  }[profile.id];
  const dictionarySources = profile.dictionarySources.map(
    (source) =>
      /* HTML */ `<li>
        <a href="${escape(source.url)}">${escape(source.name)}</a>
        <span class="about-source-licence">
          · <a href="${escape(source.licenseUrl)}">${escape(source.license)}</a>
        </span>
        ${
          source.attribution
            ? /* HTML */ `<span class="about-source-attribution"
                >${escape(source.attribution)}</span
              >`
            : ''
        }
      </li>`,
  );
  const otherLanguages = Object.values(languages).filter((language) => language.id !== profile.id);

  return /* HTML */ `<article class="info-page about-page">
    <header class="page-heading">
      <h1 tabindex="-1">About Tone Tower</h1>
      <p class="lead guide-introduction">
        Tone Tower is a browser-based trainer for ${escape(profile.label)} pronunciation.
      </p>
      <p class="guide-introduction about-introduction">
        ${notation} The <a href="guide/" data-page="sounds">${guide}</a> explains the notation with
        recordings you can play as you read.
      </p>
    </header>
    <section class="info-section" aria-labelledby="games-heading">
      <h2 id="games-heading">Games and practice</h2>
      <div class="info-grid about-games">
        <div class="info-card">
          <h3>Tone Tower</h3>
          <p>
            Listen to the recording and choose the door that matches the tone of the highlighted
            syllable. The number of choices increases as you climb. There is no time limit, so you
            can replay the recording before you answer.
          </p>
          <button class="text-button" data-start-world="tone" type="button">
            Choose Tower difficulty →
          </button>
        </div>
        ${
          hasSpellingGame
            ? /* HTML */ `<div class="info-card">
                <h3>Skyrail</h3>
                <p>
                  Build a section of track by typing the recording’s ${romanization} before time
                  runs out. Spelling checks the letters. With tones also checks
                  ${profile.usesToneMarks ? 'tone marks or numbers' : 'the tone numbers'}. The
                  prompts progress from single syllables to longer words.
                </p>
                <button class="text-button" data-start-world="tide" type="button">
                  Choose Skyrail settings →
                </button>
              </div>`
            : ''
        }
      </div>
      <h3>Focused practice</h3>
      <p>
        In <a href="practice/" data-page="practice">Practice</a>, you can choose two tones to
        compare or work with a larger set. Sessions have no timer or lives.
        ${hasSpellingGame ? 'For spelling practice, you can work on initials, finals or complete spelling.' : ''}
      </p>
    </section>
    <section class="info-section" aria-labelledby="recordings-heading">
      <h2 id="recordings-heading">Voices &amp; credits</h2>
      <p>
        ${
          profile.copy?.recordings
            ? 'The ' + count + escape(profile.copy.recordings)
            : 'The ' +
              count +
              'recordings come from Wikimedia Commons. Pronunciation can vary between speakers and regions. The recording directory lists each clip’s creator, source and licence.'
        }
      </p>
      ${
        profile.id === 'cmn'
          ? /* HTML */ `<p>
              Skyrail uses dictionary Pinyin. Tone Tower uses the tone assigned to the recording,
              which can differ from the dictionary tone in connected speech. Some spoken-tone labels
              are estimated from dictionary readings and common tone changes.
            </p>`
          : ''
      }
      <div class="about-credit-sources">
        ${
          dictionarySources.length
            ? /* HTML */ `<div>
                <h3>Dictionaries</h3>
                <p>Dictionary entries supply readings and short English meanings.</p>
                <ul class="about-sources">
                  ${dictionarySources.join('')}
                </ul>
              </div>`
            : ''
        }
        <div>
          <h3>Code and fonts</h3>
          <ul class="about-sources">
            <li><a href="LICENSE">MIT licensed code</a></li>
            <li><a href="assets/fonts/DMSans-LICENSE.txt">DM Sans font licence</a></li>
            <li><a href="THIRD_PARTY_NOTICES.md">Third-party notices</a></li>
          </ul>
        </div>
      </div>
      <button class="secondary" data-info-action="credits" type="button">Browse recordings</button>
    </section>
    <section class="info-section" aria-labelledby="project-heading">
      <h2 id="project-heading">Project and feedback</h2>
      <p>
        Tone Tower is open source. The <a href="${site.repository}">GitHub repository</a> contains
        the game code and the tools used to prepare the recording catalog. Progress and display
        preferences are saved in your browser.
      </p>
      <p>
        If a recording sounds wrong, use the report link in the game’s answer feedback or find the
        clip in the recording directory. The link includes details that help identify the clip.
      </p>
      <p class="feedback-links">
        <a href="${site.repository}/issues/new?template=bug-report.yml">Report a problem ↗</a>
        <a href="${site.repository}/issues/new?template=idea.yml">Suggest an idea ↗</a>
        <a href="${site.repository}/issues">Browse feedback ↗</a>
      </p>
      <p class="small">GitHub issues and replies are public.</p>
    </section>
    <section class="info-section" aria-labelledby="other-languages-heading">
      <h2 id="other-languages-heading">Other languages</h2>
      <ul class="about-languages">
        ${otherLanguages
          .map(
            (language) =>
              /* HTML */ `<li>
                <a href="${escape(language.slug)}/">${escape(language.label)} →</a>
                <span
                  >${
                    language.id === 'vi'
                      ? 'Listening practice and written tone marks.'
                      : 'Tone recognition and ' + escape(language.romanization) + ' spelling.'
                  }</span
                >
              </li>`,
          )
          .join('')}
      </ul>
    </section>
  </article>`;
}
