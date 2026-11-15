import {
  defaultPractice,
  validatePractice,
  TONE_VARIANTS,
  TIDE_VARIANTS,
  RAIL_DIFFICULTIES,
} from '../game/game-core.ts';
import { requireProfile } from '../languages/profile.ts';
import { decodeTonePair } from './tone-pairs.ts';
import type {
  LanguageProfile,
  Progress,
  ChallengeRecord,
  Challenge,
  Run,
  RunInput,
} from '../types.ts';
const PROGRESS_VERSION = 3;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0;
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string'))] : [];
const record = (): ChallengeRecord => ({ runs: 0, wins: 0, best: 0, fewest: null });
function storageOrNull(storage?: StorageLike): StorageLike | null {
  try {
    return storage ?? globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function cleanRecord(value: unknown): ChallengeRecord {
  const v = object(value),
    runs = count(v.runs);
  return {
    runs,
    wins: Math.min(runs, count(v.wins)),
    best: Math.min(100, count(v.best)),
    fewest:
      typeof v.fewest === 'number' && Number.isSafeInteger(v.fewest) && v.fewest >= 0
        ? v.fewest
        : null,
  };
}
export function emptyProgress(profile: LanguageProfile): Progress {
  requireProfile(profile);
  return {
    version: PROGRESS_VERSION,
    settings: {
      script: profile.defaultScript,
      toneVariant: 'normal',
      tideVariant: 'spelling',
      tideDifficulty: 'normal',
      practice: { tone: defaultPractice('tone', profile), tide: defaultPractice('tide', profile) },
    },
    records: {
      tone: Object.fromEntries(Object.keys(TONE_VARIANTS).map((k) => [k, record()])),
      tide: Object.fromEntries(
        TIDE_VARIANTS.map((k) => [
          k,
          Object.fromEntries(Object.keys(RAIL_DIFFICULTIES).map((d) => [d, record()])),
        ]),
      ),
    },
    practice: { runs: 0, completed: 0, cleared: 0 },
    missedIds: [],
    confusions: {},
  };
}
function practiceInput(value: unknown, challenge: Challenge, profile: LanguageProfile): RunInput {
  const v = object(value),
    c = defaultPractice(challenge, profile);
  if (typeof v.variant === 'string') c.variant = v.variant;
  if (typeof v.difficulty === 'string') c.difficulty = v.difficulty;
  if (v.format === 'drill' || v.format === 'rehearsal') c.format = v.format;
  if (typeof v.length === 'number' || v.length === 'endless') c.length = v.length;
  if (typeof v.start === 'number') c.start = v.start;
  if (v.content === 'single' || v.content === 'multi' || v.content === 'mixed')
    c.content = v.content;
  if (v.spellingFocus === 'full' || v.spellingFocus === 'initials' || v.spellingFocus === 'finals')
    c.spellingFocus = v.spellingFocus;
  if (v.target === 'whole' || v.target === 'stage' || v.target === 'highlighted')
    c.target = v.target;
  if (
    Array.isArray(v.tones) &&
    v.tones.every((t) => typeof t === 'string' || typeof t === 'number')
  )
    c.tones = v.tones;
  if (typeof v.choices === 'number') c.choices = v.choices;
  if (v.lives === 'standard' || v.lives === 'unlimited') c.lives = v.lives;
  if (v.timer === 'off' || v.timer === 'stage' || v.timer === 'custom') c.timer = v.timer;
  if (typeof v.seconds === 'number') c.seconds = v.seconds;
  if (typeof v.singleSyllableOnly === 'boolean') c.singleSyllableOnly = v.singleSyllableOnly;
  c.focusIds = ids(v.focusIds);
  return c;
}
function sanitize(value: unknown, profile: LanguageProfile): Progress {
  const v = object(value),
    p = emptyProgress(profile),
    settings = object(v.settings),
    savedPractice = object(settings.practice),
    records = object(v.records);
  if (typeof settings.script === 'string' && profile.scripts.includes(settings.script))
    p.settings.script = settings.script;
  if (
    typeof settings.toneVariant === 'string' &&
    Object.hasOwn(TONE_VARIANTS, settings.toneVariant)
  )
    p.settings.toneVariant = settings.toneVariant;
  if (typeof settings.tideVariant === 'string' && TIDE_VARIANTS.includes(settings.tideVariant))
    p.settings.tideVariant = settings.tideVariant;
  if (
    typeof settings.tideDifficulty === 'string' &&
    Object.hasOwn(RAIL_DIFFICULTIES, settings.tideDifficulty)
  )
    p.settings.tideDifficulty = settings.tideDifficulty;
  for (const challenge of ['tone', 'tide'] as const) {
    if (savedPractice[challenge]) {
      const checked = validatePractice(
        practiceInput(savedPractice[challenge], challenge, profile),
        undefined,
        profile,
      );
      if (checked.valid) p.settings.practice[challenge] = checked.config;
    }
    const saved = object(records[challenge]);
    if (challenge === 'tone') {
      for (const variant of Object.keys(p.records.tone))
        p.records.tone[variant] = cleanRecord(saved[variant]);
    } else
      for (const variant of TIDE_VARIANTS)
        for (const difficulty of Object.keys(RAIL_DIFFICULTIES))
          p.records.tide[variant][difficulty] = cleanRecord(object(saved[variant])[difficulty]);
  }
  const practice = object(v.practice);
  for (const key of ['runs', 'completed', 'cleared'] as const)
    p.practice[key] = count(practice[key]);
  p.missedIds = ids(v.missedIds);
  p.confusions = Object.fromEntries(
    Object.entries(object(v.confusions))
      .filter(([key, n]) => {
        const pair = decodeTonePair(key);
        return (
          count(n) > 0 &&
          pair.length === 2 &&
          pair[0] !== pair[1] &&
          pair.every((t) => profile.tones.includes(t))
        );
      })
      .map(([key, n]) => [key, count(n)]),
  );
  return p;
}
export function loadProgress(profile: LanguageProfile, storage?: StorageLike): Progress {
  requireProfile(profile);
  try {
    const value: unknown = JSON.parse(
      storageOrNull(storage)?.getItem(profile.storageKey) ?? 'null',
    );
    return object(value).version === PROGRESS_VERSION
      ? sanitize(value, profile)
      : emptyProgress(profile);
  } catch {
    return emptyProgress(profile);
  }
}
export function saveProgress(
  profile: LanguageProfile,
  progress: Progress,
  storage?: StorageLike,
): boolean {
  requireProfile(profile);
  try {
    const target = storageOrNull(storage);
    if (!target) return false;
    target.setItem(profile.storageKey, JSON.stringify(sanitize(progress, profile)));
    return true;
  } catch {
    return false;
  }
}
export function recordRun(progress: Progress, run: Run): Progress {
  if (!run || run.recorded || !['won', 'lost', 'complete'].includes(run.status)) return progress;
  run.recorded = true;
  progress.missedIds = ids([...progress.missedIds, ...run.missedIds]);
  for (const [pair, n] of Object.entries(run.confusions))
    progress.confusions[pair] = (progress.confusions[pair] || 0) + n;
  if (run.config.practice) {
    progress.practice.runs++;
    if (run.status === 'complete') progress.practice.completed++;
    progress.practice.cleared += run.cleared;
    return progress;
  }
  const result = challengeRecord(
    progress,
    run.config.challenge,
    run.config.variant,
    run.config.difficulty,
  );
  if (!result) return progress;
  result.runs++;
  result.best = Math.max(result.best, run.opened);
  if (run.status === 'won') {
    result.wins++;
    result.fewest = result.fewest === null ? run.mistakes : Math.min(result.fewest, run.mistakes);
  }
  return progress;
}
export function resetProgress(profile: LanguageProfile, storage?: StorageLike): Progress {
  const p = emptyProgress(profile);
  saveProgress(profile, p, storage);
  return p;
}
export function challengeRecord(
  progress: Progress,
  world: Challenge,
  variant: string,
  difficulty = 'normal',
): ChallengeRecord | undefined {
  return world === 'tide'
    ? progress.records.tide[variant]?.[difficulty]
    : progress.records.tone[variant];
}
export function challengeRecords(progress: Progress, world: Challenge): ChallengeRecord[] {
  return world === 'tide'
    ? Object.values(progress.records.tide).flatMap((v) => Object.values(v))
    : Object.values(progress.records.tone);
}
