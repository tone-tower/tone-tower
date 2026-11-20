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

const aboutIntroductions = {
  yue: 'Tone Tower is a browser game for practising Jyutping. Listen to Cantonese audio recordings and choose the correct tone or type the correct Jyutping spelling.',
  cmn: 'Tone Tower is a browser game for practising Pinyin. Listen to Mandarin audio recordings and choose the correct tone or type the correct Pinyin spelling.',
  vi: 'Tone Tower is a browser game for practising Vietnamese. Listen to a whole audio recordings and choose the correct tone.',
};

export function aboutPageMarkup(profile) {
  const hasSpellingGame = profile.challenges.includes('tide');
  const romanization = escape(profile.romanization);
  const subject = profile.id === 'vi' ? escape(profile.label) : romanization;
  const otherLanguages = Object.values(languages).filter((language) => language.id !== profile.id);
  const dictionarySources = profile.dictionarySources.map(
    (source) =>
      /* HTML */ `<li>
        <a href="${escape(source.url)}">${escape(source.name)}</a>
        <span class="about-source-licence">
          · <a href="${escape(source.licenseUrl)}">${escape(source.license)}</a>
        </span>
        ${source.attribution ? /* HTML */ `<span class="about-source-attribution">${escape(source.attribution)}</span>` : ''}
      </li>`,
  );

  return /* HTML */ `<article class="info-page about-page">
    <header class="page-heading about-heading">
      <a class="text-button back-link" href="./" data-page="home">← Home</a>
      <div>
        <h1 tabindex="-1">About Tone Tower</h1>
        <p class="lead">${escape(aboutIntroductions[profile.id])}</p>
      </div>
      <a class="about-guide-card" href="guide/" data-page="sounds">
        <span>
          <strong>New to ${subject}?</strong>
          Open the guide
        </span>
        <span class="about-guide-arrow" aria-hidden="true">→</span>
      </a>
    </header>

    <section class="info-section" aria-labelledby="games-heading">
      <h2 id="games-heading">Games</h2>
      <p>There are two game modes available.</p>
      <div class="info-grid about-games">
        <div class="info-card">
          <h3>Tone Tower</h3>
          <p>
            Listen to a word and choose the correct tone. The difficulty increases as you climb more
            floors.
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
                  Type the ${romanization} spelling before time runs out. This game can be played
                  with and without tones.
                </p>
                <button class="text-button" data-start-world="tide" type="button">
                  Choose Skyrail settings →
                </button>
              </div>`
            : ''
        }
      </div>
      <p>
        A <a href="practice/" data-page="practice">Practice Mode</a> is also available for both
        games.
      </p>
    </section>

    <section class="info-section" aria-labelledby="other-languages-heading">
      <h2 id="other-languages-heading">Other languages</h2>
      <p>Tone Tower is also available in other languages.</p>
      <ul class="about-languages">
        ${otherLanguages
          .map(
            (language) =>
              /* HTML */ `<li>
                <a href="${escape(language.slug)}/">
                  Play Tone Tower in ${escape(language.label)} <span aria-hidden="true">→</span>
                </a>
              </li>`,
          )
          .join('')}
      </ul>
    </section>

    <section class="info-section" aria-labelledby="recordings-heading">
      <h2 id="recordings-heading">Recordings</h2>
      <p>
        ${
          profile.copy?.recordings
            ? escape(profile.copy.recordings)
            : 'The recordings come from contributors to Wikimedia Commons, so you’ll hear different voices and accents. The recording directory lists the creator, original source and licence for each clip.'
        }
      </p>
      <button class="secondary" data-info-action="credits" type="button">Browse recordings</button>
      <details class="guide-detail">
        <summary>Data and software credits</summary>
        ${
          dictionarySources.length
            ? /* HTML */ `<p>Readings and English meanings draw on these dictionaries.</p>
                <ul class="about-sources">
                  ${dictionarySources.join('')}
                </ul>`
            : ''
        }
        <ul class="about-licences">
          <li><a href="LICENSE">MIT licensed code</a></li>
          <li><a href="assets/fonts/DMSans-LICENSE.txt">DM Sans font licence</a></li>
          <li><a href="THIRD_PARTY_NOTICES.md">Third-party notices</a></li>
        </ul>
      </details>
    </section>

    <section class="info-section" aria-labelledby="project-heading">
      <h2 id="project-heading">Project and feedback</h2>
      <p>
        Tone Tower is open source. You can find the code in the
        <a href="${site.repository}">GitHub repository</a>.
      </p>
      <p>
        If a recording or answer seems wrong, use the report link in the game’s answer feedback or
        in the recording directory. It includes the details needed to find the clip.
      </p>
      <p class="feedback-links">
        <a href="${site.repository}/issues/new?template=bug-report.yml">Report a problem ↗</a>
        <a href="${site.repository}/issues/new?template=idea.yml">Suggest an idea ↗</a>
        <a href="${site.repository}/issues">Browse feedback ↗</a>
      </p>
      <p class="small">GitHub issues and replies are public.</p>
    </section>
  </article>`;
}
