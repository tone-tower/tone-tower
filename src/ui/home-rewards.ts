import type { Challenge, Difficulty, HomeRewards, Progress } from '../types.ts';

export const homeDifficulties: readonly Difficulty[] = ['easy', 'normal', 'hard', 'extreme'];
export const rewardNames: Record<Challenge, Record<Difficulty, string>> = {
  tone: {
    easy: 'Butterfly garden',
    normal: 'Rooftop cat',
    hard: 'Summit banner',
    extreme: 'Spire dragon',
  },
  tide: {
    easy: 'Station butterfly garden',
    normal: 'Station cat',
    hard: 'Moon heron',
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

export const friendDialogue: Record<string, readonly string[]> = {
  'tone-easy': [
    'A butterfly lands on a flower. “We followed the light from all the doors you opened.”',
    '“Which floor is spring on? We keep taking the stairs and finding more stairs.”',
  ],
  'tone-normal': [
    'The rooftop cat stretches and purrs. “I moved in after you cleared Normal Tower. The roof was included, yes?”',
    '“There is a tiny moon inside every locked door. I checked exactly one.”',
    '“I patrol both ends of this roof. Neither end has offered me dinner.”',
  ],
  'tide-easy': [
    'A butterfly flutters over the station flowers. “We planted these when you reached the last station.”',
    '“I asked the conductor for a window seat. He said I already had wings.”',
  ],
  'tide-normal': [
    'The station cat opens a sleepy eye. “After you cleared Normal Skyrail, I bought a ticket to a nap.”',
    '“The last train carried three clouds in a coat. Suspiciously punctual.”',
    '“My other sleeping spot is reserved for my future self.”',
  ],
  'tide-hard': [
    'The moon heron fans its feathers. “Your Hard Skyrail crossing woke me. I followed the rails out of a dream.”',
    '“I collect the minutes that fall between stations. Would you like a Tuesday?”',
    '“The moon is an egg. Please keep your voice down.”',
  ],
  'tone-extreme': [
    'The spire dragon opens one eye. “You cleared Extreme Tower. I suppose you may use my staircase.”',
    '“I was guarding a fearsome treasure. It appears to be a warm pebble.”',
  ],
  'tide-extreme': [
    'The golden dragon wakes with a little sparkle. “Extreme Skyrail, cleared. I shall inspect the horizon for you.”',
    '“Beyond the next cloud is another cloud. My investigation continues.”',
  ],
};
