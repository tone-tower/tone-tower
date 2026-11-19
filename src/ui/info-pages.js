import {
  soundPageMarkup as cantoneseGuide,
  compactGuideMarkup as cantoneseCompact,
} from '../languages/cantonese-guide.js';
import { mandarinGuide } from '../languages/mandarin-guide.js';
import { vietnameseGuide } from '../languages/vietnamese-guide.js';
import { textLanguage } from '../languages/text-language.ts';
const guideName = (profile) => profile.guideName ?? profile.romanization + ' guide';
import { site } from '../site.ts';
const guides = {
  yue: { full: cantoneseGuide, compact: cantoneseCompact },
  cmn: {
    full: (a, d, rows) => mandarinGuide(a, d, false, rows),
    compact: (a, d) => mandarinGuide(a, d, true),
  },
  vi: { full: (a, d) => vietnameseGuide(a, d), compact: (a, d) => vietnameseGuide(a, d, true) },
};
export function soundPageMarkup(
  anchors,
  definitions,
  rows,
  profile,
  script = profile.defaultScript,
) {
  return guides[profile.id].full(anchors, definitions, rows, textLanguage(profile, script));
}
export function compactGuideMarkup(anchors, definitions, profile, script = profile.defaultScript) {
  return guides[profile.id].compact(anchors, definitions, textLanguage(profile, script));
}
export function aboutPageMarkup({ recordingCount, profile } = {}) {
  const learningResources = (profile.learningResources ?? [])
    .map(([url, label]) => '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>')
    .join(' or ');
  const count =
    Number.isSafeInteger(recordingCount) && recordingCount > 0
      ? recordingCount.toLocaleString('en') + ' '
      : '';
  // A language without Skyrail practises tones only.
  const spelling = profile.challenges.includes('tide');
  const guideLink = /* HTML */ `<button
    class="text-button inline-link"
    data-page="sounds"
    type="button"
  >
    ${guideName(profile)}
  </button>`;
  return /* HTML */ `<article class="info-page about-page">
    <header class="page-heading">
      <button class="text-button back-link" data-page="home" type="button">← Home</button>
      <h1 tabindex="-1">About Tone Tower</h1>
      <p class="lead">
        Tone Tower is a browser game for practising
        ${spelling ? profile.romanization : profile.label + ' tones'}.
      </p>
    </header>
    <section class="info-section" aria-labelledby="games-heading">
      <h2 id="games-heading">Games and practice</h2>
      <p>
        You can start before you know the words. The ${guideLink} explains the notation with
        playable examples.
      </p>
      <div class="info-grid">
        <div class="info-card">
          <h3>Tone Tower</h3>
          <p>
            Identify the highlighted syllable’s tone and choose the corresponding door. The number
            of answer choices increases as you progress. There is no time limit.
          </p>
          <button class="text-button" data-start-world="tone" type="button">
            Choose Tower difficulty →
          </button>
        </div>
        ${
          spelling
            ? /* HTML */ `<div class="info-card">
                <h3>Skyrail</h3>
                <p>
                  Type the recording’s ${profile.romanization} within the time limit to build the
                  track. Spelling practises initials and finals; With tones also requires
                  ${profile.usesToneMarks ? 'tone marks or tone numbers' : 'tone numbers'}.
                </p>
                <button class="text-button" data-start-world="tide" type="button">
                  Choose Skyrail settings →
                </button>
              </div>`
            : ''
        }
      </div>
      <p>
        For focused exercises without a timer or lives, use
        <button class="text-button inline-link" data-info-action="practice" type="button">
          Practice</button
        >. Choose a tone pair
        ${spelling ? 'or work on initials, finals and spelling' : 'or a larger set of tones'}. Win a
        game to unlock that difficulty’s home decoration.
      </p>
      <p class="small">
        For a fuller introduction to ${profile.label} pronunciation, try ${learningResources}.
      </p>
    </section>
    <details class="info-section recordings-disclosure">
      <summary>Recordings and sources</summary>
      <p>
        ${
          profile.copy?.recordings
            ? 'The ' + count + profile.copy.recordings
            : 'The ' +
              count +
              'recordings are human speech from Wikimedia Commons, each with its own source, creator and licence. Readings and English meanings include credited dictionary sources such as ' +
              profile.dictionarySources.map((source) => source.name).join(' and ') +
              '.'
        }
      </p>
      <p>
        Pronunciation can vary between speakers and regions. Dictionary readings and the included
        recordings should be understood in that context.
      </p>
      <button class="text-button section-link" data-info-action="credits" type="button">
        Browse voices &amp; credits →
      </button>
    </details>
    <section class="info-section" aria-labelledby="project-heading">
      <h2 id="project-heading">Contribute to Tone Tower</h2>
      <p>
        Tone Tower is open source. The code is <a href="LICENSE">MIT licensed</a>, and recordings
        and fonts have their own licences. You can
        <a href="${site.repository}" target="_blank" rel="noopener">browse the code on GitHub ↗</a>
        and contribute changes.
      </p>
      <p>
        Use GitHub to report a bug, flag a recording, or suggest an improvement. For a recording
        issue, include the written word${spelling ? ' and ' + profile.romanization : ''} so it is
        easy to find.
      </p>
      <div class="feedback-links">
        <a
          class="secondary"
          href="${site.repository}/issues/new?template=bug-report.yml"
          target="_blank"
          rel="noopener"
          >Report a problem ↗</a
        >
        <a
          class="secondary"
          href="${site.repository}/issues/new?template=idea.yml"
          target="_blank"
          rel="noopener"
          >Suggest an idea ↗</a
        >
        <a href="${site.repository}/issues" target="_blank" rel="noopener">Browse feedback ↗</a>
      </div>
      <p class="small">
        A GitHub account is needed to post. Reports and replies are public; please leave out
        personal information. Feedback is welcome, though responses may take a little time.
      </p>
    </section>
    <div class="info-actions">
      <button class="primary" data-page="home" type="button">Go to the games →</button
      ><button class="text-button" data-page="sounds" type="button">${guideName(profile)}</button>
      <button class="text-button" data-info-action="reset" type="button">
        Reset saved progress…
      </button>
    </div>
  </article>`;
}
