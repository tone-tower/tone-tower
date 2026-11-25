import {
  heartDropChance,
  TOWER_HEART_CAPS,
  TOWER_LAST_HEART_CHANCES,
} from '../../src/game/heart-recovery.ts';
import { challenges } from '../../src/game/game-core.ts';
import { cantonese, mandarin, vietnamese } from '../../src/languages/profiles.ts';

export const scenarios = {
  cmn: {
    name: 'Mandarin',
    profile: mandarin,
    fullSetAccuracy: 0.9,
    weights: {
      '1:2': 2,
      '2:1': 2,
      '1:4': 3,
      '4:1': 3,
      '2:3': 6,
      '3:2': 12,
    },
  },
  yue: {
    name: 'Cantonese',
    profile: cantonese,
    fullSetAccuracy: 0.87,
    weights: { '2:5': 6, '5:2': 6, '3:6': 6, '6:3': 6, '4:6': 3, '6:4': 3 },
  },
  vi: {
    name: 'Vietnamese',
    profile: vietnamese,
    fullSetAccuracy: 0.88,
    weights: { 'huyền:ngang': 6, 'ngang:huyền': 3, 'hỏi:huyền': 6, 'hỏi:nặng': 6 },
  },
};

export const difficulties = Object.keys(TOWER_HEART_CAPS);
export const sectionLength = challenges.tone.stages[0].end;
export const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw Error(`${label} must be an object.`);
  return value;
}

function overrides(defaults, input, label, valid, range) {
  const entries = Object.entries(object(input, label));
  for (const [key, value] of entries) {
    if (!Object.hasOwn(defaults, key)) throw Error(`Unknown ${label} key: ${key}.`);
    if (!valid(value)) throw Error(`${label}.${key} must be ${range}.`);
  }
  return { ...defaults, ...Object.fromEntries(entries) };
}

const probability = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

export function balanceConfig(input = {}) {
  const raw = object(input, 'Configuration');
  for (const key of Object.keys(raw))
    if (!['fullSetAccuracy', 'heartCaps', 'lastHeartDropChance', 'failureReduction'].includes(key))
      throw Error(`Unknown configuration key: ${key}.`);
  const {
    fullSetAccuracy = {},
    heartCaps = {},
    lastHeartDropChance = {},
    failureReduction = 0.25,
  } = raw;
  if (!probability(failureReduction)) throw Error('failureReduction must be between 0 and 1.');
  return {
    fullSetAccuracy: overrides(
      Object.fromEntries(
        Object.entries(scenarios).map(([key, value]) => [key, value.fullSetAccuracy]),
      ),
      fullSetAccuracy,
      'fullSetAccuracy',
      (value) => probability(value) && value > 0,
      'greater than 0 and at most 1',
    ),
    heartCaps: overrides(
      TOWER_HEART_CAPS,
      heartCaps,
      'heartCaps',
      (value) => Number.isInteger(value) && value >= 1 && value <= challenges.tone.length,
      `an integer from 1 to ${challenges.tone.length}`,
    ),
    lastHeartDropChance: overrides(
      TOWER_LAST_HEART_CHANCES,
      lastHeartDropChance,
      'lastHeartDropChance',
      probability,
      'between 0 and 1',
    ),
    failureReduction,
  };
}

export function firstReaching(evaluate, target, lower = 0, upper = 1) {
  if (evaluate(lower) >= target) return lower;
  if (evaluate(upper) < target) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lower + upper) / 2;
    if (evaluate(mid) >= target) upper = mid;
    else lower = mid;
  }
  return upper;
}

export function accuracyModel({ profile, weights }, fullSetAccuracy) {
  const { tones } = profile;
  const maskCount = 2 ** tones.length;
  const sets = Array.from({ length: maskCount }, (_, mask) =>
    tones.filter((_, index) => mask & (1 << index)),
  );
  const weight = (heard, choice) => (heard === choice ? 0 : (weights[`${heard}:${choice}`] ?? 1));
  const accuracy = (heard, choices, scale) =>
    1 / (1 + scale * choices.reduce((total, choice) => total + weight(heard, choice), 0));
  const fullSetError = (scale) => 1 - mean(tones.map((tone) => accuracy(tone, tones, scale)));
  // The sum of the full-set decoy weights is at least 1 for every tone.
  const scale = firstReaching(fullSetError, 1 - fullSetAccuracy, 0, 1 / fullSetAccuracy);
  return profile.stageChoices.map((count) => {
    const choices = sets.filter((set) => set.length === count);
    return tones.map((tone) =>
      mean(choices.filter((set) => set.includes(tone)).map((set) => accuracy(tone, set, scale))),
    );
  });
}

export function runOdds(accuracy, { cap, lastHeartChance = 0, midpoint = false }) {
  const toneCount = accuracy[0].length;
  const maskCount = 2 ** toneCount;
  const fullBag = maskCount - 1;
  const draws = Array.from({ length: maskCount }, (_, mask) =>
    Array.from({ length: toneCount }, (_, tone) => tone).filter((tone) => mask & (1 << tone)),
  );
  const tableSize = (cap + 1) * maskCount;
  let current = new Float64Array(tableSize);
  let next = new Float64Array(tableSize);
  current[cap * maskCount + fullBag] = 1;
  const reaches = [1];
  for (let cleared = 0; cleared < accuracy.length * sectionLength; cleared++) {
    const stage = Math.floor(cleared / sectionLength);
    const position = (cleared % sectionLength) + 1;
    const endOfSection = position === sectionLength;
    const landing = endOfSection && stage < accuracy.length - 1;
    for (let lives = cap; lives > 0; lives--) {
      const base = lives * maskCount;
      const restored = Math.min(lives + 1, cap);
      const drop = endOfSection
        ? 0
        : midpoint
          ? Number(position === sectionLength / 2 && lives < cap)
          : heartDropChance(lives, cap, lastHeartChance);
      for (let bag = 1; bag < maskCount; bag++) {
        if (current[base + bag] === 0) continue;
        const mass = current[base + bag] / draws[bag].length;
        for (const tone of draws[bag]) {
          const remaining = bag ^ (1 << tone) || fullBag;
          const hit = mass * accuracy[stage][tone];
          // A miss consumes a prompt but stays on this floor with one fewer life.
          if (lives > 1) current[base - maskCount + remaining] += mass - hit;
          next[(landing ? cap * maskCount : base) + remaining] += hit * (1 - drop);
          if (drop) next[restored * maskCount + remaining] += hit * drop;
        }
      }
    }
    [current, next] = [next, current];
    next.fill(0);
    if (endOfSection) reaches.push(current.reduce((sum, mass) => sum + mass, 0));
  }
  return {
    win: reaches.at(-1),
    sectionClears: reaches.slice(1).map((reached, i) => (reaches[i] ? reached / reaches[i] : 0)),
  };
}

export function calibratedRate(models, cap, failureReduction) {
  const average = (options) =>
    mean(models.map((model) => mean(runOdds(model, options).sectionClears)));
  const baseline = average({ cap, midpoint: true });
  const target = baseline + (1 - baseline) * failureReduction;
  return {
    baseline,
    target,
    rate:
      cap === 1
        ? null
        : firstReaching((lastHeartChance) => average({ cap, lastHeartChance }), target),
  };
}
