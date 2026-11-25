import { toneCoverMarkup } from '../ui/tone-cover.js';
import type { Run, LanguageProfile, ControllerPhase } from '../types.ts';
import { escape } from '../ui/dom.ts';
import { doorSlots } from '../world/worlds.js';
import { textLanguage } from '../languages/text-language.ts';
import { toneDefinition, toneLabel, toneSymbolMarkup } from '../ui/tone-presentation.ts';
import { challenges } from './game-core.ts';

export const pauseButtonMarkup =
  '<button class="quiet" id="pause-run" type="button" aria-label="Pause game" aria-keyshortcuts="Escape" title="Pause game"></button>';

export const doorArrowKeys: Partial<Record<number, readonly (readonly string[])[]>> = {
  2: [['ArrowLeft'], ['ArrowRight']],
  3: [['ArrowLeft'], ['ArrowUp', 'ArrowDown'], ['ArrowRight']],
  4: [['ArrowUp'], ['ArrowLeft'], ['ArrowRight'], ['ArrowDown']],
  5: [['ArrowUp'], ['ArrowLeft'], ['ArrowRight'], [], ['ArrowDown']],
};
const arrowSymbols: Partial<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowRight: '→',
};

interface Presentation {
  run: Run;
  phase: ControllerPhase;
  profile: LanguageProfile;
  paused: boolean;
  inputValue: string;
  message: string;
  answering: () => boolean;
  choosingTone: () => boolean;
  script: string;
  unveiling: boolean;
}
export function createGameMarkup(state: () => Presentation) {
  const isTide = () => state().run.config.challenge === 'tide';
  function progressMarkup() {
    const { run } = state();
    const drill = run.config.practice && run.config.format === 'drill',
      finite = drill && run.goal !== 'endless';
    const label = drill
      ? run.attempts + (finite ? ' / ' + run.goal : '')
      : run.opened +
        (isTide() ? ' ' : ' / 100 ') +
        (isTide()
          ? run.opened === 1
            ? 'span crossed'
            : 'spans crossed'
          : run.opened === 1
            ? 'floor lit'
            : 'floors lit');
    return '<span class="game-progress-label" role="status">' + label + '</span>';
  }
  function lifeLabel() {
    const { lives, maxLives } = state().run;
    return lives === null ? 'Unlimited attempts' : `${lives} of ${maxLives} lives remaining`;
  }
  function controlsMarkup(showPause: boolean) {
    const { run } = state();
    const title = run.config.practice
      ? isTide()
        ? run.config.variant === 'full'
          ? 'Practice spelling + tones'
          : 'Practice spelling'
        : 'Practice tones'
      : challenges[run.config.challenge].title;
    return /* HTML */ `<div class="game-controls">
      <div class="game-readout sr-only">
        <h1>${escape(title)}</h1>
        <div class="scene-status">
          <span>${lifeLabel()}</span>
          ${run.config.practice ? '' : progressMarkup()}
        </div>
        ${isTide() && !run.config.practice ? '<div class="rail-clock">Time remaining <strong id="countdown"></strong></div>' : ''}
      </div>
      ${showPause ? pauseButtonMarkup : ''}
    </div>`;
  }
  function concealedMarkup(text: string, index: number, reveal: boolean) {
    const { profile, unveiling } = state();
    const letters = [...text],
      plain = profile.withoutTones(letters[index]);
    return (
      escape(letters.slice(0, index).join('')) +
      // The cover clears a hat, a horn or the dot of an i, and the tail of a y.
      '<span class="tone-carrier' +
      ('ăâêôi'.includes(plain) ? ' is-tall' : 'ơư'.includes(plain) ? ' is-horned' : '') +
      (plain === 'y' ? ' is-deep' : '') +
      '">' +
      escape(letters[index]) +
      (!reveal || unveiling ? toneCoverMarkup(reveal) : '') +
      '</span>' +
      escape(letters.slice(index + 1).join(''))
    );
  }
  function promptMarkup(reveal: boolean, showPause: boolean) {
    const { run, profile, script } = state();
    const rail = isTide();
    // Every syllable of a word hides its tone, so its neighbours give nothing away.
    const concealed = run.word.syllables.map((s) =>
      rail ? null : (profile.concealTone?.(s.text ?? '') ?? null),
    );
    const covered = concealed.some(Boolean);
    const meaning =
      covered && !reveal && run.word.gloss
        ? (profile.concealMeaning?.(run.word.gloss) ?? run.word.gloss)
        : run.word.gloss;
    // A written word is as wide as its letters; its size follows their count.
    const letters = covered
      ? run.word.syllables.reduce((n, s) => n + [...(s.text ?? '')].length, 0)
      : 0;
    // The longest tone name holds the answer's place, so revealing it moves nothing.
    const reservedTone = covered
      ? profile.toneDefinitions.reduce(
          (longest, { label }) => (label.length > longest.length ? label : longest),
          '',
        )
      : '';
    const spaceOnly = rail && profile.allowWordSpaces;
    const wordLanguage = escape(textLanguage(profile, script));
    const syllables = run.word.syllables.length;
    const singleTarget = run.targets.length === 1;
    const listenLabel = '<span class="target-label">Listen here</span>';
    return /* HTML */ `<div class="round-prompt">
      <div
        class="word-prompt"
        data-length="${syllables}"
        ${syllables >= 3 ? 'data-long="true"' : ''}
        ${covered ? 'data-letters="' + letters + '"' : ''}
        style="--syllables:${syllables}${covered ? ';--letters:' + letters : ''}"
      >
        <div class="prompt-syllables">
          ${singleTarget ? '' : listenLabel}
          ${run.word.syllables
            .map((s, i) => {
              const target = run.targets.includes(i),
                hidden = concealed[i],
                reserved = !reveal && (rail || (hidden && target)),
                spelling = hidden
                  ? target
                    ? reveal
                      ? toneDefinition(profile, s.tone).label
                      : reservedTone
                    : ''
                  : rail || reveal
                    ? profile.format(s.transcription)
                    : profile.withoutTones(s.transcription);
              return /* HTML */ `<span class="prompt-syllable${target ? ' is-target' : ''}"
                >${target && singleTarget ? listenLabel : ''}<span
                  class="prompt-character"
                  lang="${wordLanguage}"
                  >${hidden ? concealedMarkup(reveal ? (s.text ?? '') : hidden.base, hidden.index, reveal) : escape(s.text)}</span
                ><span
                  class="prompt-romanization${reserved ? ' is-reserved' : ''}"
                  lang="${escape(profile.id + '-Latn')}"
                  ${reserved ? 'aria-hidden="true"' : ''}
                  >${spelling ? escape(spelling) : '&nbsp;'}</span
                ></span
              >`;
            })
            .join('')}
        </div>
      </div>
      <p class="prompt-gloss" lang="en"><span>${escape(meaning)}</span></p>
      <div class="prompt-actions">
        <button
          class="secondary"
          id="replay-word"
          type="button"
          aria-keyshortcuts="${spaceOnly ? 'Space' : 'Space R'}"
          title="Replay (${spaceOnly ? 'Space' : 'Space or R'})"
        >
          <span class="replay-icon" aria-hidden="true">▶</span> Replay
        </button>
        ${showPause ? pauseButtonMarkup : ''}
      </div>
      ${!rail && profile.concealTone && reveal && run.word.syllables.some((s) => s.dictionaryTone !== undefined && s.dictionaryTone !== s.tone) ? '<p class="tone-explanation">Heard tones: ' + escape(run.word.syllables.map((s) => profile.toneDefinitions.find((d) => d.value === s.tone)?.label).join(' · ')) + '. Dictionary spelling: ' + escape(profile.format(run.word.transcription || run.word.syllables.map((s) => s.transcription).join(' '))) + '. Tone Tower follows this recording; Skyrail uses dictionary spelling.</p>' : ''}
    </div>`;
  }
  function toneButtons() {
    const { run, phase, profile, choosingTone } = state();
    const slots = doorSlots(run.choices.length).map(
      ([x, y, w, h]: number[]) =>
        `left:${x / 4.8}%;top:${y / 2.4}%;width:${w / 4.8}%;height:${h / 2.4}%`,
    );
    return run.choices
      .map((t, index) => {
        const tone = toneDefinition(profile, t);
        const name = profile.toneNotation === 'marks' ? tone.label : tone.name;
        const arrows = doorArrowKeys[run.choices.length]?.[index] ?? [];
        const symbols = arrows.map((key) => arrowSymbols[key]).join(' ');
        const number = profile.tones.indexOf(t) + 1;
        const correct = (phase === 'correct' || phase === 'landing') && t === run.word.tone;
        const drop = correct && run.lastResult?.kind === 'correct' && run.lastResult.heartDrop;
        return /* HTML */ `<button
          style="${slots[index]}"
          type="button"
          class="tone-door ${correct ? 'is-correct' : ''} ${drop ? 'has-heart-drop' : ''} ${phase === 'review' && t === run.word.tone ? 'is-answer' : ''} ${phase === 'review' && t === run.lastAnswer ? 'is-wrong' : ''}"
          data-tone="${t}"
          aria-label="${phase === 'review' && t === run.word.tone ? 'Correct answer: ' : phase === 'review' && t === run.lastAnswer ? 'Your choice: ' : 'Choose '}${escape(toneLabel(profile, t))}"
          aria-keyshortcuts="${[...arrows, number].join(' ')}"
          ${!choosingTone() ? 'disabled' : ''}
        >
          ${toneSymbolMarkup(profile, t)}<span class="tone-name"
            >${phase === 'review' && t === run.lastAnswer ? '✕ Your choice' : phase === 'review' && t === run.word.tone ? '✓ Correct' : escape(name)}</span
          ><kbd class="door-key" aria-hidden="true">${symbols ? `${symbols} · ` : ''}${number}</kbd>
        </button>`;
      })
      .join('');
  }
  function answerLabel() {
    const { run, profile } = state();
    const focus = run.config.practice ? run.config.spellingFocus : 'full';
    const spelling =
      focus === 'initials' ? 'Initials' : focus === 'finals' ? 'Finals' : profile.romanization;
    const target =
      run.targets.length === 1
        ? `the highlighted syllable, ${run.word.syllables[run.targets[0]].text}`
        : 'the whole word';
    return `${spelling} for ${target}`;
  }
  function typedForm(reviewActions: string) {
    const { run, phase, profile, paused, inputValue, message, answering } = state();
    if (!isTide()) return '';
    const full = run.config.variant === 'full',
      focus = run.config.practice ? run.config.spellingFocus : 'full';
    return /* HTML */ `<form id="typed-form" class="form-controls">
      <label class="sr-only" for="transcription-answer">${escape(answerLabel())}</label>
      <div class="rail-answer-controls">
        <div class="answer-input-row">
          <input
            id="transcription-answer"
            name="answer"
            type="text"
            value="${escape(inputValue)}"
            ${focus === 'initials' ? 'placeholder="Initials"' : focus === 'finals' ? 'placeholder="Finals"' : ''}
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="go"
            aria-describedby="input-status"
            ${paused || !['listening', 'answering', 'correct'].includes(phase) ? 'disabled' : ''}
          /><button
            class="primary"
            id="check-answer"
            type="submit"
            ${!answering() ? 'disabled' : ''}
          >
            ${run.config.practice ? 'Check spelling' : 'Build span'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <div class="rail-review-actions">${reviewActions}</div>
      </div>
      ${full && profile.typingHelpers.length ? '<div class="typing-tools" role="group" aria-label="' + escape(profile.romanization) + ' typing helpers">' + profile.typingHelpers.map((helper) => '<button type="button" data-insert="' + escape(helper.value) + '" aria-label="' + escape(helper.description) + '">' + escape(helper.label) + '</button>').join('') + '</div>' : ''}
      <p id="input-status" class="game-message" role="status">${escape(message)}</p>
    </form>`;
  }

  return { controlsMarkup, progressMarkup, promptMarkup, toneButtons, typedForm, answerLabel };
}

export function endingWord(run: Run) {
  return run.word.syllables
    .map((s) => {
      const spelling = run.world === 'tide' ? run.profile.format(s.transcription) : s.transcription;
      return s.text === spelling ? s.text : s.text + ' ' + spelling;
    })
    .join(' · ');
}

export function runConclusionMarkup(run: Run, ready: boolean, reward: string, report: string) {
  const won = run.status === 'won';
  const rail = run.world === 'tide';
  const title = won
    ? rail
      ? 'You reached the final station'
      : 'The whole tower is alight.'
    : rail
      ? 'Skyrail run ended.'
      : 'Tower run ended.';
  const unit = rail
    ? run.opened === 1
      ? 'span crossed'
      : 'spans crossed'
    : run.opened === 1
      ? 'floor lit'
      : 'floors lit';
  const disabled = ready ? '' : 'disabled';
  return /* HTML */ `<section
    class="run-conclusion ${ready ? '' : 'is-arriving'}"
    aria-labelledby="run-end-title"
  >
    <h2 id="run-end-title" tabindex="-1">${title}</h2>
    <p>${run.opened} ${unit} · ${run.mistakes} ${run.mistakes === 1 ? 'miss' : 'misses'}</p>
    ${reward ? '<p class="homecoming-message" role="status">' + escape(reward) + '</p>' : ''}
    ${
      !won
        ? /* HTML */ `<p class="ending-word">
            <span class="ending-word-text">${escape(endingWord(run))}</span>
            <button class="text-button" id="ending-replay" type="button">
              ▶ Listen again <kbd>Space</kbd>
            </button>
            ${report}
          </p>`
        : ''
    }
    <div class="results-actions">
      ${!(rail && won) ? `<button class="primary" id="retry-run" type="button" ${disabled}>${won ? 'A new adventure' : 'Try again'} →</button>` : ''}
      ${!rail && !won ? `<button class="secondary" id="ending-practice" type="button" ${disabled}>Practice this tone combination</button>` : ''}
      ${!rail && run.missedPrompts.length ? `<button class="secondary" id="practise-mistakes" type="button" ${disabled}>Practice your mistakes</button>` : ''}
      <button
        class="${rail && won ? 'primary' : 'text-button'}"
        id="ending-home"
        type="button"
        ${disabled}
      >
        Back to Home
      </button>
    </div>
  </section>`;
}
