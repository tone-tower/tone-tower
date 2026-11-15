import { toneCoverMarkup } from '../ui/tone-cover.js';
import type { Run, LanguageProfile, RunResult, ControllerPhase } from '../types.ts';
import { escape } from '../ui/dom.ts';
import { doorSlots } from '../world/worlds.js';
import { textLanguage } from '../languages/text-language.ts';
import { toneDefinition, toneLabel, toneSymbolMarkup } from '../ui/tone-presentation.ts';
interface Presentation {
  run: Run;
  phase: ControllerPhase;
  profile: LanguageProfile;
  paused: boolean;
  inputValue: string;
  message: string;
  outcome: RunResult | null;
  answering: () => boolean;
  script: string;
  unveiling: boolean;
}
export function createGameMarkup(state: () => Presentation) {
  const isTide = () => state().run.config.challenge === 'tide';
  function progressMarkup() {
    const { run } = state();
    const drill = run.config.practice && run.config.format === 'drill',
      finite = drill && run.config.length !== 'endless';
    const label = drill
      ? run.attempts + (finite ? ' / ' + run.config.length : '')
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
  function lifeMarkup() {
    const { run, phase, outcome } = state();
    const lives = run.lives;
    const maxLives = run.maxLives ?? 0;
    if (lives === null) return '<span class="life-meter is-unlimited">Unlimited attempts</span>';
    return (
      '<span class="life-meter" role="img" aria-label="' +
      run.lives +
      ' of ' +
      run.maxLives +
      ' lives remaining">' +
      Array.from(
        { length: maxLives },
        (_, i) =>
          '<svg class="pixel-life ' +
          (i >= lives ? 'is-empty ' : '') +
          (phase === 'review' && i === lives
            ? 'heart-lost '
            : outcome?.recovered && i >= lives - outcome.recovered && i < lives
              ? 'is-restored '
              : '') +
          '" viewBox="0 0 20 22" aria-hidden="true"><path d="M1 5L5 1h4l1 3 1-3h4l4 4v7L10 21 1 12Z"/><path class="life-facet" d="M4 6h3v6H4m8-6h3v3h-3"/></svg>',
      ).join('') +
      '</span>'
    );
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
  function coveredPromptMarkup(reveal = false) {
    const { run, profile, script } = state();
    // Every syllable of a word hides its tone, so its neighbours give nothing away.
    const concealed = (i: number) =>
      isTide() ? null : (profile.concealTone?.(run.word.syllables[i].text ?? '') ?? null);
    const covered = run.word.syllables.some((_, i) => concealed(i));
    const meaning =
      covered && !reveal && run.word.gloss
        ? (profile.concealMeaning?.(run.word.gloss) ?? run.word.gloss)
        : run.word.gloss;
    // A written word is as wide as its letters; its size follows their count.
    const letters = run.word.syllables.reduce((n, s) => n + [...(s.text ?? '')].length, 0);
    // The longest tone name holds the answer's place, so revealing it moves nothing.
    const reserved = profile.toneDefinitions
      .map((def) => def.label)
      .reduce((a, b) => (b.length > a.length ? b : a));
    return /* HTML */ `<div
      class="word-prompt"
      lang="${escape(textLanguage(profile, script))}"
      data-length="${run.word.syllables.length}"
      ${run.word.syllables.length >= 4 ? 'data-long="true"' : ''}
      ${covered ? 'data-letters="' + letters + '"' : ''}
      style="--syllables:${run.word.syllables.length}${covered ? ';--letters:' + letters : ''}"
    >
      <div class="prompt-syllables">
        ${run.word.syllables
          .map((s, i) => {
            const target = run.targets.includes(i),
              hidden = concealed(i),
              spelling = hidden
                ? target && reveal
                  ? toneDefinition(profile, s.tone).label
                  : ''
                : reveal
                  ? profile.format(s.transcription)
                  : !isTide()
                    ? profile.withoutTones(s.transcription)
                    : '';
            return /* HTML */ `<span
              class="prompt-syllable ${target ? 'is-target' : ''} ${hidden ? 'has-tone-cover' : ''}"
              >${target && run.targets.length === 1 ? '<span class="target-label">Listen here</span>' : ''}<span
                class="prompt-character"
                >${hidden ? concealedMarkup(reveal ? (s.text ?? '') : hidden.base, hidden.index, reveal) : escape(s.text)}</span
              ><span
                class="prompt-romanization ${hidden && target && !reveal ? 'is-reserved' : ''}"
                ${hidden && target && !reveal ? 'aria-hidden="true"' : ''}
                >${spelling ? escape(spelling) : hidden && target ? escape(reserved) : '&nbsp;'}</span
              ></span
            >`;
          })
          .join('')}
      </div>
      ${reveal && run.word.syllables.some((s) => s.dictionaryTone !== undefined && s.dictionaryTone !== s.tone) ? '<p class="tone-explanation">Heard tones: ' + escape(run.word.syllables.map((s) => profile.toneDefinitions.find((d) => d.value === s.tone)?.label).join(' · ')) + '. Dictionary spelling: ' + escape(profile.format(run.word.transcription || run.word.syllables.map((s) => s.transcription).join(' '))) + '. Tone Tower follows this recording; Skyrail uses dictionary spelling.</p>' : ''}
      <p class="prompt-gloss">${meaning ? escape(meaning) : '&nbsp;'}</p>
    </div>`;
  }

  function promptMarkup(reveal = false) {
    const { run, profile, script } = state();
    if (profile.concealTone && !isTide()) return coveredPromptMarkup(reveal);
    const feedback = reveal && !isTide() ? (profile.toneFeedback?.(run.word.syllables) ?? '') : '';
    return /* HTML */ `<div
      class="word-prompt"
      data-length="${run.word.syllables.length}"
      ${run.word.syllables.length >= 4 ? 'data-long="true"' : ''}
      style="--syllables:${run.word.syllables.length}"
    >
      <div class="prompt-syllables">
        ${run.word.syllables
          .map((s, i) => {
            const target = run.targets.includes(i),
              spelling = reveal
                ? isTide() && run.config.variant !== 'full'
                  ? profile.withoutTones(s.transcription)
                  : profile.format(s.transcription)
                : !isTide()
                  ? profile.withoutTones(s.transcription)
                  : '';
            return /* HTML */ `<span class="prompt-syllable ${target ? 'is-target' : ''}"
              >${!isTide() && target && run.targets.length === 1 ? '<span class="target-label">Listen here</span>' : ''}<span
                class="prompt-character"
                lang="${escape(textLanguage(profile, script))}"
                >${escape(s.text)}</span
              ><span class="prompt-romanization" lang="${escape(profile.id + '-Latn')}"
                >${spelling ? escape(spelling) : '&nbsp;'}</span
              ></span
            >`;
          })
          .join('')}
      </div>
      ${feedback ? '<p class="tone-explanation">' + escape(feedback) + '</p>' : ''}
      <p class="prompt-gloss">${escape(run.word.gloss)}</p>
    </div>`;
  }
  function toneButtons() {
    const { run, phase, profile, answering } = state();
    const slots = doorSlots(run.choices.length).map(
      ([x, y, w, h]: number[]) =>
        `left:${x / 4.8}%;top:${y / 2.4}%;width:${w / 4.8}%;height:${h / 2.4}%`,
    );
    return run.choices
      .map(
        (t, index) =>
          /* HTML */ `<button
            style="${slots[index]}"
            type="button"
            class="tone-door ${toneDefinition(profile, t).markPath !== undefined ? 'has-mark' : ''} ${(phase === 'correct' || phase === 'landing') && t === run.word.tone ? 'is-correct' : ''} ${phase === 'review' && t === run.word.tone ? 'is-answer' : ''} ${phase === 'review' && t === run.lastAnswer ? 'is-wrong' : ''}"
            data-tone="${t}"
            aria-label="${phase === 'review' && t === run.word.tone ? 'Correct answer: ' : phase === 'review' && t === run.lastAnswer ? 'Your choice: ' : 'Choose '}${escape(toneLabel(profile, t))}"
            ${!answering() ? 'disabled' : ''}
          >
            ${phase === 'review' && t === run.word.tone ? '<span class="answer-mark" aria-hidden="true">✓</span>' : ''}${toneSymbolMarkup(profile, t)}${run.config.practice && profile.toneNotation === 'numbers' ? '<svg class="practice-tone-contour" viewBox="0 0 100 36" aria-hidden="true"><path d="' + toneDefinition(profile, t).path + '"/></svg>' : ''}<span
              class="tone-name"
              >${phase === 'review' && t === run.lastAnswer ? '✕ Your choice' : phase === 'review' && t === run.word.tone ? 'CORRECT' : escape(toneDefinition(profile, t).name)}</span
            ><kbd class="door-key"
              >${run.choices.length === 2 ? (run.choices.indexOf(t) === 0 ? '←' : '→') : run.choices.length === 3 ? ['←', '↑ ↓', '→'][run.choices.indexOf(t)] : run.choices.length === 4 ? ['↑', '←', '→', '↓'][run.choices.indexOf(t)] : t}</kbd
            >
          </button>`,
      )
      .join('');
  }
  function typedForm() {
    const { run, phase, profile, paused, inputValue, message, answering } = state();
    if (!isTide()) return '';
    const full = run.config.variant === 'full',
      focus = run.config.practice ? run.config.spellingFocus : 'full';
    const target =
      run.targets.length === 1
        ? `the highlighted syllable, ${escape(run.word.syllables[run.targets[0]].text)}`
        : 'the whole word';
    return /* HTML */ `<form id="typed-form" class="form-controls">
      <label for="transcription-answer"
        >${focus === 'initials' ? 'Initials' : focus === 'finals' ? 'Finals' : profile.romanization}
        for ${target}</label
      >
      <div class="answer-input-row">
        <input
          id="transcription-answer"
          name="answer"
          type="text"
          value="${escape(inputValue)}"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
          aria-describedby="input-status"
          ${paused || !['listening', 'answering', 'correct'].includes(phase) ? 'disabled' : ''}
        /><button class="primary" id="check-answer" type="submit" ${!answering() ? 'disabled' : ''}>
          ${run.config.practice ? 'Check spelling' : 'Build span'} <span aria-hidden="true">→</span>
        </button>
      </div>
      ${full && profile.typingHelpers.length ? '<div class="typing-tools" role="group" aria-label="' + escape(profile.romanization) + ' typing helpers">' + profile.typingHelpers.map((helper) => '<button type="button" data-insert="' + escape(helper.value) + '" aria-label="' + escape(helper.description) + '">' + escape(helper.label) + '</button>').join('') + '</div>' : ''}
      <p id="input-status" class="game-message" role="status">${escape(message)}</p>
    </form>`;
  }

  return { progressMarkup, lifeMarkup, promptMarkup, toneButtons, typedForm };
}
