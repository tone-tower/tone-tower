import type { Challenge, Difficulty, HomeRewards, Progress } from '../types.ts';

export const homeDifficulties: readonly Difficulty[] = ['easy', 'normal', 'hard', 'extreme'];
export const rewardNames: Record<Challenge, Record<Difficulty, string>> = {
  tone: {
    easy: 'Entrance flowers',
    normal: 'Rooftop cat',
    hard: 'Summit banner',
    extreme: 'Spire dragon',
  },
  tide: {
    easy: 'Station flower boxes',
    normal: 'Station cat',
    hard: 'Ornate station clock',
    extreme: 'Golden dragon figurehead',
  },
};

// Rewards are a projection of validated saves, including wins earned before rewards existed.
// A win on one difficulty never awards another difficulty's decoration.
export function homeRewards(progress: Progress): HomeRewards {
  const earned = (world: Challenge, difficulty: Difficulty) =>
    world === 'tone'
      ? progress.records.tone[difficulty]?.wins > 0
      : Object.values(progress.records.tide).some((records) => records[difficulty]?.wins > 0);
  const forWorld = (world: Challenge): Record<Difficulty, boolean> => ({
    easy: earned(world, 'easy'),
    normal: earned(world, 'normal'),
    hard: earned(world, 'hard'),
    extreme: earned(world, 'extreme'),
  });
  return { tone: forWorld('tone'), tide: forWorld('tide') };
}
