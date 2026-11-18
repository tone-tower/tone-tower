import { toneLabel } from './ui/tone-presentation.ts';
import { query, queryAll, required, escape, errorMessage } from './ui/dom.ts';
import type {
  LanguageProfile,
  Catalog,
  ExerciseRow,
  Challenge,
  ExerciseConfig,
  RunInput,
  Run,
} from './types.ts';
import { siteRoot, siteURL, localizeAssets } from './site-root.ts';
import { recordingIssueUrl } from './ui/recording-report.ts';
import { languages } from './languages/profiles.ts';
import { requireProfile } from './languages/profile.ts';
import { decodeTonePair } from './persistence/tone-pairs.ts';
import { site, languagePages, pageFromLocation } from './site.ts';
import { practiceSetupMarkup } from './ui/practice-setup.ts';
import { createCreditsDialog } from './ui/credits-dialog.ts';
import { catalogRows, referenceRows, validateCatalog } from './content/catalog.ts';
import { Player } from './audio/audio.ts';
import { challenges, defaultPractice, TONE_VARIANTS } from './game/game-core.ts';
import {
  loadProgress,
  saveProgress,
  recordRun,
  resetProgress,
  challengeRecords,
} from './persistence/progress.ts';
import { createGameController } from './game/game-controller.ts';
import { districts } from './world/worlds.js';
import { animateWorld } from './world/world-runtime.js';
import { destinations } from './world/pixel-world.js';
import { soundPageMarkup, aboutPageMarkup, compactGuideMarkup } from './ui/info-pages.js';
import { bindMapNavigation } from './ui/map-navigation.js';
import { bindLanguageSwitcher } from './ui/site-controls.ts';
import { textLanguage } from './languages/text-language.ts';
import { homeRewards, homeDifficulties, rewardNames, friendDialogue } from './ui/home-rewards.ts';

const profile = requireProfile(languages[document.documentElement.dataset.language ?? '']);
const pages = languagePages(profile);
const appBase = siteRoot();

const app = required(document, '#app');
const dialog = required(document, '#dialog');
const dialogBody = required(document, '#dialog-body');
const guideSource = query(document, '#guide-catalog');
const guideCatalog = guideSource
  ? validateCatalog(JSON.parse(guideSource.textContent), profile)
  : null;
const recordingCount = Number(guideSource?.dataset.recordingCount ?? 0);
const player = new Player();
const titleCase = (value: string) => value[0].toUpperCase() + value.slice(1);
const variantName = (world: Challenge, variant: string) =>
  world === 'tone' ? titleCase(variant) : variant === 'full' ? 'With tones' : 'Without tones';
const difficultyName = (d: string) => titleCase(d || 'normal');
const heartPreview = (count: number) =>
  '<span class="difficulty-hearts" role="img" aria-label="' +
  count +
  ' ' +
  (count === 1 ? 'life' : 'lives') +
  '">' +
  Array.from(
    { length: count },
    () =>
      '<svg viewBox="0 0 20 22" aria-hidden="true"><path d="M1 5L5 1h4l1 3 1-3h4l4 4v7L10 21 1 12Z"/></svg>',
  ).join('') +
  '</span>';

let worldAnimation: ReturnType<typeof animateWorld> | null = null,
  mapNavigationCleanup: (() => void) | null = null,
  mapDestination = 'tone',
  mapActor = { ...destinations.tone };
const worldInfo = {
  tone: {
    title: 'Tone Tower',
    action: 'Begin the climb',
    unit: 'floors',
    verb: 'climbed',
    eyebrow: 'Tone recognition',
    description:
      'Listen to the highlighted syllable and choose its tone. Replay as often as you like.',
    instruction: 'Listen to the highlighted syllable. Choose the tone you hear.',
    end: 'The summit is yours.',
  },
  tide: {
    title: 'Skyrail',
    action: 'Board Skyrail',
    unit: 'spans',
    verb: 'built',
    eyebrow: profile.romanization + ' spelling',
    description:
      'Listen, then type the sounds in ' + profile.romanization + ' to build the next bridge. ',
    instruction:
      'Listen, then type the ' + profile.romanization + ' before the railcar reaches the gap.',
    end: 'Next stop: the horizon.',
  },
};
let progress = loadProgress(profile),
  catalog: Catalog | null = null,
  libraryRequest: Promise<ExerciseRow[]> | null = null,
  data: ExerciseRow[] = [],
  anchors: ExerciseRow[] = [],
  controller: ReturnType<typeof createGameController> | null = null,
  dialogOpener: HTMLElement | null = null,
  screen = 'home';
const availability = () => (catalog ?? guideCatalog)?.availability;
const libraryUnavailable = () => availability()?.ready === false;
function loadLibrary(): Promise<ExerciseRow[]> {
  if (catalog) return Promise.resolve(data);
  return (libraryRequest ??= (async () => {
    const response = await fetch(siteURL('catalogs/' + profile.id + '.json'), {
      cache: 'no-cache',
    });
    if (!response.ok) throw Error('The recording library could not load.');
    const next = validateCatalog(await response.json(), profile);
    const rows = catalogRows(next, profile, progress.settings.script);
    const references = referenceRows(next, rows);
    if (next.availability?.ready !== false && references.length !== profile.tones.length)
      throw Error('The tone references are incomplete.');
    catalog = next;
    data = rows;
    anchors = references;
    return rows;
  })().finally(() => {
    libraryRequest = null;
  }));
}
function applyScript(script: string) {
  if (catalog) {
    data = catalogRows(catalog, profile, script);
    anchors = referenceRows(catalog, data);
  }
  controller?.setScript(script);
}
const persist = () => saveProgress(profile, progress);
const rewardMessages = new WeakMap<Run, string>();
let homecoming: string[] = [];
function victoryMessage(run: Run): string {
  if (run.config.practice || run.status !== 'won') return '';
  const cached = rewardMessages.get(run);
  if (cached !== undefined) return cached;
  const difficulty = homeDifficulties.find(
    (d) => d === (run.world === 'tone' ? run.config.variant : run.config.difficulty),
  );
  const message =
    difficulty && !homeRewards(progress)[run.world][difficulty]
      ? rewardNames[run.world][difficulty] + ' unlocked. Something new is waiting at home…'
      : '';
  rewardMessages.set(run, message);
  return message;
}
function best(world: Challenge) {
  return Math.max(0, ...challengeRecords(progress, world).map((r) => r.best || 0));
}
function resetView(view: string) {
  mapNavigationCleanup?.();
  mapNavigationCleanup = null;
  worldAnimation?.dispose();
  worldAnimation = null;
  controller?.dispose();
  player.stop();
  screen = view;
  app.dataset.view = view;
  delete app.dataset.stage;
  delete app.dataset.world;
  delete app.dataset.practice;
  delete app.dataset.outcome;
  document.body.classList.remove('keyboard-open');
  document.body.dataset.screen = view;
  required(document, '#pause-game').hidden = true;
  queryAll(document, '[data-nav-page]').forEach((link) => {
    if (link.dataset.navPage === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  setPageLocation(['sounds', 'about', 'home'].includes(view) ? view : 'home', true);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function focusTitle() {
  localizeAssets(app, appBase);
  query(app, 'h1')?.focus({ preventScroll: true });
}
function screenError(message: string) {
  const box = query(app, '#setup-error');
  if (box) {
    box.textContent = message;
    box.focus();
  } else {
    openDialog(
      '<h2 id="dialog-title">Couldn’t start this session</h2><p>' + escape(message) + '</p>',
    );
  }
}

let selectedWorld = profile.challenges[0];
function home(world?: Challenge, initialPractice = false) {
  let practiceMode = initialPractice;
  const practiceConfigs = Object.fromEntries(
    (['tone', 'tide'] as const).map((challenge): [Challenge, ExerciseConfig] => {
      const saved = progress.settings.practice[challenge];
      return [
        challenge,
        {
          ...defaultPractice(challenge, profile),
          ...saved,
          challenge,
          format: 'drill',
          start: 1,
          length: 20,
          spellingFocus: saved.spellingFocus || 'full',
          content: challenge === 'tide' ? 'mixed' : profile.practiceToneContent,
          target:
            challenge === 'tide'
              ? saved.singleSyllableOnly === true
                ? 'highlighted'
                : 'whole'
              : 'highlighted',
          lives: 'unlimited',
          timer: 'off',
          focusIds: [],
        },
      ];
    }),
  );
  if (world === 'tone' || world === 'tide') {
    selectedWorld = world;
    mapDestination = world === 'tide' ? 'rail' : 'tone';
  } else world = selectedWorld;
  resetView('home');
  if (initialPractice) setPageLocation('practice', true);
  progress = loadProgress(profile);
  const rewards = homeRewards(progress);
  const hasGameChoice = profile.challenges.length > 1;
  app.innerHTML = /* HTML */ ` <aside class="content-preview" role="status" hidden>
      <strong>${escape(profile.label)} is taking shape.</strong>
      <p>
        We’re gathering enough recordings to open the games. Explore the
        ${escape(profile.romanization)} guide while the collection grows.
      </p>
    </aside>
    <section class="home-intro" aria-label="Introduction">
      <p class="home-intro-title">
        Practice
        ${profile.challenges.includes('tide') ? profile.romanization : profile.label + ' tones'}
      </p>
      <a class="home-guide-link" href="${pages.sounds.path}" data-page="sounds"
        >New to
        ${profile.challenges.includes('tide') ? profile.romanization : profile.label + ' tones'}?
        →</a
      >
    </section>
    ${
      hasGameChoice
        ? /* HTML */ `<section class="mode-picker" aria-labelledby="mode-heading">
            <div class="mode-picker-heading">
              <h1 id="mode-heading" tabindex="-1">Choose a game</h1>
              <p><kbd>←</kbd> <kbd>→</kbd> choose · <kbd>Enter</kbd> start</p>
            </div>
            <div class="mode-cards">
              <button
                type="button"
                class="mode-card"
                data-mode-card
                data-destination="tone"
                aria-describedby="tone-mode-description"
              >
                <strong>Tone Tower</strong
                ><span id="tone-mode-description">Choose the tone you hear.</span>
              </button>
              <button
                type="button"
                class="mode-card"
                data-mode-card
                data-destination="rail"
                aria-describedby="rail-mode-description"
              >
                <strong>Skyrail</strong
                ><span id="rail-mode-description">Type the ${profile.romanization} you hear.</span>
              </button>
            </div>
          </section>`
        : ''
    }
    <section class="play-frame home-world" aria-label="Choose an adventure">
      <div class="home-map-layout">
        <div class="stage">
          <canvas
            class="map-canvas"
            width="480"
            height="400"
            aria-label="${hasGameChoice ? 'Tone Tower and Skyrail above the clouds' : 'Tone Tower above the clouds'}"
          ></canvas>
          <div class="home-reward-interactions" aria-label="Friends at home">
            ${(
              [
                ['tone', 'normal', 'Pet the rooftop cat'],
                ['tone', 'extreme', 'Wake the spire dragon'],
                ['tide', 'normal', 'Pet the station cat'],
                ['tide', 'hard', 'Talk to the moon heron'],
                ['tide', 'extreme', 'Wake the golden dragon'],
              ] as const
            )
              .filter(
                ([world, difficulty]) =>
                  profile.challenges.includes(world) && rewards[world][difficulty],
              )
              .map(
                ([world, difficulty, label]) =>
                  `<button type="button" class="home-friend home-friend--${world}-${difficulty}" data-home-friend="${world}-${difficulty}" aria-label="${label}" title="${label}"></button>`,
              )
              .join('')}
          </div>
        </div>
        <div class="dock">
          <div>
            ${hasGameChoice ? '<h2 id="destination-title"></h2>' : '<h1 id="destination-title" tabindex="-1"></h1>'}
            <div class="setup-tabs" role="group" aria-label="Game or practice">
              <button type="button" id="setup-game" aria-pressed="true">Play game</button>
              <button type="button" id="setup-practice" aria-pressed="false">Practice</button>
            </div>
            <div class="map-entry">
              <div id="setup-error" class="error" role="alert" tabindex="-1"></div>
              <button id="start-adventure" class="primary" type="button">Enter tower →</button>
              <div id="setup-status" class="small" role="status"></div>
            </div>
            <div id="map-variants" class="title-variants"></div>
          </div>
        </div>
      </div>
      <p
        id="home-reward-status"
        class="home-reward-status"
        role="status"
        ${homecoming.length ? '' : 'hidden'}
      ></p>
    </section>`;
  required(app, '#home-reward-status').textContent = homecoming
    .map((message) => message.replace(' Something new is waiting at home…', ' Welcome home.'))
    .join(' ');
  homecoming = [];
  if (!profile.challenges.includes(mapDestination === 'rail' ? 'tide' : 'tone'))
    mapDestination = profile.challenges[0] === 'tide' ? 'rail' : 'tone';
  bindInfoActions(app);
  const canvas = required(app, '.map-canvas');
  worldAnimation = animateWorld(canvas, {
    scene: 'hub',
    height: 400,
    progress: best('tone'),
    rewards,
    count: 2,
    actor: mapActor,
    onHomeFriends: (positions: Record<string, { x: number; y: number; direction?: number }>) => {
      queryAll(app, '[data-home-friend]').forEach((button) => {
        const key = button.dataset.homeFriend ?? '';
        const position = positions[key];
        if (!position) return;
        const cat = key.endsWith('-normal');
        button.style.left =
          ((position.x + (cat ? 9 * (position.direction ?? 1) : 0)) / 480) * 100 + '%';
        button.style.top = ((position.y + 56 - (cat ? 9 : 7)) / 400) * 100 + '%';
      });
    },
  });
  const dialogueTurns = new Map<string, number>();
  const friends = required(app, '.home-reward-interactions');
  const pauseFriends = () =>
    worldAnimation?.update({
      friendsPaused: friends.matches(':hover') || friends.contains(document.activeElement),
    });
  friends.addEventListener('pointerenter', pauseFriends);
  friends.addEventListener('pointerleave', pauseFriends);
  friends.addEventListener('focusin', pauseFriends);
  friends.addEventListener('focusout', () => queueMicrotask(pauseFriends));
  queryAll(app, '[data-home-friend]').forEach((button) => {
    button.onclick = () => {
      const friend = button.dataset.homeFriend ?? '';
      worldAnimation?.update({ rewardInteraction: friend });
      const status = required(app, '#home-reward-status');
      status.hidden = false;
      const lines = friendDialogue[friend];
      const turn = dialogueTurns.get(friend) ?? 0;
      status.textContent = lines[turn % lines.length];
      dialogueTurns.set(friend, turn + 1);
    };
  });
  function select(value: string) {
    if (!profile.challenges.includes(value === 'rail' ? 'tide' : 'tone')) return;
    mapDestination = value;
    const rail = value === 'rail',
      challenge = rail ? 'tide' : 'tone',
      info = worldInfo[challenge],
      key = rail ? 'tideVariant' : 'toneVariant',
      variant = progress.settings[key];
    const rewardMark = (difficulty: string) => {
      const d = homeDifficulties.find((entry) => entry === difficulty);
      if (!d || !rewards[challenge][d]) return '';
      return (
        '<span class="earned-reward" role="img" title="' +
        rewardNames[challenge][d] +
        ' earned" aria-label="' +
        rewardNames[challenge][d] +
        ' earned">✦</span>'
      );
    };
    queryAll(app, '[data-destination]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.destination === value)),
    );
    required(app, '#destination-title').textContent = info.title;
    const variants = required(app, '#map-variants');
    variants.innerHTML =
      (rail
        ? '<div class="rail-difficulty-options" role="group" aria-label="Skyrail difficulty">' +
          Object.entries({ easy: 5, normal: 4, hard: 3, extreme: 1 })
            .map(
              ([d, l]) =>
                '<button type="button" data-difficulty="' +
                d +
                '" aria-pressed="' +
                (d === progress.settings.tideDifficulty) +
                '">' +
                difficultyName(d) +
                rewardMark(d) +
                heartPreview(l) +
                '</button>',
            )
            .join('') +
          '</div>'
        : '') +
      '<div class="answer-variants" role="group" aria-label="' +
      (rail ? 'Answer style' : 'Tower difficulty') +
      '">' +
      challenges[challenge].variants
        .map(
          (v) =>
            '<button type="button" data-variant="' +
            v +
            '" aria-pressed="' +
            (v === variant) +
            '">' +
            variantName(challenge, v) +
            (rail ? '' : rewardMark(v)) +
            (rail ? '' : heartPreview(TONE_VARIANTS[v])) +
            '</button>',
        )
        .join('') +
      '</div>' +
      (rail
        ? '<div class="skyrail-example"><span lang="' +
          escape(textLanguage(profile, progress.settings.script)) +
          '">' +
          escape(profile.example.text) +
          '</span><span> → ' +
          (variant === 'full'
            ? profile.format(profile.example.parts.join(' '))
            : profile.example.parts.map((part) => profile.withoutTones(part)).join(' ')) +
          '</span></div>'
        : '');
    queryAll(variants, '[data-variant]').forEach(
      (b) =>
        (b.onclick = () => {
          progress.settings[key] = b.dataset.variant ?? 'normal';
          persist();
          select(value);
          query(app, '[data-variant="' + b.dataset.variant + '"]')!.focus({ preventScroll: true });
        }),
    );
    queryAll(variants, '[data-difficulty]').forEach(
      (b) =>
        (b.onclick = () => {
          progress.settings.tideDifficulty = b.dataset.difficulty ?? 'normal';
          persist();
          select(value);
          query(app, '[data-difficulty="' + b.dataset.difficulty + '"]')!.focus({
            preventScroll: true,
          });
        }),
    );
    const config = practiceConfigs[challenge];
    setPageLocation(practiceMode ? 'practice' : 'home');
    required(app, '#setup-game').setAttribute('aria-pressed', String(!practiceMode));
    const practiceTab = required(app, '#setup-practice');
    practiceTab.textContent = 'Practice';
    practiceTab.setAttribute('aria-pressed', String(practiceMode));
    required(app, '#setup-game').onclick = () => {
      practiceMode = false;
      select(value);
    };
    practiceTab.onclick = () => {
      practiceMode = true;
      select(value);
    };
    if (practiceMode) {
      variants.innerHTML = practiceSetupMarkup(config, profile, progress.settings.script);
      queryAll(variants, '[data-practice-tone]').forEach(
        (button) =>
          (button.onclick = () => {
            const tone = profile.tones.find((t) => String(t) === button.dataset.practiceTone);
            if (tone === undefined) return;
            config.tones = config.tones.includes(tone)
              ? config.tones.filter((t) => t !== tone)
              : [...config.tones, tone].sort(
                  (a, b) => profile.tones.indexOf(a) - profile.tones.indexOf(b),
                );
            if (config.choices > config.tones.length)
              config.choices =
                profile.choiceCounts.filter((n) => n <= config.tones.length).at(-1) ?? 2;
            progress.settings.practice[challenge] = { ...config };
            persist();
            select(value);
            query(app, '[data-practice-tone="' + tone + '"]')!.focus({ preventScroll: true });
          }),
      );
      queryAll(variants, '[data-practice-setting]').forEach(
        (input) =>
          (input.onchange = () => {
            const key = input.dataset.practiceSetting;
            if (key === 'variant' && input instanceof HTMLInputElement)
              config.variant = input.checked ? 'full' : 'spelling';
            else if (key === 'target' && input instanceof HTMLInputElement) {
              config.target = input.checked ? 'highlighted' : 'whole';
              config.singleSyllableOnly = input.checked;
            } else if (key === 'length')
              config.length = input.value === 'endless' ? 'endless' : Number(input.value);
            else if (key === 'choices') config.choices = Number(input.value);
            else if (
              key === 'spellingFocus' &&
              ['initials', 'finals', 'full'].includes(input.value)
            )
              config.spellingFocus = input.value as ExerciseConfig['spellingFocus'];
            progress.settings.practice[challenge] = { ...config };
            persist();
            select(value);
            query(app, '[data-practice-setting="' + key + '"]')!.focus({ preventScroll: true });
          }),
      );
    }
    const enter = required(app, '#start-adventure');
    enter.textContent = practiceMode
      ? rail
        ? 'Start spelling practice →'
        : 'Start tone practice →'
      : rail
        ? 'Board Skyrail →'
        : 'Enter tower →';
    const status = required(app, '#setup-status');
    const error = required(app, '#setup-error');
    const updateAvailability = () => {
      enter.disabled = libraryUnavailable();
      required(app, '.content-preview').hidden = !enter.disabled;
    };
    updateAvailability();
    status.textContent = '';
    error.textContent = '';
    const launch = () =>
      practiceMode
        ? startPractice(challenge, config.variant, config)
        : begin({
            challenge,
            variant: progress.settings[key],
            difficulty: progress.settings.tideDifficulty,
            practice: false,
          });
    const start = async () => {
      if (catalog) {
        launch();
        return;
      }
      const current = () => enter.isConnected && enter.onclick === start;
      enter.disabled = true;
      error.textContent = '';
      status.textContent = 'Loading the recording library…';
      try {
        await loadLibrary();
      } catch {
        if (current()) screenError('Couldn’t load the recording library. Try again.');
        return;
      } finally {
        if (current()) {
          status.textContent = '';
          updateAvailability();
        }
      }
      if (current() && !libraryUnavailable() && !dialog.open) launch();
    };
    enter.onclick = start;
    selectedWorld = challenge;
    // Walking is decorative: settings and Start are ready as soon as a mode is selected.
    worldAnimation?.update({
      destination: value,
      onTravel: (moving: boolean) => {
        if (!moving) mapActor = { ...destinations[value === 'rail' ? 'rail' : 'tone'] };
      },
    });
  }
  queryAll(app, '[data-destination]').forEach(
    (b) =>
      (b.onclick = () => {
        select(b.dataset.destination ?? 'tone');
      }),
  );
  select(mapDestination);
  mapNavigationCleanup = bindMapNavigation({
    document,
    container: app,
    getDestination: () => mapDestination,
    destinations: profile.challenges.map((challenge) => (challenge === 'tide' ? 'rail' : 'tone')),
    onSelect: select,
    onStart: () => query(app, '#start-adventure')?.click(),
    isBlocked: () => dialog.open,
  });
}
function prepare(world: Challenge) {
  home(world);
  focusTitle();
}

function startPractice(challenge: Challenge = 'tone', variant = 'spelling', seed: RunInput = {}) {
  const config: ExerciseConfig = {
    ...defaultPractice(challenge, profile),
    ...seed,
    challenge,
    variant: challenge === 'tone' ? 'normal' : variant,
    practice: true,
    format: 'drill',
    length: seed.length ?? 20,
    start: 1,
    content: seed.content ?? (challenge === 'tide' ? 'mixed' : profile.practiceToneContent),
    target: challenge === 'tide' ? (seed.target ?? 'whole') : 'highlighted',
    choices: seed.choices ?? 2,
    lives: 'unlimited',
    timer: 'off',
  };
  begin(config);
}
function showWorkshop(seed?: RunInput & { challenge: Challenge; variant: string }) {
  if (seed) {
    startPractice(seed.challenge, seed.variant, seed);
    return;
  }
  home(undefined, true);
  query(app, '#setup-practice')?.focus();
}

function begin(config: RunInput) {
  if (libraryUnavailable()) {
    screenError(
      'There are not enough recordings for this collection yet. Please explore the guide for now.',
    );
    return;
  }
  resetView('game');
  required(document, '#pause-game').hidden = false;
  try {
    controller ??= createGameController({
      profile,
      app,
      player,
      dialog,
      words: data.filter((word) => !word.anchor),
      script: progress.settings.script,
      onFinish: finish,
      victoryMessage,
      onRetry: begin,
      onHome: home,
      onPractice: practiceFromRun,
      onLearn: () => showLearn(),
    });
    controller.start(config);
  } catch (error) {
    prepare(config.challenge ?? 'tone');
    screenError(errorMessage(error));
  }
}
function finish(run: Run) {
  const message = victoryMessage(run);
  if (!run.recorded && message) homecoming.push(message);
  recordRun(progress, run);
  persist();
  if (run.config.practice) {
    controller?.dispose();
    showResults(run);
  }
}
function showResults(run: Run) {
  resetView('results');
  app.dataset.world = run.world;
  const info = worldInfo[run.world],
    variant = run.config.variant;
  const syllables = run.word?.syllables || [];
  app.innerHTML = /* HTML */ `<section class="results-view">
    <div class="eyebrow">Practice results</div>
    <h1 tabindex="-1">Practice complete.</h1>
    <p class="lead">
      ${run.cleared} correct answer${run.cleared === 1 ? '' : 's'}. Review missed recordings or
      start another session.
    </p>
    <div class="result-metrics">
      <div><strong>${run.cleared}</strong><span>Correct answers</span></div>
      <div><strong>${run.mistakes}</strong><span>Missed answers</span></div>
      <div><strong>${run.assisted || 0}</strong><span>Assisted answers</span></div>
    </div>
    ${
      run.lastFailure && syllables.length
        ? /* HTML */ `<div class="last-word feedback-card">
            <span class="eyebrow">One to listen to again</span>
            <div class="result-word">
              ${syllables.map((s) => /* HTML */ `<span>${escape(s.text)}<small>${escape(s.text === profile.format(s.transcription) ? '' : profile.format(s.transcription))}</small></span>`).join('')}
            </div>
            <p>${escape(run.word.gloss)}</p>
            ${run.lastAnswer ? /* HTML */ `<p class="small">${run.world === 'tone' ? 'You chose' : 'You typed'}: ${escape(run.world === 'tone' && (typeof run.lastAnswer === 'string' || typeof run.lastAnswer === 'number') && profile.tones.includes(run.lastAnswer) ? toneLabel(profile, run.lastAnswer) : run.lastAnswer)}</p>` : ''}<button
              id="last-word-audio"
              class="text-button"
              type="button"
            >
              ▶ Hear it again
            </button>
            <p id="result-audio-status" class="small" role="status"></p>
          </div>`
        : ''
    }
    <div class="results-actions">
      <button id="retry" class="primary" type="button">
        Another practice
        <span aria-hidden="true">→</span></button
      ><button id="practise-result" class="secondary" type="button">Practise this</button
      ><button id="result-home" class="text-button" type="button">Back to Home</button>
    </div>
    <button id="copy-summary" class="text-button" type="button">Copy session summary</button>
    <p id="copy-status" class="small" role="status"></p>
    <p class="result-footnote">
      Home decorations are earned in the games. Practice is always yours to explore.
    </p>
  </section>`;
  required(app, '#retry').onclick = () => begin({ ...run.config });
  required(app, '#result-home').onclick = () => home();
  query(app, '#practise-result')?.addEventListener('click', () => practiceFromRun(run));
  query(app, '#last-word-audio')?.addEventListener('click', async () => {
    try {
      await player.play(run.word.audio);
    } catch {
      required(app, '#result-audio-status').textContent =
        'Recording unavailable. Please try again.';
    }
  });
  required(app, '#copy-summary').onclick = async () => {
    const summary = `Tone Tower · ${info.title} · ${variantName(run.world, variant)}${run.world === 'tide' ? ' · ' + difficultyName(run.config.difficulty) : ''} · Practice\n${run.cleared} correct answers · ${run.config.format === 'rehearsal' ? `rehearsal from ${run.config.start}` : run.config.length === 'endless' ? 'open practice' : `${run.config.length}-question practice`} · ${run.mistakes} misses · ${run.assisted || 0} assisted`;
    try {
      await navigator.clipboard.writeText(summary);
      required(app, '#copy-status').textContent = 'Summary copied.';
    } catch {
      required(app, '#copy-status').textContent = summary;
    }
  };
  focusTitle();
}
function practiceFromRun(run: Run) {
  const config = {
    ...defaultPractice(run.world, profile),
    variant: run.config.variant,
    focusIds: [...new Set(run.missedIds || [])],
  };
  // Missed recordings may contain whole words even when practice defaults to single syllables.
  if (config.focusIds.length) config.content = 'mixed';
  if (run.world === 'tone') {
    const key = Object.entries(run.confusions || {}).sort((a, b) => b[1] - a[1])[0]?.[0];
    const pair = key ? decodeTonePair(key) : null;
    if (pair?.length === 2) {
      config.tones = pair;
      config.choices = 2;
    }
  }
  if (run.world === 'tide' && config.focusIds.length) {
    config.target = run.opened >= 40 ? 'whole' : 'highlighted';
  }
  showWorkshop(config);
}

function openDialog(html: string, opener = document.activeElement) {
  if (!dialog.open) {
    dialogOpener = opener instanceof HTMLElement ? opener : null;
    controller?.pause('dialog', opener);
  }
  player.stop();
  dialogBody.innerHTML = html;
  localizeAssets(dialogBody, appBase);
  if (!dialog.open) dialog.showModal();
  query(dialogBody, 'h2')?.setAttribute('tabindex', '-1');
  query(dialogBody, 'h2')?.focus();
}
function bindToneAudio(
  container: HTMLElement,
  recordings: ExerciseRow[],
  references: ExerciseRow[],
) {
  let request = 0;
  queryAll(container, '[data-guide-tone],[data-guide-word]').forEach(
    (button) =>
      (button.onclick = async () => {
        const current = ++request;
        const anchor = button.dataset.guideWord
          ? recordings.find((word) => word.id === button.dataset.guideWord)
          : references.find((word) => String(word.tone) === button.dataset.guideTone);
        const status =
          button.closest('.guide-example-block')?.querySelector('[role="status"]') ||
          required(container, '#guide-status');
        if (!anchor) {
          if (status) status.textContent = 'This recording is unavailable.';
          return;
        }
        queryAll(container, '[data-guide-tone],[data-guide-word]').forEach((other) =>
          other.removeAttribute('data-playing'),
        );
        queryAll(container, '.guide-example-status').forEach((other) => {
          other.textContent = '';
        });
        const toneStatus = query(container, '#guide-status');
        if (toneStatus && toneStatus !== status)
          toneStatus.textContent =
            'Choose a tone to listen. Replay and compare as often as you like.';
        button.dataset.playing = 'true';
        if (status)
          status.textContent = 'Playing ' + profile.format(anchor.transcription ?? '') + '…';
        try {
          await player.play(anchor.audio);
          if (current === request && status?.isConnected)
            status.textContent = button.dataset.guideWord
              ? profile.format(anchor.transcription ?? '') + ' · ' + anchor.text
              : profile.format(anchor.transcription ?? '') +
                ' · ' +
                (profile.toneDefinitions.find((t) => t.value === anchor.tone)?.description ?? '');
        } catch {
          if (current === request && status?.isConnected)
            status.textContent = 'The recording could not play. Select it to try again.';
        } finally {
          if (current === request) button.removeAttribute('data-playing');
        }
      }),
  );
}
function setPageLocation(page: string, replace = false) {
  const destination = new URL(pages[page].path, appBase);
  destination.search = location.search;
  if (location.href !== destination.href)
    history[replace ? 'replaceState' : 'pushState'](null, '', destination.href);
  required(document, '.skip-link').href = new URL(pages[page].path + '#app', appBase).href;
  required(document, '.brand').href = new URL(pages.home.path, appBase).href;
  queryAll(document, '[data-nav-page]').forEach((link) => {
    const target = pages[link.dataset.navPage ?? ''];
    if (target) link.href = new URL(target.path, appBase).href;
    if (link.dataset.navPage === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll<HTMLAnchorElement>('[data-language-link]').forEach((link) => {
    const language = languages[link.dataset.languageLink ?? ''];
    if (language) link.href = new URL(languagePages(language)[page].path, appBase).href;
  });
  const metadata = pages[page];
  document.title = metadata.title;
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ])
    document.querySelector<HTMLMetaElement>(selector)!.content = metadata.description;
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]'])
    document.querySelector<HTMLMetaElement>(selector)!.content = metadata.title;
  const canonical = new URL(metadata.path, site.siteUrl);
  required(document, 'link[rel="canonical"]').href = canonical.href;
  required(document, 'meta[property="og:url"]').content = canonical.href;
}
function bindInfoActions(container: HTMLElement) {
  for (const link of queryAll(container, 'a[href]')) {
    const href = link.getAttribute('href');
    const key = (
      { './': 'home', 'guide/': 'sounds', 'practice/': 'practice', 'about/': 'about' } as Record<
        string,
        string
      >
    )[href ?? ''];
    if (key) link.setAttribute('href', pages[key].path);
  }
  localizeAssets(container, appBase);
  queryAll(container, '[data-page]').forEach(
    (link) =>
      (link.onclick = (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(link.dataset.page ?? 'home');
      }),
  );
  queryAll(container, '[data-start-world]').forEach(
    (button) =>
      (button.onclick = () => {
        setPageLocation('home');
        prepare(button.dataset.startWorld === 'tide' ? 'tide' : 'tone');
      }),
  );
  queryAll(container, '[data-info-action]').forEach(
    (button) =>
      (button.onclick = () => {
        (
          ({
            credits: () => showCredits(button),
            reset: showReset,
            practice: () => {
              setPageLocation('practice');
              showWorkshop();
              focusTitle();
            },
          }) as Record<string, () => void>
        )[button.dataset.infoAction ?? '']?.();
      }),
  );
}
function showInfo(page: string) {
  resetView(page);
  if (page === 'sounds') {
    const guide = guideCatalog ?? catalog;
    const recordings = guide ? catalogRows(guide, profile, progress.settings.script) : [];
    const references = guide ? referenceRows(guide, recordings) : [];
    app.innerHTML = soundPageMarkup(references, profile.toneDefinitions, recordings, profile);
    bindToneAudio(app, recordings, references);
  } else {
    app.innerHTML = aboutPageMarkup({
      recordingCount: catalog ? data.length : recordingCount,
      profile,
      availability: availability(),
    });
  }
  bindInfoActions(app);
}
function showAboutInGame(opener?: HTMLElement) {
  const markup = aboutPageMarkup({
    recordingCount: data.length,
    profile,
    availability: catalog?.availability,
  })
    .replace('<h1 tabindex="-1">', '<h2 id="dialog-title">')
    .replace('</h1>', '</h2>');
  openDialog(markup, opener);
  queryAll(dialogBody, '.back-link,.info-actions,[data-start-world]').forEach((el) => el.remove());
  queryAll(dialogBody, '[data-info-action="practice"]').forEach((el) =>
    el.replaceWith(document.createTextNode(el.textContent)),
  );
  bindInfoActions(dialogBody);
}
function navigate(
  page: string,
  {
    replace = false,
    focus = true,
    opener,
  }: { replace?: boolean; focus?: boolean; opener?: HTMLElement } = {},
) {
  if (!['home', 'sounds', 'about', 'practice'].includes(page)) return;
  if (screen === 'game' && controller?.active && controller.state?.status === 'playing') {
    setPageLocation('home', true);
    if (page === 'sounds') showLearn(opener);
    else if (page === 'about') showAboutInGame(opener);
    else controller.pause();
    return;
  }
  setPageLocation(page, replace);
  if (page === 'sounds' || page === 'about') showInfo(page);
  else if (page === 'practice') showWorkshop();
  else home();
  if (focus) focusTitle();
}
function showLearn(opener?: HTMLElement) {
  controller?.state?.markAssisted?.();
  openDialog(compactGuideMarkup(anchors, profile.toneDefinitions, profile), opener);
  bindToneAudio(dialogBody, data, anchors);
}
const showCredits = createCreditsDialog({ dialogBody, profile, loadRows: loadLibrary, openDialog });
function showReset() {
  openDialog(
    '<h2 id="dialog-title">Reset saved progress?</h2><p>This removes your tower lights, home decorations and preferences for ' +
      escape(profile.label) +
      ' in this browser.</p><div class="reset-actions"><button id="cancel-reset" class="secondary" type="button">Keep my progress</button><button id="confirm-reset" class="danger-button" type="button">Reset everything</button></div>',
  );
  required(dialogBody, '#cancel-reset').focus();
  required(dialogBody, '#cancel-reset').onclick = () => {
    dialog.close();
  };
  required(dialogBody, '#confirm-reset').onclick = () => {
    progress = resetProgress(profile);
    homecoming = [];
    if (scriptDisplay) scriptDisplay.value = progress.settings.script;
    applyScript(progress.settings.script);
    dialog.close();
    home();
  };
}

queryAll(document, '[data-nav-page]').forEach(
  (link) =>
    (link.onclick = (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(link.dataset.navPage ?? 'home', { opener: link });
    }),
);
required(document, '.brand').onclick = (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate('home');
};
bindLanguageSwitcher(document);
document.querySelectorAll<HTMLAnchorElement>('[data-language-link]').forEach((link) => {
  link.onclick = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!controller?.active || controller.state.status !== 'playing') return;
    const language = languages[link.dataset.languageLink ?? ''];
    if (!language) return;
    event.preventDefault();
    const switcher = link.closest('details');
    if (switcher) {
      switcher.open = false;
      switcher.querySelector('summary')?.focus();
    }
    if (language.id === profile.id) return;
    const destination = link.href;
    controller.confirmExit({
      title: 'Switch to ' + language.label + '?',
      message: 'Switching languages ends the current run.',
      action: 'End run & switch language',
      confirm: () => location.assign(destination),
    });
  };
});
required(document, '#pause-game').onclick = () => controller?.pause();
const scriptDisplay = query(document, '#script-display');
if (scriptDisplay) {
  scriptDisplay.value = progress.settings.script;
  scriptDisplay.onchange = () => {
    progress.settings.script = scriptDisplay.value;
    persist();
    applyScript(scriptDisplay.value);
    if (screen !== 'game')
      navigate(pageFromLocation(new URL(location.href), appBase, profile), {
        replace: true,
        focus: false,
      });
  };
}
const credits = required(document, '#credits');
credits.onclick = () => showCredits(credits);
required(document, '#close-dialog').onclick = () => dialog.close();
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  player.stop();
  if (dialogOpener?.isConnected) dialogOpener.focus({ preventScroll: true });
  dialogOpener = null;
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }
});
window.addEventListener('popstate', () => {
  navigate(pageFromLocation(new URL(location.href), appBase, profile), { replace: true });
});

navigate(pageFromLocation(new URL(location.href), appBase, profile), {
  replace: true,
  focus: false,
});

function updateKeyboardViewport() {
  const viewport = window.visualViewport;
  const input = document.activeElement;
  const typing = screen === 'game' && input?.id === 'transcription-answer';
  document.body.classList.toggle(
    'keyboard-open',
    Boolean(
      typing &&
      viewport &&
      viewport.width <= 700 &&
      (Math.max(window.innerHeight, document.documentElement.clientHeight) - viewport.height >
        110 ||
        viewport.height < 540),
    ),
  );
  if (viewport)
    document.documentElement.style.setProperty('--visual-height', viewport.height + 'px');
}
window.visualViewport?.addEventListener('resize', updateKeyboardViewport);
document.addEventListener('focusin', updateKeyboardViewport);
document.addEventListener('focusout', () => setTimeout(updateKeyboardViewport, 0));
