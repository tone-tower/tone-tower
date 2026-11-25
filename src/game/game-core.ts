import type {
  Challenge,
  LanguageProfile,
  ExerciseConfig,
  RunInput,
  ExerciseRow,
  Run,
  Tone,
  FailureReason,
  PracticePrompt,
  RunResult,
  RunSnapshot,
} from '../types.ts';
import { shuffle, buildChoices } from './logic.ts';
import { chooseWordRecording, wordIdentity } from '../content/catalog.ts';

import { requireProfile } from '../languages/profile.ts';
import {
  heartDropChance,
  TOWER_HEART_CAPS,
  TOWER_LAST_HEART_CHANCES,
  TOWER_LEGACY_HEART_CAPS,
} from './heart-recovery.ts';
export const TONE_VARIANTS: Readonly<Record<string, number>> = TOWER_HEART_CAPS;
const practiceLives: Readonly<Record<string, number>> = TOWER_LEGACY_HEART_CAPS;
export const TIDE_VARIANTS = Object.freeze(['spelling', 'full']);
export const RAIL_DIFFICULTIES = TONE_VARIANTS;
const lastHeartChances: Readonly<Record<string, number>> = TOWER_LAST_HEART_CHANCES;
export const RAIL_DEADLINES = Object.freeze([15, 13, 11, 9, 7]);
export const challenges = Object.freeze({
  tone: Object.freeze({
    id: 'tone',
    title: 'Tone Tower',
    world: 'tone',
    length: 100,
    variants: Object.keys(TONE_VARIANTS),
    stages: Array.from({ length: 5 }, (_, i) => ({
      start: i * 20 + 1,
      end: (i + 1) * 20,
    })),
  }),
  tide: Object.freeze({
    id: 'tide',
    title: 'Skyrail',
    world: 'tide',
    length: 100,
    variants: TIDE_VARIANTS,
    stages: RAIL_DEADLINES.map((seconds, i) => ({
      start: i * 20 + 1,
      end: (i + 1) * 20,
      seconds,
      target: i < 2 ? 'highlighted' : 'whole',
    })),
  }),
});

export function defaultPractice(challenge: Challenge, profile: LanguageProfile): ExerciseConfig {
  requireProfile(profile);
  return {
    challenge: challenge === 'tide' ? 'tide' : 'tone',
    variant: challenge === 'tide' ? 'spelling' : 'normal',
    difficulty: 'normal',
    practice: true,
    format: 'drill',
    length: 20,
    start: 1,
    content: challenge === 'tide' ? 'single' : profile.practiceToneContent,
    spellingFocus: 'full',
    singleSyllableOnly: false,
    target: challenge === 'tide' ? 'whole' : 'highlighted',
    tones: [...profile.tones],
    choices: 2,
    lives: 'unlimited',
    timer: 'off',
    seconds: 15,
    focusIds: [],
  };
}

export function practiceForRun(run: Run, mode: 'combination' | 'mistakes'): ExerciseConfig {
  const config = {
    ...defaultPractice('tone', run.profile),
    variant: run.config.variant,
    content: 'mixed' as const,
  };
  return mode === 'combination'
    ? { ...config, tones: [...run.choices], choices: run.choices.length }
    : { ...config, reviewPrompts: run.missedPrompts };
}

function normalizeConfig(input: RunInput, profile: LanguageProfile): ExerciseConfig {
  requireProfile(profile);
  const challenge = input.challenge ?? 'tone';
  return {
    ...defaultPractice(challenge, profile),
    ...input,
    challenge,
    variant: input.variant ?? (challenge === 'tide' ? 'spelling' : 'normal'),
    practice: input.practice === true,
    tones: [...(input.tones ?? profile.tones)],
    focusIds: [...(input.focusIds ?? [])],
    ...(input.reviewPrompts && {
      reviewPrompts: input.reviewPrompts.map(({ id, targetIndex, choices }) => ({
        id,
        targetIndex,
        choices: [...choices],
      })),
    }),
  };
}

function compatibleWords(config: ExerciseConfig, words: ExerciseRow[], profile: LanguageProfile) {
  return words
    .filter((w) => !w.anchor)
    .filter(
      (w) =>
        w.id &&
        w.syllables?.length &&
        w.syllables.every(
          (s) => typeof s.transcription === 'string' && profile.tones.includes(s.tone),
        ),
    )
    .filter(
      (w) =>
        config.content === 'mixed' ||
        (config.content === 'single' ? w.syllables.length === 1 : w.syllables.length > 1),
    )
    .filter((w) => !config.focusIds.length || config.focusIds.includes(w.id))
    .filter(
      (w) =>
        config.challenge !== 'tone' ||
        w.syllables.some((s) => s.toneEligible !== false && config.tones.includes(s.tone)),
    );
}

export function validatePractice(
  input: RunInput,
  words: ExerciseRow[] | undefined,
  profile: LanguageProfile,
) {
  requireProfile(profile);
  let config;
  const errors = [];
  try {
    config = normalizeConfig({ ...input, practice: true }, profile);
  } catch {
    return {
      valid: false,
      errors: ['Practice settings are invalid.'],
      config: defaultPractice(input.challenge ?? 'tone', profile),
    };
  }
  if (!profile.challenges.includes(config.challenge)) errors.push('Choose a challenge.');
  if (
    config.challenge === 'tone'
      ? !Object.hasOwn(practiceLives, config.variant)
      : !TIDE_VARIANTS.includes(config.variant)
  )
    errors.push('Choose a valid challenge variant.');
  if (config.challenge === 'tide' && !Object.hasOwn(practiceLives, config.difficulty))
    errors.push('Choose a valid Skyrail difficulty.');
  if (!['drill', 'rehearsal'].includes(config.format)) errors.push('Choose a practice format.');
  if (
    config.reviewPrompts &&
    (config.challenge !== 'tone' || config.format !== 'drill' || !config.reviewPrompts.length)
  )
    errors.push('Choose missed Tower questions for review.');
  if (![10, 20, 50, 'endless'].includes(config.length))
    errors.push('Choose 10, 20, 50, or endless practice.');
  if (!Number.isInteger(config.start) || config.start < 1 || config.start > 100)
    errors.push('Start must be between 1 and 100.');
  if (!['mixed', 'single', 'multi'].includes(config.content))
    errors.push('Choose a recording length.');
  if (!profile.spellingFocuses.includes(config.spellingFocus))
    errors.push('Choose initials, finals or full spelling.');
  if (!['stage', 'highlighted', 'whole'].includes(config.target))
    errors.push('Choose a typing target.');
  if (
    (input.tones !== undefined && !Array.isArray(input.tones)) ||
    !config.tones.length ||
    new Set(config.tones).size !== config.tones.length ||
    !config.tones.every((t) => profile.tones.includes(t))
  )
    errors.push('Choose different valid tones.');
  if (
    config.challenge === 'tone' &&
    (!profile.choiceCounts.includes(config.choices) || config.choices > config.tones.length)
  )
    errors.push('Choose enough tones for the number of doors.');
  if (!['standard', 'unlimited'].includes(config.lives))
    errors.push('Choose standard or unlimited lives.');
  if (!['off', 'stage', 'custom'].includes(config.timer)) errors.push('Choose a timer setting.');
  if (
    config.timer === 'custom' &&
    (!Number.isInteger(config.seconds) || config.seconds < 1 || config.seconds > 120)
  )
    errors.push('Custom time must be between 1 and 120 seconds.');
  if (
    (input.focusIds !== undefined && !Array.isArray(input.focusIds)) ||
    !config.focusIds.every((id) => typeof id === 'string')
  )
    errors.push('Missed recording selection is invalid.');
  if (!errors.length && words) {
    const pool = compatibleWords(config, words, profile);
    if (config.reviewPrompts) {
      const byId = new Map(pool.map((word) => [word.id, word]));
      const valid = config.reviewPrompts.every(({ id, targetIndex, choices }) => {
        if (!Number.isInteger(targetIndex)) return false;
        const syllable = byId.get(id)?.syllables[targetIndex];
        return (
          syllable &&
          syllable.toneEligible !== false &&
          choices.includes(syllable.tone) &&
          profile.choiceCounts.includes(choices.length) &&
          new Set(choices).size === choices.length &&
          choices.every((tone) => profile.tones.includes(tone))
        );
      });
      if (!valid) errors.push('A missed Tower question is unavailable.');
      return { valid: !errors.length, errors, config };
    }
    if (!pool.length)
      errors.push(
        'No recordings match these settings. Try another recording length or clear the missed-word filter.',
      );
    if (
      config.challenge === 'tone' &&
      !config.focusIds.length &&
      config.tones.some(
        (t) => !pool.some((w) => w.syllables.some((s) => s.toneEligible !== false && s.tone === t)),
      )
    )
      errors.push('The selected recordings do not cover every chosen tone.');
    if (
      config.challenge === 'tide' &&
      config.target === 'stage' &&
      config.content === 'mixed' &&
      pool.length
    ) {
      const start = config.format === 'rehearsal' ? config.start - 1 : 0;
      const end =
        config.format === 'rehearsal'
          ? 99
          : config.length === 'endless'
            ? 99
            : start + config.length - 1;
      if (start < 20 && !pool.some((w) => w.syllables.length === 1))
        errors.push('This stage needs single-syllable recordings.');
      if (end >= 20 && !pool.some((w) => w.syllables.length > 1))
        errors.push('Later stages need multi-syllable recordings.');
    }
  }
  return { valid: !errors.length, errors, config };
}

function recordingSignature(word: ExerciseRow) {
  return JSON.stringify([
    word.audio,
    word.syllables.map(({ transcription, tone, toneEligible }) => [
      transcription,
      tone,
      toneEligible !== false,
    ]),
  ]);
}

export function createRun(
  input: RunInput = {},
  words: ExerciseRow[] = [],
  {
    profile,
    random = Math.random,
    heartRandom = Math.random,
    snapshot,
  }: {
    profile?: LanguageProfile;
    random?: () => number;
    heartRandom?: () => number;
    snapshot?: RunSnapshot;
  } = {},
): Run {
  profile = requireProfile(profile);
  let config = normalizeConfig(input, profile);
  if (config.practice) {
    const checked = validatePractice(config, words, profile);
    if (!checked.valid) throw Error(checked.errors.join(' '));
    config = checked.config;
  } else {
    if (
      !Object.hasOwn(challenges, config.challenge) ||
      !profile.challenges.includes(config.challenge)
    )
      throw Error('Choose a challenge.');
    if (
      config.challenge === 'tone'
        ? !Object.hasOwn(TONE_VARIANTS, config.variant)
        : !TIDE_VARIANTS.includes(config.variant)
    )
      throw Error('Choose a valid challenge variant.');
    if (config.challenge === 'tide' && !Object.hasOwn(RAIL_DIFFICULTIES, config.difficulty))
      throw Error('Choose a valid Skyrail difficulty.');
    config = {
      ...config,
      start: 1,
      format: 'rehearsal',
      length: 100,
      content: 'mixed',
      target: 'stage',
      tones: [...profile.tones],
      lives: 'standard',
      timer: config.challenge === 'tone' ? 'off' : 'stage',
      focusIds: [],
      reviewPrompts: undefined,
    };
  }
  const pool = compatibleWords(config, words, profile);
  if (!pool.length) throw Error('No recordings match this challenge.');
  if (
    config.challenge === 'tide' &&
    config.target === 'stage' &&
    config.content === 'mixed' &&
    (!pool.some((w) => w.syllables.length === 1) || !pool.some((w) => w.syllables.length > 1))
  )
    throw Error('This climb needs single- and multi-syllable recordings.');
  let used = new Set<string>(),
    usedWords = new Set<string>(),
    toneBag: Tone[] = [];
  const reviewPrompts = config.reviewPrompts;
  const reviewRecordings = reviewPrompts && new Map(pool.map((word) => [word.id, word]));
  let skippedReviews = 0;
  const start = config.practice && config.format === 'rehearsal' ? config.start - 1 : 0;
  const difficulty = config.challenge === 'tone' ? config.variant : config.difficulty;
  const maxLives =
    config.practice && config.lives === 'unlimited'
      ? null
      : (config.practice ? practiceLives : TONE_VARIANTS)[difficulty];
  const previewRailHeart = config.challenge === 'tide' && !config.practice;
  let heartAhead = false;
  function rollHeart(lives: number) {
    const chance = heartDropChance(lives, maxLives ?? 0, lastHeartChances[difficulty]);
    return chance > 0 && heartRandom() < chance;
  }
  const run: Run = {
    config,
    profile,
    world: config.challenge,
    opened: start,
    cleared: 0,
    attempts: 0,
    mistakes: 0,
    guesses: 0,
    lives: maxLives,
    maxLives,
    status: 'playing',
    word: { id: '', text: '', audio: '', syllables: [] },
    targets: [],
    choices: [],
    missedIds: [],
    missedPrompts: [],
    confusions: {},
    assisted: 0,
    promptState: 'ready',
    lastAnswer: null,
    lastFailure: null,
    lastResult: null,
    stages: Array.from({ length: 5 }, () => ({ attempts: 0, correct: 0, mistakes: 0 })),
    get goal() {
      if (reviewPrompts) return reviewPrompts.length - skippedReviews;
      return !config.practice || config.format === 'rehearsal' ? 100 - start : config.length;
    },
    get stage() {
      return config.practice && config.format === 'drill'
        ? 0
        : Math.min(4, Math.floor(this.opened / 20));
    },
    get heartAhead() {
      return this.promptState === 'ready' && heartAhead;
    },
    expectedParts() {
      return this.targets.map((i) =>
        config.practice && config.challenge === 'tide'
          ? profile.practiceSpelling(this.word.syllables[i].transcription, config.spellingFocus)
          : this.word.syllables[i].transcription,
      );
    },
    expected() {
      return this.expectedParts().join(' ');
    },
    timeLimit() {
      if (
        (config.practice && config.timer === 'off') ||
        (config.challenge === 'tone' && !config.practice)
      )
        return 0;
      if (config.practice && config.timer === 'custom') return config.seconds * 1000;
      if (config.challenge === 'tone') return 0;
      return RAIL_DEADLINES[this.stage] * 1000;
    },
    markAssisted() {
      if (this.status !== 'playing' || this.promptState !== 'ready' || this.word.assisted) return;
      this.word.assisted = true;
      this.assisted++;
    },
    next() {
      if (this.status !== 'playing') return false;
      const newAttempt = this.word.id === '' || this.promptState !== 'ready';
      if (reviewPrompts && reviewRecordings) {
        const prompt = reviewPrompts[this.attempts + skippedReviews];
        if (!prompt) return false;
        const recording = reviewRecordings.get(prompt.id);
        if (!recording) throw Error('A missed recording is unavailable.');
        const { targetIndex } = prompt;
        this.word = {
          ...recording,
          syllables: recording.syllables.map((syllable) => ({ ...syllable })),
          targetIndex,
          tone: recording.syllables[targetIndex].tone,
        };
        this.targets = [targetIndex];
        this.choices = [...prompt.choices];
        this.promptState = 'ready';
        this.lastAnswer = null;
        this.lastFailure = null;
        this.lastResult = null;
        return this.word;
      }
      let eligible = pool;
      if (config.challenge === 'tide' && config.target === 'stage' && config.content === 'mixed')
        eligible = eligible.filter((w) =>
          this.opened < 20 ? w.syllables.length === 1 : w.syllables.length > 1,
        );
      if (!eligible.length) throw Error('No recordings match the next stage.');
      let fresh = eligible.filter((w) => !used.has(w.id));
      if (!fresh.length) {
        if (!config.practice)
          throw Error(
            'No unused recordings remain for this stage. Try practice with this recording set.',
          );
        used = new Set();
        usedWords = new Set();
        fresh = eligible.filter((w) => eligible.length === 1 || w.id !== this.word?.id);
      }
      let selected, targetIndex;
      if (config.challenge === 'tone') {
        const available = config.tones.filter((t) =>
          fresh.some((w) => w.syllables.some((s) => s.toneEligible !== false && s.tone === t)),
        );
        if (!toneBag.some((t) => available.includes(t))) toneBag = shuffle(config.tones, random);
        const index = toneBag.findIndex((t) => available.includes(t));
        const tone = toneBag.splice(index, 1)[0];
        const options = fresh.filter((w) =>
          w.syllables.some((s) => s.toneEligible !== false && s.tone === tone),
        );
        const unheard = options.filter((w) => !usedWords.has(wordIdentity(w)));
        selected = chooseWordRecording(unheard.length ? unheard : options, random);
        const indices = selected.syllables.flatMap((s, i) =>
          s.toneEligible !== false && s.tone === tone ? [i] : [],
        );
        targetIndex = indices[Math.floor(random() * indices.length)];
        this.word = {
          ...selected,
          syllables: selected.syllables.map((s) => ({ ...s })),
          tone,
          targetIndex,
        };
        this.targets = [targetIndex];
        const count =
          config.practice && config.format === 'drill'
            ? config.choices
            : Math.min(config.tones.length, profile.stageChoices[this.stage]);
        const supported = profile.choiceCounts.filter((n) => n <= count).at(-1);
        this.choices = buildChoices(tone, supported ?? 2, config.tones, random, profile.tones);
      } else {
        const unheard = fresh.filter((w) => !usedWords.has(wordIdentity(w)));
        selected = chooseWordRecording(unheard.length ? unheard : fresh, random);
        const whole = config.target === 'whole' || (config.target === 'stage' && this.opened >= 40);
        this.targets = whole
          ? selected.syllables.map((_, i) => i)
          : [Math.floor(random() * selected.syllables.length)];
        this.word = {
          ...selected,
          syllables: selected.syllables.map((s) => ({ ...s })),
          targetIndex: this.targets[0],
        };
        this.choices = [];
      }
      used.add(this.word.id);
      usedWords.add(wordIdentity(this.word));
      // A replacement recording keeps the same span and reward.
      if (previewRailHeart && newAttempt) {
        heartAhead = this.lives !== null && (this.opened + 1) % 20 !== 0 && rollHeart(this.lives);
      }
      this.promptState = 'ready';
      this.lastAnswer = null;
      this.lastFailure = null;
      this.lastResult = null;
      return this.word;
    },
    replace() {
      if (reviewPrompts && this.status === 'playing' && this.promptState === 'ready')
        skippedReviews++;
      return this.next();
    },
    answer(value) {
      if (this.status !== 'playing' || this.promptState !== 'ready')
        return {
          kind: 'empty',
          correct: false,
          terminal: this.status !== 'playing',
          ignored: true,
        };
      this.lastAnswer = value;
      if (config.challenge === 'tone') {
        const tone = profile.tones.find((t) => String(t) === String(value));
        if (tone === undefined || !this.choices.includes(tone))
          return { kind: 'empty', correct: false, terminal: false };
        if (this.word.tone !== undefined && tone !== this.word.tone) {
          const pair = [tone, this.word.tone].sort(
            (a, b) => profile.tones.indexOf(a) - profile.tones.indexOf(b),
          );
          const key = pair.every((t) => typeof t === 'number')
            ? pair.join('-')
            : JSON.stringify(pair);
          this.confusions[key] = (this.confusions[key] || 0) + 1;
          return this.fail('tone');
        }
      } else {
        const correct = profile.evaluate(
          value,
          this.expectedParts(),
          config.variant === 'full',
          config.practice ? config.spellingFocus : 'full',
        );
        if (correct === null) return { kind: 'empty', correct: false, terminal: false };
        if (!correct) {
          this.guesses++;
          if (config.practice && config.format === 'drill') return this.fail('spelling');
          return (this.lastResult = {
            kind: 'wrong',
            correct: false,
            landing: false,
            recovered: 0,
            terminal: false,
            expected: this.expected(),
          });
        }
      }
      const stage = this.stages[this.stage];
      stage.attempts++;
      stage.correct++;
      this.attempts++;
      this.opened++;
      this.cleared++;
      this.promptState = 'answered';
      const complete =
        this.goal !== 'endless' &&
        (config.practice && config.format === 'drill' ? this.attempts : this.cleared) >= this.goal;
      if (complete) this.status = config.practice ? 'complete' : 'won';
      let recovered = 0;
      const landing =
        !(config.practice && config.format === 'drill') && !complete && this.opened % 20 === 0;
      let heartDrop = false;
      if (this.lives !== null && maxLives !== null && !complete) {
        if (landing) recovered = maxLives - this.lives;
        else if (!config.practice) {
          heartDrop = previewRailHeart ? heartAhead : rollHeart(this.lives);
          if (heartDrop) recovered = 1;
        } else if (this.opened % 10 === 0) recovered = Math.min(1, maxLives - this.lives);
        this.lives += recovered;
      }
      return (this.lastResult = {
        kind: 'correct',
        correct: true,
        landing,
        recovered,
        ...(heartDrop && { heartDrop }),
        terminal: complete,
        expected: this.expected(),
      });
    },
    fail(reason = 'timeout') {
      if (this.status !== 'playing' || this.promptState !== 'ready')
        return {
          kind: 'empty',
          correct: false,
          terminal: this.status !== 'playing',
          ignored: true,
        };
      if (!['tone', 'spelling', 'timeout', 'reveal'].includes(reason))
        throw Error('Unknown failure reason.');
      this.lastFailure = reason;
      this.promptState = 'failed';
      this.attempts++;
      this.mistakes++;
      const stage = this.stages[this.stage];
      stage.attempts++;
      stage.mistakes++;
      if (!this.missedIds.includes(this.word.id)) this.missedIds.push(this.word.id);
      if (!config.practice && config.challenge === 'tone')
        this.missedPrompts.push({
          id: this.word.id,
          targetIndex: this.targets[0],
          choices: [...this.choices],
        });
      if (reason === 'reveal' && !this.word.assisted) {
        this.word.assisted = true;
        this.assisted++;
      }
      if (this.lives !== null && --this.lives <= 0) {
        this.lives = 0;
        this.status = 'lost';
      }
      if (
        config.practice &&
        config.format === 'drill' &&
        this.goal !== 'endless' &&
        this.attempts >= this.goal
      )
        this.status = 'complete';
      return (this.lastResult = {
        kind: 'wrong',
        correct: false,
        reason,
        landing: false,
        recovered: 0,
        terminal: this.status !== 'playing',
        expected: this.expected(),
      });
    },
    finish() {
      if (!config.practice || this.status !== 'playing') return false;
      this.status = 'complete';
      return true;
    },
    snapshot() {
      return structuredClone({
        config,
        recordingId: this.word.id,
        recordingSignature: recordingSignature(this.word),
        targets: this.targets,
        choices: this.choices,
        usedIds: [...used],
        toneBag,
        skippedReviews,
        heartAhead,
        opened: this.opened,
        cleared: this.cleared,
        attempts: this.attempts,
        mistakes: this.mistakes,
        guesses: this.guesses,
        lives: this.lives,
        status: this.status,
        missedIds: this.missedIds,
        missedPrompts: this.missedPrompts,
        confusions: this.confusions,
        assisted: this.assisted,
        wordAssisted: this.word.assisted === true,
        promptState: this.promptState,
        lastAnswer:
          typeof this.lastAnswer === 'string' || typeof this.lastAnswer === 'number'
            ? this.lastAnswer
            : null,
        lastFailure: this.lastFailure,
        lastResult: this.lastResult,
        stages: this.stages,
      });
    },
  };
  if (!snapshot) {
    run.next();
    return run;
  }
  const recordings = new Map(pool.map((word) => [word.id, word]));
  const recording = recordings.get(snapshot.recordingId);
  const targetIndex = snapshot.targets[0];
  const tone = recording?.syllables[targetIndex]?.tone;
  const countInStages = (key: 'attempts' | 'correct' | 'mistakes') =>
    snapshot.stages.reduce((sum, stage) => sum + stage[key], 0);
  if (
    !recording ||
    snapshot.recordingSignature !== recordingSignature(recording) ||
    tone === undefined ||
    snapshot.targets.some((i) => !recording.syllables[i]) ||
    new Set(snapshot.targets).size !== snapshot.targets.length ||
    (config.challenge === 'tone'
      ? snapshot.targets.length !== 1 ||
        recording.syllables[targetIndex].toneEligible === false ||
        !snapshot.choices.includes(tone) ||
        !profile.choiceCounts.includes(snapshot.choices.length) ||
        new Set(snapshot.choices).size !== snapshot.choices.length
      : snapshot.choices.length !== 0) ||
    snapshot.usedIds.some((id) => !recordings.has(id)) ||
    (!reviewPrompts && !snapshot.usedIds.includes(recording.id)) ||
    (!reviewPrompts && snapshot.skippedReviews !== 0) ||
    snapshot.toneBag.some((item) => !config.tones.includes(item)) ||
    snapshot.opened !== start + snapshot.cleared ||
    snapshot.attempts !== snapshot.cleared + snapshot.mistakes ||
    snapshot.attempts !== countInStages('attempts') ||
    snapshot.cleared !== countInStages('correct') ||
    snapshot.mistakes !== countInStages('mistakes') ||
    (maxLives === null
      ? snapshot.lives !== null
      : snapshot.lives === null || snapshot.lives > maxLives) ||
    (snapshot.status === 'playing' && snapshot.lives === 0) ||
    (!config.practice && snapshot.status !== 'playing') ||
    (config.practice && snapshot.status === 'won')
  )
    throw Error('This saved run no longer matches the recording library.');
  used = new Set(snapshot.usedIds);
  usedWords = new Set(pool.filter((word) => used.has(word.id)).map(wordIdentity));
  toneBag = [...snapshot.toneBag];
  skippedReviews = snapshot.skippedReviews;
  heartAhead = snapshot.heartAhead;
  run.word = {
    ...recording,
    syllables: recording.syllables.map((syllable) => ({ ...syllable })),
    targetIndex,
    ...(config.challenge === 'tone' && { tone }),
    assisted: snapshot.wordAssisted,
  };
  run.targets = [...snapshot.targets];
  run.choices = [...snapshot.choices];
  run.opened = snapshot.opened;
  run.cleared = snapshot.cleared;
  run.attempts = snapshot.attempts;
  run.mistakes = snapshot.mistakes;
  run.guesses = snapshot.guesses;
  run.lives = snapshot.lives;
  run.status = snapshot.status;
  run.missedIds = [...snapshot.missedIds];
  run.missedPrompts = structuredClone(snapshot.missedPrompts);
  run.confusions = { ...snapshot.confusions };
  run.assisted = snapshot.assisted;
  run.promptState = snapshot.promptState;
  run.lastAnswer = snapshot.lastAnswer;
  run.lastFailure = snapshot.lastFailure;
  run.lastResult = snapshot.lastResult && { ...snapshot.lastResult, expected: run.expected() };
  run.stages = structuredClone(snapshot.stages);
  return run;
}
