export const shuffle = <T>(input: readonly T[], r = Math.random): T[] => {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export function buildChoices<T>(
  tone: T,
  count: number,
  pool: readonly T[],
  random = Math.random,
  allowed: readonly T[] = pool,
): T[] {
  if (
    !Number.isInteger(count) ||
    count < 2 ||
    new Set(pool).size !== pool.length ||
    !pool.every((t) => allowed.includes(t)) ||
    !pool.includes(tone) ||
    count > pool.length
  )
    throw Error('Choose enough different tones for these doors.');
  const choices = [
    tone,
    ...shuffle(
      pool.filter((t) => t !== tone),
      random,
    ).slice(0, count - 1),
  ];
  return count === 2
    ? shuffle(choices, random)
    : choices.sort((a, b) => allowed.indexOf(a) - allowed.indexOf(b));
}
