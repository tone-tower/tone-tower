import type {
  ExerciseConfig,
  LanguageProfile,
  PracticePrompt,
  RunCheckpoint,
  RunResult,
  RunSnapshot,
  Tone,
} from '../types.ts';
import { decodeTonePair } from './tone-pairs.ts';

export const CHECKPOINT_VERSION = 1;

export interface StoredRun {
  version: typeof CHECKPOINT_VERSION;
  id: string;
  checkpoint: RunCheckpoint;
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.every(id);
const tone = (value: unknown, profile: LanguageProfile): value is Tone =>
  profile.tones.some((candidate) => candidate === value);
const tones = (value: unknown, profile: LanguageProfile): value is Tone[] =>
  Array.isArray(value) && value.every((candidate) => tone(candidate, profile));
const failure = (value: unknown): boolean =>
  value === 'tone' || value === 'spelling' || value === 'timeout' || value === 'reveal';
const prompts = (value: unknown, profile: LanguageProfile): value is PracticePrompt[] =>
  Array.isArray(value) &&
  value.every(
    (prompt: unknown) =>
      isObject(prompt) &&
      id(prompt.id) &&
      count(prompt.targetIndex) &&
      tones(prompt.choices, profile),
  );

function config(value: unknown, profile: LanguageProfile): value is ExerciseConfig {
  return (
    isObject(value) &&
    profile.challenges.some((challenge) => value.challenge === challenge) &&
    id(value.variant) &&
    id(value.difficulty) &&
    typeof value.practice === 'boolean' &&
    (value.format === 'drill' || value.format === 'rehearsal') &&
    (count(value.length) || value.length === 'endless') &&
    count(value.start) &&
    (value.content === 'single' || value.content === 'multi' || value.content === 'mixed') &&
    profile.spellingFocuses.some((focus) => value.spellingFocus === focus) &&
    typeof value.singleSyllableOnly === 'boolean' &&
    (value.target === 'whole' || value.target === 'highlighted' || value.target === 'stage') &&
    tones(value.tones, profile) &&
    count(value.choices) &&
    (value.lives === 'standard' || value.lives === 'unlimited') &&
    (value.timer === 'off' || value.timer === 'stage' || value.timer === 'custom') &&
    count(value.seconds) &&
    ids(value.focusIds) &&
    (value.reviewPrompts === undefined || prompts(value.reviewPrompts, profile))
  );
}

function result(value: unknown): value is RunResult {
  return (
    isObject(value) &&
    typeof value.terminal === 'boolean' &&
    (value.expected === undefined || typeof value.expected === 'string') &&
    (value.landing === undefined || typeof value.landing === 'boolean') &&
    (value.recovered === undefined || count(value.recovered)) &&
    (value.reason === undefined || failure(value.reason)) &&
    (value.ignored === undefined || typeof value.ignored === 'boolean') &&
    (value.kind === 'correct'
      ? value.correct === true && (value.heartDrop === undefined || value.heartDrop === true)
      : (value.kind === 'wrong' || value.kind === 'empty') && value.correct === false)
  );
}

function snapshot(value: unknown, profile: LanguageProfile): value is RunSnapshot {
  if (!isObject(value) || !config(value.config, profile)) return false;
  const state = value.promptState;
  const last = value.lastResult;
  const status = value.status;
  return (
    id(value.recordingId) &&
    id(value.recordingSignature) &&
    Array.isArray(value.targets) &&
    value.targets.length > 0 &&
    value.targets.every(count) &&
    tones(value.choices, profile) &&
    ids(value.usedIds) &&
    tones(value.toneBag, profile) &&
    count(value.skippedReviews) &&
    typeof value.heartAhead === 'boolean' &&
    count(value.opened) &&
    count(value.cleared) &&
    count(value.attempts) &&
    count(value.mistakes) &&
    count(value.guesses) &&
    (value.lives === null || count(value.lives)) &&
    (status === 'playing' ||
      (value.config.practice && (status === 'lost' || status === 'complete'))) &&
    ids(value.missedIds) &&
    prompts(value.missedPrompts, profile) &&
    isObject(value.confusions) &&
    Object.entries(value.confusions).every(([key, n]) => {
      const pair = decodeTonePair(key);
      return count(n) && pair.length === 2 && pair[0] !== pair[1] && tones(pair, profile);
    }) &&
    count(value.assisted) &&
    typeof value.wordAssisted === 'boolean' &&
    (value.lastAnswer === null ||
      typeof value.lastAnswer === 'string' ||
      tone(value.lastAnswer, profile)) &&
    (state === 'failed'
      ? failure(value.lastFailure) &&
        result(last) &&
        last.kind === 'wrong' &&
        last.reason === value.lastFailure
      : value.lastFailure === null &&
        (state === 'answered'
          ? result(last) && last.kind === 'correct'
          : state === 'ready' &&
            status === 'playing' &&
            (last === null ||
              (result(last) && last.kind === 'wrong' && last.reason === undefined)))) &&
    Array.isArray(value.stages) &&
    value.stages.length === 5 &&
    value.stages.every(
      (stage: unknown) =>
        isObject(stage) &&
        count(stage.attempts) &&
        count(stage.correct) &&
        count(stage.mistakes) &&
        stage.correct + stage.mistakes === stage.attempts,
    )
  );
}

export function readStoredRun(value: unknown, profile: LanguageProfile): StoredRun | null {
  if (!isObject(value) || value.version !== CHECKPOINT_VERSION || !id(value.id)) return null;
  const checkpoint = value.checkpoint;
  if (!isObject(checkpoint) || !snapshot(checkpoint.run, profile)) return null;
  const deadline = checkpoint.deadline;
  if (
    deadline !== null &&
    (!count(deadline) || deadline === 0 || checkpoint.run.promptState !== 'ready')
  )
    return null;
  return {
    version: CHECKPOINT_VERSION,
    id: value.id,
    checkpoint: { run: checkpoint.run, deadline },
  };
}
