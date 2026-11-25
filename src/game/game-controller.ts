import { toneLabel } from '../ui/tone-presentation.ts';
import {
  createGameMarkup,
  doorArrowKeys,
  endingWord,
  pauseButtonMarkup,
  runConclusionMarkup,
} from './game-markup.ts';
import { textLanguage } from '../languages/text-language.ts';
import { query, queryAll, required, escape, errorMessage } from '../ui/dom.ts';
import type {
  Run,
  RunInput,
  RunResult,
  ExerciseRow,
  LanguageProfile,
  AudioPlayer,
  Tone,
  ControllerPhase,
  FailureReason,
  RunCheckpoint,
} from '../types.ts';
type Timer = ReturnType<typeof setTimeout>;
interface CountdownOptions {
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  onTick?: (left: number, total: number) => void;
  onExpire?: () => void;
}
interface ExitConfirmation {
  title: string;
  message: string;
  action: string;
  confirm: () => void;
}
interface ControllerOptions {
  profile: LanguageProfile;
  app: HTMLElement;
  player: AudioPlayer;
  siteHeader?: HTMLElement;
  words: ExerciseRow[];
  script?: string;
  onFinish?: (run: Run) => void;
  onCheckpoint?: (checkpoint: RunCheckpoint) => void;
  onDiscard?: () => void;
  recoveryWarning?: () => string;
  victoryMessage?: (run: Run) => string;
  onRetry?: (config: RunInput) => void;
  onHome?: () => void;
  onPractice?: (run: Run, mode: 'combination' | 'mistakes') => void;
  environment?: CountdownOptions & {
    document?: Document;
    animateWorld?: typeof animateWorld;
    heartRandom?: () => number;
  };
}
import { recordingIssueUrl } from '../ui/recording-report.ts';
import { requireProfile } from '../languages/profile.ts';
import { createRun } from './game-core.ts';
import { worldScene, districts } from '../world/worlds.js';
import { animateWorld } from '../world/world-runtime.js';
import { RAIL_CARS } from '../world/skyrail-world.js';

// One authoritative clock drives both the deadline and the approaching rail gap.
// Playback and rendering never create a second, competing deadline.
export function createCountdown({
  now = () => Date.now(),
  setTimeout: later = globalThis.setTimeout,
  clearTimeout: cancel = globalThis.clearTimeout,
  onTick = () => {},
  onExpire = () => {},
}: CountdownOptions = {}) {
  let left = 0,
    total = 0,
    deadline = 0,
    handle: Timer | null = null,
    running = false,
    expired = false;
  const remaining = () => (running ? Math.max(0, deadline - now()) : left);
  function clearHandle() {
    if (handle !== null) cancel(handle);
    handle = null;
  }
  function tick() {
    handle = null;
    if (!running) return;
    left = remaining();
    onTick(left, total);
    if (left <= 0) {
      running = false;
      if (!expired) {
        expired = true;
        onExpire();
      }
      return;
    }
    handle = later(tick, Math.min(50, left));
  }
  return {
    start(ms: number, endsAt = now() + ms) {
      clearHandle();
      total = left = Math.max(0, ms);
      deadline = endsAt;
      expired = false;
      running = total > 0;
      if (running) tick();
      else onTick(left, total);
    },
    pause() {
      left = remaining();
      running = false;
      clearHandle();
      onTick(left, total);
    },
    resume() {
      if (running || expired || !total) return;
      deadline = now() + left;
      running = true;
      tick();
    },
    clear() {
      clearHandle();
      running = false;
      left = total = 0;
      expired = false;
    },
    get remaining() {
      return remaining();
    },
    get total() {
      return total;
    },
    get deadline() {
      return total ? deadline : null;
    },
    get running() {
      return running;
    },
  };
}

export function createGameController({
  profile,
  app,
  player,
  siteHeader,
  words,
  script: initialScript = profile.defaultScript,
  onFinish = () => {},
  onCheckpoint = () => {},
  onDiscard = () => {},
  recoveryWarning = () => '',
  victoryMessage = () => '',
  onRetry = () => {},
  onHome = () => {},
  onPractice = () => {},
  environment = {},
}: ControllerOptions) {
  requireProfile(profile);
  const doc = environment.document ?? globalThis.document;
  const now = environment.now ?? Date.now;
  const later = environment.setTimeout ?? globalThis.setTimeout;
  const cancel = environment.clearTimeout ?? globalThis.clearTimeout;
  const animateScene = environment.animateWorld ?? animateWorld;
  let run!: Run;
  let phase: ControllerPhase = 'idle',
    active = false,
    paused = false,
    reloadPause = false,
    attached = false;
  let generation = 0,
    audioGeneration = 0,
    auto: Timer | null = null,
    audioReady = false,
    audioFailed = false,
    promptPlaybackStarted = false;
  let inputValue = '',
    message = '',
    towerReady = true,
    outcome: RunResult | null = null,
    answeredPosition = 1;
  let exitConfirmation: ExitConfirmation | null = null,
    spaceTarget: HTMLElement | null = null,
    sceneAnimator: ReturnType<typeof animateWorld> | null = null,
    entryVisual = false;
  let script = initialScript;
  const boundTyping = new WeakSet();
  const q = <S extends string>(selector: S) => query(app, selector);
  const qa = <S extends string>(selector: S) => queryAll(app, selector);
  const isTide = () => run?.config.challenge === 'tide';
  const manualPause = () => isTide() || run.timeLimit() > 0;
  const answering = () =>
    active && !paused && phase === 'answering' && audioReady && !audioFailed && !doc?.hidden;
  const choosingTone = () =>
    active &&
    !isTide() &&
    !paused &&
    !doc.hidden &&
    !audioFailed &&
    !entryVisual &&
    (phase === 'answering' || (phase === 'listening' && promptPlaybackStarted)) &&
    run.promptState === 'ready';
  const clock = createCountdown({
    now,
    setTimeout: later,
    clearTimeout: cancel,
    onTick: updateClock,
    onExpire: () => fail('timeout'),
  });
  const timedPrompt = () => phase === 'answering' && clock.deadline !== null;
  const timedOut = () => phase === 'review' && run.lastFailure === 'timeout';
  function expirePrompt() {
    if (!active || !timedPrompt() || clock.remaining > 0) return false;
    fail('timeout');
    return true;
  }
  function checkpoint(deadline = run.promptState === 'ready' ? clock.deadline : null) {
    onCheckpoint({ run: run.snapshot(), deadline });
  }

  function cancelAuto() {
    if (auto !== null) cancel(auto);
    auto = null;
  }
  function stopPlayback() {
    audioGeneration++;
    player.stop();
  }
  function stop({ keepScene = false } = {}) {
    if (!keepScene) {
      sceneAnimator?.dispose();
      sceneAnimator = null;
    }
    generation++;
    cancelAuto();
    clock.clear();
    stopPlayback();
  }
  function attach() {
    if (attached) return;
    attached = true;
    doc.addEventListener('keydown', keydown, true);
    doc.addEventListener('keyup', keyup, true);
    doc?.addEventListener('visibilitychange', visibility);
    app.addEventListener('pointerdown', keepTypingFocus);
  }
  function detach() {
    if (!attached) return;
    attached = false;
    doc.removeEventListener('keydown', keydown, true);
    doc.removeEventListener('keyup', keyup, true);
    doc?.removeEventListener('visibilitychange', visibility);
    app.removeEventListener('pointerdown', keepTypingFocus);
  }
  function visibility() {
    spaceTarget = null;
    expirePrompt();
    if (active && doc.hidden && phase !== 'interrupted') pause();
  }
  function captureInput() {
    const input = q('#transcription-answer')!;
    if (input) inputValue = input.value;
  }
  function keepTypingFocus(event: PointerEvent) {
    // Let the action finish before a phone keyboard can close and move its target.
    if (
      event.button === 0 &&
      isTide() &&
      doc?.activeElement === q('#transcription-answer') &&
      event.target instanceof Element &&
      event.target.closest('button, a[href]')
    )
      event.preventDefault();
  }
  function position() {
    const floor = phase === 'correct' || phase === 'landing' ? answeredPosition : run.opened + 1;
    return run.config.practice && run.config.format === 'drill' ? floor : Math.min(100, floor);
  }
  function presentation() {
    return paused
      ? 'paused'
      : audioFailed
        ? 'unavailable'
        : phase === 'review'
          ? run.lastFailure === 'timeout'
            ? 'timeout'
            : run.lastFailure === 'reveal'
              ? 'reveal'
              : 'wrong'
          : phase === 'correct' || phase === 'landing'
            ? 'success'
            : message && isTide()
              ? 'retry'
              : phase;
  }
  let unveiling = false;
  const said = (value: unknown) => {
    const tone = profile.tones.find((tone) => tone === value);
    return tone === undefined ? String(value) : toneLabel(profile, tone);
  };
  const { controlsMarkup, progressMarkup, promptMarkup, toneButtons, typedForm, answerLabel } =
    createGameMarkup(() => ({
      run,
      phase,
      profile,
      paused,
      inputValue,
      message,
      answering,
      choosingTone,
      script,
      unveiling,
    }));
  function railFeedback() {
    const review = phase === 'review';
    const text = audioFailed
      ? timedPrompt()
        ? 'Recording unavailable. The clock is still running. Replay to retry.'
        : 'Recording unavailable. Replay to retry.'
      : review
        ? (run.lastFailure === 'timeout' ? 'Time’s up. The answer is ' : 'The answer is ') +
          run.targets.map((i) => profile.format(run.word.syllables[i].transcription)).join(' ')
        : '';
    return (
      '<div class="game-feedback rail-feedback' +
      (review && !audioFailed ? ' sr-only' : '') +
      '" role="status" data-feedback="' +
      (audioFailed || review ? 'error' : 'neutral') +
      '"><span id="rail-message">' +
      escape(text) +
      '</span>' +
      (audioFailed && !timedPrompt()
        ? '<button class="primary rail-continue" id="replace-recording" type="button">Replace word →</button>'
        : '') +
      '</div>'
    );
  }
  const terminal = () => !run.config.practice && run.status !== 'playing';
  function recordingReport() {
    if (phase !== 'review') return '';
    return /* HTML */ `<a
      class="recording-report text-button"
      href="${escape(recordingIssueUrl(run.word, profile, run.config))}"
      target="_blank"
      rel="noopener"
      >Report recording <span aria-hidden="true">↗</span></a
    >`;
  }
  function reviewActions() {
    const practiceComplete = isTide() && run.config.practice && run.status !== 'playing';
    if (!practiceComplete && (phase !== 'review' || run.status !== 'playing')) return '';
    const label = practiceComplete
      ? 'See results'
      : run.config.practice
        ? 'Next recording'
        : isTide()
          ? 'Catch the next car'
          : 'Try the next sound';
    return /* HTML */ `${recordingReport()}<button class="primary" id="continue-game" type="button">
        ${label} <kbd>Enter</kbd> →
      </button>`;
  }
  function railInterlude() {
    if (!isTide() || phase !== 'landing' || terminal()) return '';
    const whole =
      run.config.target === 'whole' || (run.config.target === 'stage' && run.opened >= 40);
    return (
      '<section class="rail-interlude"><span class="eyebrow">' +
      escape(districts.tide[run.stage].name) +
      '</span><h2>Checkpoint reached.</h2><p>' +
      RAIL_CARS[run.stage] +
      ' car · ' +
      (run.timeLimit() ? Math.round(run.timeLimit() / 1000) + 's per word' : 'untimed') +
      '<br>Next: type ' +
      (whole ? 'the whole word' : 'the highlighted syllable') +
      '.' +
      (run.lives === null ? '' : ' All lives restored.') +
      '</p>' +
      towerContinue('Depart when ready') +
      '</section>'
    );
  }
  const towerTerminal = () => !isTide() && run.status !== 'playing';
  const towerStop = () => !isTide() && (phase === 'landing' || terminal() || towerTerminal());
  function towerContinue(label: string) {
    return (
      '<button class="primary" id="continue-game" type="button" ' +
      (!towerReady ? 'disabled' : '') +
      '>' +
      label +
      ' →</button>'
    );
  }
  function towerInterlude() {
    const available =
        run.config.practice && run.config.format === 'drill'
          ? run.config.choices
          : Math.min(run.config.tones.length, profile.stageChoices[run.stage]),
      nextChoices = profile.choiceCounts.filter((n) => n <= available).at(-1);
    return /* HTML */ `<section class="tower-interlude" aria-labelledby="landing-title">
      <div>
        <span class="eyebrow">LANDING ${run.opened}</span>
        <h2 id="landing-title" tabindex="-1">
          ${run.lives === null ? 'Checkpoint reached.' : 'Lives refilled.'}
        </h2>
        <p>
          ${run.lives === null ? 'Unlimited lives.' : run.lives + ' of ' + run.maxLives + ' lives.'}
          Next: ${escape(districts.tone[run.stage].name)} · ${nextChoices} doors.
        </p>
      </div>
      ${towerContinue('Continue when ready')}
    </section>`;
  }
  function towerEnding() {
    if (!towerTerminal() || terminal()) return '';
    const won = run.status === 'won',
      practice = run.config.practice && run.status === 'complete';
    return (
      '<section class="tower-run-end" aria-labelledby="tower-end-title"><span class="eyebrow">' +
      (practice ? 'PRACTICE TONES' : won ? '100 FLOORS · THE SUMMIT IS YOURS' : 'RUN ENDED') +
      '</span><h2 id="tower-end-title">' +
      (practice ? 'Practice complete.' : won ? 'The whole tower is alight.' : 'Tower run ended.') +
      '</h2><p>' +
      (won
        ? 'Take one last step into the open sky.'
        : run.cleared + ' ' + (practice ? 'correct answers' : 'floors lit') + '.') +
      '</p><div class="results-actions">' +
      recordingReport() +
      towerContinue(
        practice ? 'See practice results' : won ? 'Step onto the summit' : 'Finish this climb',
      ) +
      '</div></section>'
    );
  }
  function unlockTowerStop() {
    cancelAuto();
    const own = generation,
      delay =
        run.config.practice || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 0
          : phase === 'landing'
            ? 2400
            : 2800;
    auto = later(() => {
      auto = null;
      if (active && !paused && own === generation) {
        towerReady = true;
        render({ focus: terminal() && doc?.activeElement === q('#run-end-title') });
      }
    }, delay);
  }
  function towerFeedback() {
    const review = phase === 'review';
    const text = audioFailed
      ? 'Recording unavailable. Replay to retry, or replace this word.'
      : review
        ? (run.lastFailure === 'timeout'
            ? 'Time’s up'
            : towerTerminal()
              ? 'Not quite'
              : 'You chose ' + said(run.lastAnswer)) +
          '. The correct tone is ' +
          said(run.word.tone) +
          '.'
        : '';
    const action =
      audioFailed && !timedPrompt()
        ? '<button class="primary tower-continue" id="replace-recording" type="button">Replace word →</button>'
        : '';
    return (
      '<div class="game-feedback tower-feedback' +
      (review && !audioFailed ? ' sr-only' : '') +
      '" role="status" data-feedback="' +
      (audioFailed || review ? 'error' : 'neutral') +
      '"><span id="tower-message">' +
      escape(text) +
      '</span>' +
      action +
      '</div>'
    );
  }
  function pauseMarkup() {
    if (!paused) return '';
    return /* HTML */ `<section
      class="pause-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div class="pause-card">
        <p class="eyebrow">Paused</p>
        <h2 id="pause-title">${escape(exitConfirmation?.title ?? 'Run paused.')}</h2>
        <p>
          ${escape(exitConfirmation?.message ?? (timedPrompt() ? 'The clock is still running.' : 'Resume when you’re ready.'))}
        </p>
        ${exitConfirmation && timedPrompt() ? '<p>The clock is still running.</p>' : ''}
        <div class="game-actions">
          <button class="primary" id="resume-game" type="button">
            Resume <span aria-hidden="true">→</span></button
          >${run.config.practice && !exitConfirmation ? '<button class="secondary" id="finish-paused-practice" type="button">Finish practice</button>' : ''}<button
            class="quiet"
            id="end-run"
            type="button"
          >
            ${escape(exitConfirmation?.action ?? 'End run & return')}
          </button>
        </div>
      </div>
    </section>`;
  }
  function syncScene() {
    const scene = q('.world-scene')!;
    if (!scene) return;
    const canvas = q('.world-canvas')!;
    if (!sceneAnimator || sceneAnimator.canvas !== canvas) {
      sceneAnimator?.dispose();
      sceneAnimator = animateScene(canvas);
    }
    const sceneState = {
      scene: isTide() ? 'rail' : 'tone',
      ending: terminal() ? run.status : null,
      progress: run.opened,
      count: run.choices.length,
      phase,
      reason: run.lastFailure,
      selected: run.choices.findIndex((t) => t === run.lastAnswer),
      paused: paused || audioFailed,
      entry: entryVisual && phase === 'listening',
      floor: answeredPosition - 1,
      answer: run.choices.findIndex((t) => t === run.word.tone),
      recovered: outcome?.recovered || 0,
      heartAhead: run.heartAhead,
      heartDrop: outcome?.kind === 'correct' && outcome.heartDrop === true,
      lives: run.lives,
      maxLives: run.maxLives,
      practice: run.config.practice && run.config.format === 'drill',
      timed: run.timeLimit() > 0,
      remaining: timedOut() ? 0 : (clock.total ? clock.remaining : run.timeLimit()) / 1000,
      approach: timedOut()
        ? 1
        : clock.total && ['answering', 'review'].includes(phase)
          ? Math.min(1, Math.max(0, 1 - clock.remaining / clock.total))
          : 0,
    };
    sceneAnimator.update(sceneState);
  }
  function focusGameplay() {
    if (!active) return;
    const target = paused
      ? q('#resume-game')
      : terminal()
        ? q('#run-end-title')
        : q('#continue-game')
          ? (q('#landing-title') ?? q('.scene-question'))
          : isTide() && !q('#transcription-answer')?.disabled
            ? q('#transcription-answer')
            : q('.game-layout');
    target?.focus({ preventScroll: true });
  }
  function render({ focus = true } = {}) {
    if (!active) return;
    const previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const focusedInGame = previousFocus && app.contains(previousFocus);
    const previousFrame = q('.scene-frame')!,
      previousScene = q('.world-scene')!;
    const sceneKey = run.config.challenge;
    const keepScene =
      previousFrame &&
      previousScene &&
      previousScene.dataset.sceneKey === sceneKey &&
      typeof previousFrame.replaceWith === 'function';
    app.dataset.view = 'game';
    app.dataset.world = run.config.challenge;
    app.dataset.practice = String(run.config.practice);
    app.dataset.outcome = presentation();
    const showScenePause = manualPause() && (phase === 'landing' || terminal());
    const inTowerLanding = !isTide() && phase === 'landing';
    const actions = reviewActions();
    const recovered = outcome?.recovered ?? 0;
    const success =
      outcome?.kind === 'correct' && outcome.heartDrop
        ? `Heart restored. ${run.lives} of ${run.maxLives} lives remaining.`
        : recovered
          ? `Correct. ${recovered} ${recovered === 1 ? 'life' : 'lives'} restored.`
          : 'Correct.';
    const statusText = entryVisual
      ? 'Entering the tower…'
      : phase === 'listening'
        ? 'Listening…'
        : audioFailed
          ? 'Replay to retry the recording.'
          : phase === 'correct' || phase === 'landing'
            ? success
            : '';
    const recovery = recoveryWarning();
    const markup = /* HTML */ `<div
      class="game-layout"
      tabindex="-1"
      data-outcome="${presentation()}"
      data-terminal="${terminal()}"
      data-landing="${phase === 'landing'}"
    >
      ${controlsMarkup(showScenePause)}
      <div class="scene-question" tabindex="-1">
        ${
          inTowerLanding
            ? towerInterlude()
            : /* HTML */ ` ${promptMarkup(['review', 'correct', 'landing'].includes(phase), manualPause() && !showScenePause)}
              ${isTide() ? railFeedback() : towerFeedback()} ${towerEnding()}`
        }
      </div>
      <div class="scene-frame">
        ${worldScene(run.config.challenge, { position: position(), phase: paused ? 'paused' : phase, content: isTide() ? railInterlude() : toneButtons() + (actions ? `<div class="scene-review-action">${actions}</div>` : ''), count: run.choices.length })}
      </div>
      ${isTide() ? /* HTML */ `<div class="typing-slot">${typedForm(actions)}</div>` : ''}
      <div class="game-panel">
        ${terminal() ? runConclusionMarkup(run, towerReady, run.status === 'won' ? victoryMessage(run) : '', recordingReport()) : ''}
        <div class="feedback-zone"></div>
        <div class="game-actions">
          ${run.config.practice ? progressMarkup() : ''}
          ${run.config.practice && run.status === 'playing' ? '<button class="quiet" id="finish-practice" type="button">Finish practice</button>' : ''}
        </div>
        <div id="audio-error" class="error" role="alert"></div>
        <p id="recovery-status" class="small" role="status" ${recovery ? '' : 'hidden'}>
          ${escape(recovery)}
        </p>
        ${!isTide() && !inTowerLanding && !terminal() ? `<p class="small keyboard">${phase === 'listening' || phase === 'answering' ? 'Choose a tone with the keys shown on its door. ' : ''}Replay with <kbd>Space</kbd> or <kbd>R</kbd>.</p>` : ''}
      </div>
      <p id="audio-status" class="game-message sr-only" role="status"></p>
      ${pauseMarkup()}
    </div>`;
    // Keep the live input and canvas mounted: mobile keyboards and travel survive a word change.
    const keepMounted = keepScene && typeof doc?.createElement === 'function';
    if (keepMounted) {
      const next = doc.createElement('div');
      next.innerHTML = markup;
      for (const selector of ['.game-controls', '.scene-question', '.game-panel'])
        q(selector)!.replaceWith(required(next, selector));
      if (isTide()) {
        const input = q('#transcription-answer')!,
          fresh = required(next, '#transcription-answer');
        input.value = inputValue;
        input.disabled = fresh.disabled;
        input.removeAttribute('aria-invalid');
        input.placeholder = fresh.placeholder;
        q('#check-answer')!.disabled = required(next, '#check-answer').disabled;
        q('#typed-form > label')!.textContent = required(next, '#typed-form > label').textContent;
        q('#input-status')!.textContent = required(next, '#input-status').textContent;
        q('.rail-review-actions')!.innerHTML = required(next, '.rail-review-actions').innerHTML;
      }
      previousScene.querySelector<HTMLElement>('.scene-content')!.innerHTML =
        next.querySelector<HTMLElement>('.scene-content')!.innerHTML;
      previousScene.querySelector<HTMLElement>('.world-sr-only')!.textContent =
        next.querySelector<HTMLElement>('.world-sr-only')!.textContent;
      previousScene.dataset.count = String(run.choices.length);
      q('.game-layout')!.dataset.landing = String(phase === 'landing');
      q('.game-layout')!.dataset.terminal = String(terminal());
      q('.game-layout')!.dataset.outcome = presentation();
      previousScene.dataset.phase = paused ? 'paused' : phase;
      q('.pause-overlay')?.remove();
      const overlay = query(next, '.pause-overlay');
      if (overlay) q('.game-layout')!.append(overlay);
    } else app.innerHTML = markup;
    if (keepScene && !keepMounted) {
      const nextFrame = q('.scene-frame')!,
        nextScene = q('.world-scene')!;
      previousScene.dataset.phase = nextScene.dataset.phase;
      previousScene.dataset.count = String(run.choices.length);
      previousScene.querySelector<HTMLElement>('.world-sr-only')!.textContent =
        nextScene.querySelector<HTMLElement>('.world-sr-only')!.textContent;
      previousScene.querySelector<HTMLElement>('.scene-content')!.innerHTML =
        nextScene.querySelector<HTMLElement>('.scene-content')!.innerHTML;
      nextFrame.replaceWith(previousFrame);
    }
    const mounted = q('.world-scene')!;
    if (mounted) mounted.dataset.sceneKey = sceneKey;
    const status = required(app, '#audio-status');
    if (status.textContent !== statusText) status.textContent = statusText;
    bind();
    updateClock(clock.remaining, clock.total);
    syncScene();
    if (focus) focusGameplay();
    else if (previousFocus && app.contains(previousFocus)) {
      if (previousFocus.matches(':disabled')) focusGameplay();
    } else if (previousFocus && focusedInGame) {
      const replacement = previousFocus.id && doc.getElementById(previousFocus.id);
      if (replacement && !replacement.matches(':disabled')) {
        replacement.focus({ preventScroll: true });
      } else {
        focusGameplay();
      }
    }
  }
  function bind() {
    if (siteHeader) siteHeader.inert = paused;
    qa('.game-layout > :not(.pause-overlay, #audio-status)').forEach((element) => {
      element.inert = paused;
    });
    qa('[data-tone]').forEach((button) =>
      button.addEventListener('click', () =>
        choose(profile.tones.find((t) => String(t) === button.dataset.tone)),
      ),
    );
    qa('[data-insert]').forEach((button) => {
      if (boundTyping.has(button)) return;
      boundTyping.add(button);
      button.addEventListener('pointerdown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        const inserted = button.dataset.insert ?? '';
        const input = q('#transcription-answer')!;
        if (!input || input.disabled || input.composing) return;
        const start = input.selectionStart ?? input.value.length,
          end = input.selectionEnd ?? start;
        const helper = profile.typingHelpers.find((item) => item.value === inserted);
        const edit = helper?.apply?.(input.value, start, end) ?? {
          value: input.value.slice(0, start) + inserted + input.value.slice(end),
          caret: start + inserted.length,
        };
        input.value = edit.value;
        input.focus();
        input.setSelectionRange(edit.caret, edit.caret);
        captureInput();
        submit(true);
      });
    });
    const form = q('#typed-form')!,
      input = q('#transcription-answer')!;
    if (form && !boundTyping.has(form)) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        submit(false);
      });
      boundTyping.add(form);
    }
    if (input && !boundTyping.has(input)) {
      input.addEventListener('input', () => {
        captureInput();
        message = '';
        app.dataset.outcome = presentation();
        q('.game-layout')!.dataset.outcome = presentation();
        q('#input-status')!.textContent = '';
        q('#transcription-answer')?.removeAttribute('aria-invalid');
        if (!input.composing) submit(true);
      });
      input.addEventListener('compositionstart', () => {
        input.composing = true;
      });
      input.addEventListener('compositionend', () => {
        input.composing = false;
        captureInput();
        submit(true);
      });
      boundTyping.add(input);
    }

    q('#retry-run')?.addEventListener('click', () => {
      if (!towerReady) return;
      const config = { ...run.config };
      dispose();
      onRetry(config);
    });
    q('#ending-home')?.addEventListener('click', () => {
      if (towerReady) {
        dispose();
        onHome();
      }
    });
    function startReview(mode: 'combination' | 'mistakes') {
      if (!towerReady) return;
      const previous = run;
      dispose();
      onPractice(previous, mode);
    }
    q('#ending-practice')?.addEventListener('click', () => startReview('combination'));
    q('#practise-mistakes')?.addEventListener('click', () => startReview('mistakes'));
    q('#ending-replay')?.addEventListener('click', replay);
    q('#replay-word')?.addEventListener('click', (event) => {
      replay();
      if (event.detail > 0) focusGameplay();
    });
    const pauseButton = q('#pause-run');
    if (pauseButton) pauseButton.onclick = pause;
    q('#continue-game')?.addEventListener('click', advance);
    q('#resume-game')?.addEventListener('click', resume);
    q('#end-run')?.addEventListener('click', () => {
      const leave = exitConfirmation?.confirm ?? onHome;
      onDiscard();
      dispose();
      leave();
    });
    q('#finish-practice')?.addEventListener('click', finishPractice);
    q('#finish-paused-practice')?.addEventListener('click', finishPractice);
    q('#reveal-answer')?.addEventListener('click', () => fail('reveal'));
    q('#replace-recording')?.addEventListener('click', replace);
  }
  function updateClock(left: number, total: number) {
    if (!active) return;
    const count = q('#countdown')!,
      initialLimit = !audioReady ? run.timeLimit() : 0;
    if (count)
      count.textContent = timedOut()
        ? '0s'
        : total
          ? Math.ceil(left / 1000) + 's'
          : initialLimit
            ? Math.ceil(initialLimit / 1000) + 's'
            : '∞';
    const scene = q('.world-scene')!,
      fraction = timedOut() ? 1 : total ? Math.min(1, Math.max(0, 1 - left / total)) : 0;
    scene?.style.setProperty('--rail-progress', `${fraction * 100}%`);
    scene?.classList.toggle('is-danger', fraction >= 0.75);
    syncScene();
  }
  function enableAnswers() {
    qa('[data-tone]').forEach((button) => (button.disabled = !choosingTone()));
    for (const selector of ['#check-answer', '#reveal-answer'] as const) {
      const button = q(selector)!;
      if (button) button.disabled = !answering();
    }
  }
  async function playPrompt() {
    if (!active || paused || doc?.hidden || expirePrompt()) return;
    const own = ++audioGeneration,
      current = generation,
      first = !audioReady;
    if (first) phase = 'listening';
    promptPlaybackStarted = true;
    const status = q('#audio-status')!;
    if (status) status.textContent = 'Listening…';
    enableAnswers();
    try {
      await player.play(run.word.audio);
      if (!active || own !== audioGeneration || current !== generation || paused || expirePrompt())
        return;
      const wasFailed = audioFailed;
      audioReady = true;
      audioFailed = false;
      if (wasFailed) message = '';
      if (first) {
        entryVisual = false;
        phase = 'answering';
        clock.start(run.timeLimit());
        if (clock.deadline !== null) checkpoint();
      }
      if (wasFailed) render({ focus: false });
      app.dataset.outcome = presentation();
      q('.game-layout')!.dataset.outcome = presentation();
      const error = q('#audio-error')!;
      if (error) error.textContent = '';
      if (status)
        status.textContent = run.heartAhead
          ? 'Type your answer. Clear this span to restore a heart.'
          : isTide()
            ? 'Type your answer.'
            : 'Choose the tone you heard.';
      const scene = q('.world-scene')!;
      if (scene) scene.dataset.phase = phase;
      enableAnswers();
      syncScene();
      if (isTide()) submit(true);
    } catch (error) {
      if (!active || own !== audioGeneration || current !== generation || paused || expirePrompt())
        return;
      captureInput();
      audioFailed = true;
      message = timedPrompt()
        ? 'Sound is unavailable. Replay to retry while the clock is running.'
        : 'Sound is unavailable. Replay to retry, or replace this word without penalty.';
      render({ focus: false });
    }
  }
  function replay() {
    if (!active || paused || doc?.hidden || expirePrompt()) return;
    if (entryVisual) {
      cancelAuto();
      entryVisual = false;
      render({ focus: false });
    }
    if (['listening', 'answering'].includes(phase)) {
      playPrompt();
      return;
    }
    const own = ++audioGeneration;
    player.play(run.word.audio).catch(() => {
      if (own === audioGeneration && active) {
        const error = q('#audio-error')!;
        if (error) error.textContent = 'This recording could not play. You can still continue.';
      }
    });
  }
  function playOpening() {
    cancelAuto();
    const own = generation;
    // The entrance takes 1.8s. Leave a short beat before the first recording.
    auto = later(() => {
      auto = null;
      if (!active || paused || own !== generation) return;
      entryVisual = false;
      render({ focus: false });
      playPrompt();
    }, 2000);
  }
  function beginPrompt() {
    cancelAuto();
    clock.clear();
    stopPlayback();
    audioReady = false;
    audioFailed = false;
    promptPlaybackStarted = false;
    inputValue = '';
    message = '';
    towerReady = true;
    outcome = null;
    phase = 'listening';
    answeredPosition = run.opened + 1;
    checkpoint();
    render();
    player.preload?.([run.word.audio]);
    if (paused) return;
    if (doc?.hidden) pause();
    else if (entryVisual) playOpening();
    else playPrompt();
  }
  function choose(value: Tone | undefined) {
    if (expirePrompt() || !choosingTone() || q('.world-scene')?.hasAttribute('data-moving')) return;
    const result = run.answer(value);
    if (result?.kind === 'empty') return;
    settle(result);
  }
  function submit(quiet = false) {
    if (!isTide() || expirePrompt() || !answering() || q('#transcription-answer')?.composing)
      return;
    captureInput();
    const expected = run.expectedParts();
    if (
      quiet &&
      profile.evaluate(
        inputValue,
        expected,
        run.config.variant === 'full',
        run.config.practice ? run.config.spellingFocus : 'full',
      ) !== true
    )
      return;
    const result = run.answer(inputValue);
    if (result?.kind === 'empty') {
      message = 'Type your answer first.';
      const status = q('#input-status')!;
      if (status) status.textContent = message;
      return;
    }
    if (run.config.practice && result?.reason === 'spelling') {
      settle(result);
      return;
    }
    if (!result?.correct) {
      checkpoint();
      message = run.config.practice
        ? 'Not quite — try again.'
        : 'Not quite—try again. No life lost.';
      q('#transcription-answer')?.setAttribute('aria-invalid', 'true');
      const status = q('#input-status')!;
      if (status) status.textContent = message;
      app.dataset.outcome = 'retry';
      q('.game-layout')!.dataset.outcome = 'retry';
      q('#transcription-answer')?.focus({ preventScroll: true });
      return;
    }
    settle(result);
  }
  function settle(result: RunResult) {
    clock.pause();
    cancelAuto();
    stopPlayback();
    message = '';
    outcome = result;
    audioFailed = false;
    phase = result.correct ? (result.landing ? 'landing' : 'correct') : 'review';
    towerReady = !towerStop();
    if (!terminal()) checkpoint();
    unveiling = true;
    render();
    unveiling = false;
    if (terminal()) onFinish(run);
    if (towerStop()) unlockTowerStop();
    else if (result.correct && phase === 'correct') scheduleAdvance();
  }
  function scheduleAdvance() {
    const own = generation;
    cancelAuto();
    auto = later(
      () => {
        auto = null;
        if (active && !paused && own === generation) advance();
      },
      isTide() && !(outcome?.kind === 'correct' && outcome.heartDrop) ? 900 : 1700,
    );
  }
  function fail(reason: FailureReason) {
    if (reason === 'timeout') {
      if (!active || !timedPrompt() || run.promptState !== 'ready') return;
      if (reloadPause) {
        reloadPause = false;
        paused = false;
      }
    } else if (expirePrompt() || !answering()) return;
    captureInput();
    clock.pause();
    stopPlayback();
    cancelAuto();
    outcome = run.fail(reason);
    audioFailed = false;
    if (isTide()) run.lastAnswer = inputValue;
    message = '';
    phase = 'review';
    towerReady = !towerStop();
    if (!terminal()) checkpoint();
    unveiling = true;
    render();
    unveiling = false;
    if (terminal()) onFinish(run);
    if (towerStop()) unlockTowerStop();
  }
  function advance() {
    if (
      !active ||
      paused ||
      terminal() ||
      !['review', 'correct', 'landing'].includes(phase) ||
      (towerStop() && !towerReady)
    )
      return;
    cancelAuto();
    if (run.status !== 'playing') {
      finish();
      return;
    }
    try {
      run.next();
      beginPrompt();
    } catch (error) {
      interrupt(error);
    }
  }
  function replace() {
    if (!active || paused || expirePrompt() || !audioFailed || timedPrompt()) return;
    stop({ keepScene: true });
    try {
      if (run.replace()) beginPrompt();
      else if (run.config.practice) finishPractice();
    } catch (error) {
      interrupt(error);
    }
  }
  function interrupt(error: unknown) {
    clock.pause();
    cancelAuto();
    stopPlayback();
    phase = 'interrupted';
    app.innerHTML = /* HTML */ `<section class="game-panel">
      <p class="eyebrow">Recording unavailable</p>
      <h1 tabindex="-1">We couldn’t find the next recording.</h1>
      <p>${escape(errorMessage(error))}</p>
      <p>Your score has not changed.</p>
      <button class="primary" id="interrupted-home" type="button">Return home</button
      >${run.config.practice ? '<button class="secondary" id="interrupted-finish" type="button">Finish practice</button>' : ''}
    </section>`;
    q('#interrupted-home')?.addEventListener('click', () => {
      dispose();
      onHome();
    });
    q('#interrupted-finish')?.addEventListener('click', finishPractice);
    q('h1')?.focus();
  }
  function finishPractice() {
    if (!active || !run.config.practice) return;
    run.finish();
    finish();
  }
  function finish() {
    if (!active) return;
    const completed = run;
    stop();
    active = false;
    phase = 'finished';
    paused = false;
    detach();
    onFinish(completed);
  }
  function pause() {
    if (!active || paused) return;
    expirePrompt();
    captureInput();
    paused = true;
    cancelAuto();
    stopPlayback();
    render();
  }
  function confirmExit(confirmation: ExitConfirmation) {
    if (!active) return;
    exitConfirmation = confirmation;
    if (paused) render();
    else pause();
  }
  function resume() {
    if (!active || !paused || doc?.hidden) return;
    expirePrompt();
    const replayRestoredPrompt = reloadPause;
    reloadPause = false;
    paused = false;
    exitConfirmation = null;
    render({ focus: false });
    if (['listening', 'answering'].includes(phase)) {
      if (entryVisual) playOpening();
      else if (!audioReady || replayRestoredPrompt) playPrompt();
      enableAnswers();
    } else if (towerStop() && !towerReady) unlockTowerStop();
    else if (phase === 'correct' && !towerStop()) scheduleAdvance();
    focusGameplay();
  }
  function keydown(event: KeyboardEvent) {
    if (!active || event.defaultPrevented || doc.hidden || event.isComposing) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const input = q('#transcription-answer');
    if (target === input && input?.composing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // A held activation key can outlive the button or view that first received it.
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      return;
    }
    if (event.key === ' ') spaceTarget = target;
    if (phase === 'interrupted') return;

    if (paused && event.key === 'Tab') {
      const controls = qa('.pause-overlay button');
      const index = controls.findIndex((control) => control === doc.activeElement);
      const next = event.shiftKey
        ? index <= 0
          ? controls.length - 1
          : index - 1
        : (index + 1) % controls.length;
      event.preventDefault();
      controls[next]?.focus();
      return;
    }
    if (event.repeat) return;
    if (event.key === 'Escape' && (paused || manualPause())) {
      event.preventDefault();
      paused ? resume() : pause();
      return;
    }
    if (
      paused ||
      (target && target !== doc.body && target !== doc.documentElement && !app.contains(target))
    )
      return;
    if (target?.closest('button, a[href], summary, [role="button"], [role="link"]')) return;
    const typing = target?.closest('input, textarea, select, [contenteditable]');
    if (typing && typing !== input) return;

    if (
      event.key === ' ' ||
      (event.key.toLowerCase() === 'r' && (!isTide() || !profile.allowWordSpaces))
    ) {
      event.preventDefault();
      replay();
    } else if (!typing && event.key === 'Enter' && q('#continue-game')) {
      event.preventDefault();
      advance();
    } else if (!typing && choosingTone()) {
      const keyed = /^[1-9]$/.test(event.key) ? profile.tones[Number(event.key) - 1] : undefined;
      const index = arrowChoiceIndex(run.choices.length, event.key);
      if (keyed !== undefined || index !== null) {
        event.preventDefault();
        choose(keyed ?? (index === null ? undefined : run.choices[index]));
      }
    }
  }
  function keyup(event: KeyboardEvent) {
    if (event.key !== ' ') return;
    if (event.target !== spaceTarget) event.preventDefault();
    spaceTarget = null;
  }
  function dispose() {
    stop();
    active = false;
    paused = false;
    reloadPause = false;
    exitConfirmation = null;
    spaceTarget = null;
    if (siteHeader) siteHeader.inert = false;
    phase = 'idle';
    detach();
  }
  return {
    start(config: RunInput) {
      dispose();
      run = createRun(config, words, { profile, heartRandom: environment.heartRandom });
      entryVisual = run.config.challenge === 'tone' && !run.config.practice;
      active = true;
      attach();
      beginPrompt();
      return run;
    },
    restore(saved: RunCheckpoint, { paused: pauseOnReload = false } = {}) {
      dispose();
      run = createRun(saved.run.config, words, {
        profile,
        heartRandom: environment.heartRandom,
        snapshot: saved.run,
      });
      const limit = run.timeLimit();
      if (
        saved.deadline !== null &&
        (!limit || run.promptState !== 'ready' || saved.deadline > now() + limit)
      )
        throw Error('The saved prompt has an invalid deadline.');

      active = true;
      entryVisual = false;
      audioFailed = false;
      audioReady = saved.deadline !== null;
      promptPlaybackStarted = audioReady;
      attach();
      if (run.promptState === 'ready' && saved.deadline === null) {
        paused = reloadPause = pauseOnReload;
        beginPrompt();
        return run;
      }

      inputValue = isTide() && typeof run.lastAnswer === 'string' ? run.lastAnswer : '';
      message = '';
      outcome = run.lastResult;
      answeredPosition = run.opened + (run.promptState === 'answered' ? 0 : 1);
      towerReady = true;
      phase =
        run.promptState === 'ready'
          ? 'answering'
          : run.promptState === 'failed'
            ? 'review'
            : outcome?.landing
              ? 'landing'
              : 'correct';
      paused = reloadPause =
        pauseOnReload && (phase === 'answering' || (phase === 'correct' && !towerStop()));
      checkpoint(saved.deadline);
      if (saved.deadline !== null) {
        clock.start(limit, saved.deadline);
        if (run.promptState === 'failed') return run;
      }
      render();
      if (doc.hidden) pause();
      else if (!paused && phase === 'correct' && !towerStop()) scheduleAdvance();
      return run;
    },
    pause,
    confirmExit,
    focusGameplay,
    resume,
    dispose,
    setScript(nextScript: string) {
      if (nextScript === script || !profile.scripts.includes(nextScript)) return;
      script = nextScript;
      const update = (word: ExerciseRow) => {
        word.text = word.forms?.[script] ?? word.forms?.default ?? word.text;
        for (const syllable of word.syllables)
          syllable.text = syllable.forms?.[script] ?? syllable.forms?.default ?? syllable.text;
      };
      words.forEach(update);
      if (!active) return;
      update(run.word);
      // Patch the written forms in place so door and scene animations keep their current frame.
      const language = textLanguage(profile, script);
      qa('.word-prompt .prompt-character').forEach((character, i) => {
        character.textContent = run.word.syllables[i].text ?? '';
        character.lang = language;
      });
      const label = q('#typed-form > label');
      if (label) label.textContent = answerLabel();
      q('.recording-report')?.setAttribute(
        'href',
        recordingIssueUrl(run.word, profile, run.config),
      );
      const ending = q('.ending-word-text');
      if (ending) ending.textContent = endingWord(run);
    },
    get active() {
      return active;
    },
    get state() {
      return run;
    },
    get phase() {
      return phase;
    },
  };
}

// Four doors form a compass; three doors share the middle vertical key.
export function arrowChoiceIndex(count: number, key: string) {
  const index = doorArrowKeys[count]?.findIndex((keys) => keys.includes(key)) ?? -1;
  return index === -1 ? null : index;
}
