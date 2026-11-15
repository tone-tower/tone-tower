import { test, expect } from 'vitest';
import { cantonese, mandarin } from '../../src/languages/profiles.ts';
import { emptyProgress, loadProgress, recordRun } from '../../src/persistence/progress.ts';
import { createRun, defaultPractice } from '../../src/game/game-core.ts';
import { homeRewards } from '../../src/ui/home-rewards.ts';

test('existing saves award only completed difficulties, accumulating across Skyrail answer styles', () => {
  const saved = emptyProgress(cantonese);
  saved.records.tone.easy = { runs: 3, wins: 1, best: 100, fewest: 2 };
  saved.records.tone.extreme = { runs: 2, wins: 1, best: 100, fewest: 0 };
  saved.records.tone.hard = { runs: 1, wins: 0, best: 100, fewest: null };
  saved.records.tide.spelling.normal = { runs: 1, wins: 1, best: 100, fewest: 0 };
  saved.records.tide.full.hard = { runs: 1, wins: 1, best: 100, fewest: 0 };
  const storage = {
    getItem: (key) => (key === cantonese.storageKey ? JSON.stringify(saved) : null),
  };
  const progress = loadProgress(cantonese, storage);
  expect(homeRewards(progress)).toEqual({
    tone: { easy: true, normal: false, hard: false, extreme: true },
    tide: { easy: false, normal: true, hard: true, extreme: false },
  });
  expect(
    Object.values(homeRewards(loadProgress(mandarin, storage))).flatMap(Object.values),
  ).not.toContain(true);
  expect(progress).toEqual(saved);
});

test('completing a practice rehearsal never awards a home decoration', () => {
  const progress = emptyProgress(cantonese);
  const run = createRun(
    { ...defaultPractice('tone', cantonese), format: 'rehearsal', start: 100 },
    Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      syllables: [{ text: '字', transcription: 'zi' + (i + 1), tone: i + 1 }],
    })),
    { profile: cantonese },
  );
  run.answer(run.word.tone);
  recordRun(progress, run);
  expect(progress.practice.completed).toBe(1);
  expect(Object.values(homeRewards(progress)).flatMap(Object.values)).not.toContain(true);
});
