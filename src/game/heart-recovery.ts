export const TOWER_HEART_CAPS = Object.freeze({
  easy: 5,
  normal: 4,
  hard: 3,
  extreme: 2,
});

export const TOWER_LEGACY_HEART_CAPS = Object.freeze({
  easy: 5,
  normal: 4,
  hard: 3,
  extreme: 1,
});

export const TOWER_LAST_HEART_CHANCES = Object.freeze({
  easy: 0.23,
  normal: 0.23,
  hard: 0.23,
  extreme: 0.25,
});

export function heartDropChance(lives: number, maxLives: number, lastHeartChance: number): number {
  return lives > 0 && lives < maxLives
    ? (lastHeartChance * (maxLives - lives)) / (maxLives - 1)
    : 0;
}
