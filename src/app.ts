import { query, queryAll, required, escape, errorMessage } from './ui/dom.ts';
import type {
  LanguageProfile,
  Catalog,
  ExerciseRow,
  Challenge,
  ExerciseConfig,
  RunInput,
  Run,
  RunCheckpoint,
} from './types.ts';
import { siteRoot, siteURL, localizeAssets } from './site-root.ts';
import { languages } from './languages/profiles.ts';
import { requireProfile } from './languages/profile.ts';
import { site, languagePages, pageFromLocation } from './site.ts';
import { practiceSetupMarkup } from './ui/practice-setup.ts';
import { createCreditsDialog } from './ui/credits-dialog.ts';
import { catalogRows, referenceRows, validateCatalog } from './content/catalog.ts';
import { Player } from './audio/audio.ts';
import {
  challenges,
  defaultPractice,
  practiceForRun,
  RAIL_DIFFICULTIES,
  TONE_VARIANTS,
} from './game/game-core.ts';
import {
  loadProgress,
  saveProgress,
  challengeRecords,
  loadRunCheckpoint,
  updateRunCheckpoint,
  completeSavedRun,
} from './persistence/progress.ts';
import { createGameController } from './game/game-controller.ts';
import { districts } from './world/worlds.js';
import { animateWorld } from './world/world-runtime.js';
import { destinations } from './world/pixel-world.js';
import { soundPageMarkup, aboutPageMarkup } from './ui/info-pages.js';
import { bindMapNavigation } from './ui/map-navigation.js';
import { bindHeaderMenu } from './ui/site-controls.ts';
import { textLanguage } from './languages/text-language.ts';
import { homeRewards, homeDifficulties, rewardNames, friendDialogue } from './ui/home-rewards.ts';

const profile = requireProfile(languages[document.documentElement.dataset.language ?? '']);
const pages = languagePages(profile);
const appBase = siteRoot();

// Keep Vite's page-relative icon URLs valid when client-side navigation changes the URL depth.
for (const icon of document.querySelectorAll<HTMLLinkElement>(
  'link[rel="icon"][href], link[rel="apple-touch-icon"][href]',
))
  icon.setAttribute('href', icon.href);

const app = required(document, '#app');
const siteHeader = required(document, '.site-header');
const closeHeaderMenu = bindHeaderMenu(siteHeader);
const dialog = required(document, '#dialog');
const dialogBody = required(document, '#dialog-body');
const guideSource = query(document, '#guide-catalog');
const guideCatalog = guideSource
  ? validateCatalog(JSON.parse(guideSource.textContent), profile)
  : null;
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
let progress = loadProgress(profile),
  catalog: Catalog | null = null,
  libraryRequest: Promise<ExerciseRow[]> | null = null,
  data: ExerciseRow[] = [],
  controller: ReturnType<typeof createGameController> | null = null,
  dialogOpener: HTMLElement | null = null,
  screen = 'home';
let runOwner: { id: string; expectedId: string | null } | null = null;
let runSaveStatus: ReturnType<typeof updateRunCheckpoint> = 'saved';
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
    return rows;
  })().finally(() => {
    libraryRequest = null;
  }));
}
function applyScript(script: string) {
  if (catalog) {
    data = catalogRows(catalog, profile, script);
  }
  controller?.setScript(script);
}
const persist = () => {
  progress = { ...loadProgress(profile), settings: progress.settings };
  saveProgress(profile, progress);
};
const recoveryWarning = () =>
  runSaveStatus === 'unavailable'
    ? 'This browser couldn’t save the run. Recovery may be unavailable.'
    : runSaveStatus === 'stale'
      ? 'The saved run changed in another tab. Progress in this tab can’t be saved.'
      : '';
function setRunSaveStatus(status: typeof runSaveStatus) {
  runSaveStatus = status;
  const warning = query(app, '#recovery-status');
  if (warning) {
    warning.textContent = recoveryWarning();
    warning.hidden = !warning.textContent;
  }
}
function saveCheckpoint(checkpoint: RunCheckpoint) {
  if (!runOwner || runSaveStatus === 'stale') return;
  const { id, expectedId } = runOwner;
  const status = updateRunCheckpoint(profile, expectedId, { id, checkpoint });
  if (status === 'saved') {
    runOwner.expectedId = id;
    setRunHistory(id);
  }
  setRunSaveStatus(status);
}
function discardCheckpoint() {
  if (runOwner && runSaveStatus !== 'stale' && runOwner.expectedId)
    setRunSaveStatus(updateRunCheckpoint(profile, runOwner.expectedId, null));
  runOwner = null;
}
const rewardMessages = new WeakMap<Run, string>();
let homecoming: string[] = [];
function victoryMessage(run: Run): string {
  if (run.config.practice || run.status !== 'won' || runSaveStatus === 'stale') return '';
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
  queryAll(document, '[data-nav-page]').forEach((link) => {
    if (link.dataset.navPage === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  setPageLocation(['sounds', 'about', 'home'].includes(view) ? view : 'home', true);
  setRunHistory(null);
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
  progress = loadProgress(profile);
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
  const rewards = homeRewards(progress);
  const hasGameChoice = profile.challenges.length > 1;
  const subject = profile.id === 'vi' ? profile.label : profile.romanization;
  const guideLabel = profile.id === 'vi' ? 'Vietnamese tone guide' : 'New to ' + subject + '?';
  app.innerHTML = /* HTML */ ` <aside class="content-preview" role="status" hidden>
      <strong>${escape(profile.label)} is taking shape.</strong>
      <p>
        We’re gathering enough recordings to open the games. Explore the
        ${escape(profile.romanization)} guide while the collection grows.
      </p>
    </aside>
    <section class="home-welcome" aria-labelledby="welcome-heading">
      <h1 id="welcome-heading" tabindex="-1">Practice ${escape(subject)}</h1>
      <a class="home-guide-card" href="${siteURL(pages.sounds.path).href}" data-page="sounds">
        <span>
          <strong>${escape(guideLabel)}</strong>
          Open the guide
        </span>
        <span class="home-guide-arrow" aria-hidden="true">→</span>
      </a>
    </section>
    ${
      hasGameChoice
        ? /* HTML */ `<section class="mode-picker" aria-labelledby="mode-heading">
            <div class="mode-picker-heading">
              <h2 id="mode-heading">Choose a game</h2>
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
                ><span id="tone-mode-description"
                  >Identify the correct tones to climb the tower.</span
                >
              </button>
              <button
                type="button"
                class="mode-card"
                data-mode-card
                data-destination="rail"
                aria-describedby="rail-mode-description"
              >
                <strong>Skyrail</strong
                ><span id="rail-mode-description"
                  >Type the correct ${profile.romanization} spelling before the time runs out.</span
                >
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
                ['tone', 'easy', 'Visit the tower butterflies'],
                ['tone', 'normal', 'Pet the rooftop cat'],
                ['tone', 'extreme', 'Wake the spire dragon'],
                ['tide', 'easy', 'Visit the station butterflies'],
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
          <p id="home-reward-status" class="home-reward-status" role="status"></p>
        </div>
        <div class="dock">
          <div>
            <section id="saved-run" aria-labelledby="saved-run-title" hidden>
              <h2 id="saved-run-title">Unfinished run</h2>
              <p id="saved-run-details" class="small"></p>
              <div class="game-actions">
                <button id="resume-run" class="primary" type="button">Resume run</button>
                <button id="discard-run" class="quiet" type="button">Discard run</button>
              </div>
            </section>
            <p id="saved-run-status" class="small" role="status" hidden></p>
            <h2 id="destination-title"></h2>
            <div class="setup-tabs" role="group" aria-label="Game or practice">
              <button type="button" id="setup-game" aria-pressed="true">Play game</button>
              <button type="button" id="setup-practice" aria-pressed="false">Practice</button>
            </div>
            <div class="map-entry">
              <div id="setup-error" class="error" role="alert" tabindex="-1"></div>
              <button id="start-adventure" class="primary" type="button">
                <span id="start-adventure-label">Enter Tone Tower</span>
                <span aria-hidden="true">→</span>
              </button>
              <div id="setup-status" class="small" role="status"></div>
            </div>
            <div id="map-variants" class="title-variants"></div>
          </div>
        </div>
      </div>
    </section>`;
  const rewardStatus = required(app, '#home-reward-status');
  rewardStatus.textContent = homecoming
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
        const offset = cat ? 9 : key.endsWith('-easy') ? 0 : 7;
        button.style.top = ((position.y + 56 - offset) / 400) * 100 + '%';
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
      const lines = friendDialogue[friend];
      const turn = dialogueTurns.get(friend) ?? 0;
      rewardStatus.textContent = lines[turn % lines.length];
      dialogueTurns.set(friend, turn + 1);
    };
  });
  function select(value: string) {
    if (!profile.challenges.includes(value === 'rail' ? 'tide' : 'tone')) return;
    mapDestination = value;
    const rail = value === 'rail',
      challenge = rail ? 'tide' : 'tone',
      key = rail ? 'tideVariant' : 'toneVariant',
      variant = progress.settings[key];
    queryAll(app, '[data-destination]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.destination === value)),
    );
    required(app, '#destination-title').textContent = challenges[challenge].title;
    const variants = required(app, '#map-variants');
    const selectedDifficulty = rail ? progress.settings.tideDifficulty : variant;
    variants.innerHTML = /* HTML */ `<div
        class="difficulty-options"
        role="group"
        aria-label="${rail ? 'Skyrail difficulty' : 'Tower difficulty'}"
      >
        ${Object.entries(rail ? RAIL_DIFFICULTIES : TONE_VARIANTS)
          .map(
            ([difficulty, lives]) =>
              `<button type="button" ${rail ? 'data-difficulty' : 'data-variant'}="${difficulty}" aria-pressed="${difficulty === selectedDifficulty}">${difficultyName(difficulty)}${heartPreview(lives)}</button>`,
          )
          .join('')}
      </div>
      ${
        rail
          ? /* HTML */ `<div class="answer-variants" role="group" aria-label="Answer style">
                ${challenges.tide.variants
                  .map(
                    (v) =>
                      `<button type="button" data-variant="${v}" aria-pressed="${v === variant}">${variantName('tide', v)}</button>`,
                  )
                  .join('')}
              </div>
              <div class="skyrail-example">
                <span lang="${escape(textLanguage(profile, progress.settings.script))}"
                  >${escape(profile.example.text)}</span
                ><span>
                  →
                  ${
                    variant === 'full'
                      ? profile.format(profile.example.parts.join(' '))
                      : profile.example.parts.map((part) => profile.withoutTones(part)).join(' ')
                  }
                </span>
              </div>`
          : ''
      }`;
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
    required(enter, '#start-adventure-label').textContent = practiceMode
      ? rail
        ? 'Start spelling practice'
        : 'Start tone practice'
      : rail
        ? 'Board Skyrail'
        : 'Enter Tone Tower';
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
  showRunRecovery();
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
function showWorkshop() {
  home(undefined, true);
  query(app, '#setup-practice')?.focus();
}

function showRunRecovery() {
  const card = query(app, '#saved-run');
  if (!card) return;
  const saved = loadRunCheckpoint(profile);
  const status = required(app, '#saved-run-status');
  const announce = (message: string) => {
    status.textContent = message;
    status.hidden = !message;
  };
  card.hidden = saved.status !== 'saved';
  announce(
    saved.status === 'invalid'
      ? 'This saved run is incompatible. You can start a fresh run.'
      : saved.status === 'unavailable'
        ? 'Run recovery is unavailable in this browser.'
        : '',
  );
  if (saved.status !== 'saved') return;
  const { run } = saved.checkpoint;
  const activity = challenges[run.config.challenge].title;
  required(card, '#saved-run-details').textContent = run.config.practice
    ? `${activity} practice · ${run.cleared} correct · ${run.mistakes} missed`
    : `${activity} · ${run.opened} of 100 cleared · ${run.lives} ${run.lives === 1 ? 'life' : 'lives'} left`;
  const resume = required(card, '#resume-run');
  const discard = required(card, '#discard-run');
  discard.onclick = () => {
    const result = updateRunCheckpoint(profile, saved.id, null);
    showRunRecovery();
    if (result === 'saved') {
      announce('Saved run discarded.');
      query(app, '#start-adventure')?.focus();
    } else if (result === 'unavailable') announce('This browser couldn’t discard the saved run.');
  };
  resume.onclick = async () => {
    resume.disabled = true;
    announce('Loading the recording library…');
    try {
      await loadLibrary();
    } catch {
      if (card.isConnected) announce('Couldn’t load the recording library. Try again.');
      return;
    } finally {
      resume.disabled = false;
    }
    if (!card.isConnected || dialog.open) return;
    if (libraryUnavailable()) {
      announce('The recording library is unavailable. Try again later.');
      return;
    }
    const latest = loadRunCheckpoint(profile);
    if (latest.status !== 'saved' || latest.id !== saved.id) {
      showRunRecovery();
      return;
    }
    enterGame(latest.checkpoint.run.config, latest.id, latest.checkpoint);
  };
}

function begin(config: RunInput, approvedId?: string) {
  if (libraryUnavailable()) {
    screenError(
      'There are not enough recordings for this collection yet. Please explore the guide for now.',
    );
    return;
  }
  const saved = loadRunCheckpoint(profile);
  if (saved.status === 'saved' && saved.id !== approvedId) {
    openDialog(
      /* HTML */ ` <h2 id="dialog-title">Replace your saved run?</h2>
        <p>Starting a new run discards your unfinished run.</p>
        <div class="game-actions">
          <button id="replace-saved-run" class="primary" type="button">Start new run</button>
          <button id="keep-saved-run" class="quiet" type="button">Keep saved run</button>
        </div>`,
    );
    required(dialogBody, '#keep-saved-run').onclick = () => dialog.close();
    required(dialogBody, '#replace-saved-run').onclick = () => {
      dialog.close();
      begin(config, saved.id);
    };
    return;
  }
  enterGame(config, saved.status === 'saved' ? saved.id : null);
}

function enterGame(
  config: RunInput,
  expectedId: string | null,
  saved?: RunCheckpoint,
  pauseOnRestore = false,
) {
  const id = [...crypto.getRandomValues(new Uint32Array(4))]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
  runOwner = { id, expectedId };
  runSaveStatus = 'saved';
  resetView('game');
  try {
    controller ??= createGameController({
      profile,
      app,
      player,
      siteHeader,
      words: data.filter((word) => !word.anchor),
      script: progress.settings.script,
      onFinish: finish,
      onCheckpoint: saveCheckpoint,
      onDiscard: discardCheckpoint,
      recoveryWarning,
      victoryMessage,
      onRetry: begin,
      onHome: home,
      onPractice: (run, mode) => begin(practiceForRun(run, mode)),
    });
    if (saved) controller.restore(saved, { paused: pauseOnRestore });
    else controller.start(config);
  } catch (error) {
    if (saved) discardCheckpoint();
    runOwner = null;
    prepare(config.challenge ?? 'tone');
    screenError(
      saved ? 'This saved run is incompatible. You can start a fresh run.' : errorMessage(error),
    );
  }
}
function finish(run: Run) {
  if (!run.recorded) {
    const message = victoryMessage(run);
    const result =
      runSaveStatus === 'stale'
        ? { status: 'stale' as const, progress: loadProgress(profile) }
        : completeSavedRun(profile, run, runOwner?.expectedId ?? null, progress);
    setRunSaveStatus(result.status);
    progress = result.progress;
    run.recorded = true;
    runOwner = null;
    setRunHistory(null);
    if (message && result.status !== 'stale') homecoming.push(message);
  }
  if (run.config.practice) {
    controller?.dispose();
    showResults(run);
  }
}
function showResults(run: Run) {
  resetView('results');
  app.dataset.world = run.world;
  app.innerHTML = /* HTML */ `<section class="results-view">
    <h1 tabindex="-1">Practice complete</h1>
    <div class="result-metrics">
      <div><strong>${run.cleared}</strong><span>Correct answers</span></div>
      <div><strong>${run.mistakes}</strong><span>Missed answers</span></div>
    </div>
    ${recoveryWarning() ? `<p class="small" role="status">${escape(recoveryWarning())}</p>` : ''}
    <div class="results-actions">
      <button id="retry" class="primary" type="button">Practice again</button>
      <button id="result-home" class="text-button" type="button">Back to Home</button>
    </div>
  </section>`;
  required(app, '#retry').onclick = () => begin(run.config);
  required(app, '#result-home').onclick = () => home(run.world);
  focusTitle();
}

function openDialog(html: string, opener = document.activeElement) {
  if (!dialog.open) {
    dialogOpener = opener instanceof HTMLElement ? opener : null;
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
function runHistoryId() {
  const state: unknown = history.state;
  return state !== null &&
    typeof state === 'object' &&
    'toneTowerRun' in state &&
    typeof state.toneTowerRun === 'string'
    ? state.toneTowerRun
    : null;
}
function setRunHistory(id: string | null) {
  if (id !== runHistoryId()) history.replaceState(id === null ? null : { toneTowerRun: id }, '');
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
  const credits = query(container, '[data-info-action="credits"]');
  if (credits) credits.onclick = () => showCredits(credits);
}
function showInfo(page: string) {
  resetView(page);
  if (page === 'sounds') {
    const guide = guideCatalog ?? catalog;
    const recordings = guide ? catalogRows(guide, profile, progress.settings.script) : [];
    const references = guide ? referenceRows(guide, recordings) : [];
    app.innerHTML = soundPageMarkup(
      references,
      profile.toneDefinitions,
      recordings,
      profile,
      progress.settings.script,
    );
    bindToneAudio(app, recordings, references);
  } else {
    app.innerHTML = aboutPageMarkup(profile);
  }
  bindInfoActions(app);
}
function navigate(
  page: string,
  { replace = false, focus = true }: { replace?: boolean; focus?: boolean } = {},
) {
  if (!['home', 'sounds', 'about', 'practice'].includes(page)) return;
  closeHeaderMenu();
  if (
    screen === 'game' &&
    controller?.active &&
    controller.phase !== 'interrupted' &&
    !controller.state?.recorded
  ) {
    const destination = {
      home: 'Home',
      sounds: profile.guideName ?? profile.romanization + ' guide',
      about: 'About',
      practice: 'Practice',
    }[page];
    controller.confirmExit({
      title: 'Go to ' + destination + '?',
      message: 'Opening this page ends the current run.',
      action: 'End run & go to ' + destination,
      confirm: () => navigate(page),
    });
    return;
  }
  setPageLocation(page, replace);
  if (page === 'sounds' || page === 'about') showInfo(page);
  else if (page === 'practice') showWorkshop();
  else home();
  if (focus) focusTitle();
}
const showCredits = createCreditsDialog({ dialogBody, profile, loadRows: loadLibrary, openDialog });
queryAll(document, '[data-nav-page]').forEach(
  (link) =>
    (link.onclick = (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(link.dataset.navPage ?? 'home');
    }),
);
required(document, '.brand').onclick = (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate('home');
};
const scriptOptions = queryAll(siteHeader, '[data-script-option]');
function syncScriptSetting() {
  for (const option of scriptOptions) option.checked = option.value === progress.settings.script;
}
syncScriptSetting();
for (const option of scriptOptions) {
  option.onclick = (event) => {
    if (event.detail > 0 && screen === 'game' && controller?.phase !== 'interrupted')
      controller?.focusGameplay();
  };
  option.onchange = () => {
    const script = option.value;
    if (!option.checked || !profile.scripts.includes(script)) return;
    progress.settings.script = script;
    persist();
    applyScript(script);
    if (screen === 'home') {
      const language = textLanguage(profile, script);
      queryAll(app, '.skyrail-example span[lang], .practice-example span[lang]').forEach(
        (example) => (example.lang = language),
      );
    } else if (screen === 'sounds') {
      navigate(pageFromLocation(new URL(location.href), appBase, profile), {
        replace: true,
        focus: false,
      });
      option.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  };
}
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
  if (screen === 'game' && controller?.active) {
    setPageLocation('home', true);
    const ownedId = runOwner && runOwner.expectedId === runOwner.id ? runOwner.id : null;
    setRunHistory(runSaveStatus === 'stale' ? null : ownedId);
    return;
  }
  navigate(pageFromLocation(new URL(location.href), appBase, profile), { replace: true });
});
window.addEventListener('storage', (event) => {
  if (event.key !== profile.storageKey && event.key !== null) return;
  if (screen === 'home') showRunRecovery();
  if (runOwner?.expectedId && runSaveStatus === 'saved') {
    const current = loadRunCheckpoint(profile);
    if (
      current.status !== 'unavailable' &&
      (current.status !== 'saved' || current.id !== runOwner.expectedId)
    )
      setRunSaveStatus('stale');
  }
});

async function restoreReload(id: string) {
  const showHome = () => navigate('home', { replace: true, focus: false });
  const saved = loadRunCheckpoint(profile);
  if (saved.status !== 'saved' || saved.id !== id) {
    showHome();
    return;
  }
  app.innerHTML = '<p id="restoring-run" role="status">Restoring your run…</p>';
  const loading = required(app, '#restoring-run');
  try {
    await loadLibrary();
  } catch {
    if (loading.isConnected) {
      showHome();
      if (!dialog.open)
        screenError('Couldn’t load the recording library. Select Resume run to try again.');
    }
    return;
  }
  if (!loading.isConnected) return;
  const latest = loadRunCheckpoint(profile);
  if (latest.status !== 'saved' || latest.id !== id || libraryUnavailable() || dialog.open) {
    showHome();
    return;
  }
  enterGame(latest.checkpoint.run.config, latest.id, latest.checkpoint, true);
}

const initialPage = pageFromLocation(new URL(location.href), appBase, profile);
const reloadId = initialPage === 'home' ? runHistoryId() : null;
if (reloadId) void restoreReload(reloadId);
else navigate(initialPage, { replace: true, focus: false });

function updateKeyboardViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const input = query(app, '#transcription-answer');
  const keyboardOpen =
    screen === 'game' &&
    app.dataset.world === 'tide' &&
    viewport.width <= 700 &&
    (Math.max(window.innerHeight, document.documentElement.clientHeight) - viewport.height > 110 ||
      viewport.height < 540);
  document.body.classList.toggle('keyboard-open', keyboardOpen);
  document.documentElement.style.setProperty('--visual-height', viewport.height + 'px');

  const scene = keyboardOpen && query(app, '.scene-frame');
  if (!scene || !input || input !== document.activeElement) return;
  const top = viewport.offsetTop + 8;
  const bottom = viewport.offsetTop + viewport.height - 8;
  const sceneTop = scene.getBoundingClientRect().top;
  const inputBottom = input.getBoundingClientRect().bottom;
  const scroll = Math.min(sceneTop - top, Math.max(0, inputBottom - bottom));
  if (scroll) window.scrollBy({ top: scroll, behavior: 'instant' });
}
window.visualViewport?.addEventListener('resize', updateKeyboardViewport);
document.addEventListener('focusin', updateKeyboardViewport);
document.addEventListener('focusout', () => setTimeout(updateKeyboardViewport, 0));
