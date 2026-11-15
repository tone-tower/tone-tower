import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeTime } from '../helpers/fake-time.js';
import { createCountdown } from '../../src/game/game-controller.ts';
test('countdown freezes the exact remaining time and expires once', () => {
  const time = fakeTime();
  let expired = 0;
  const ticks = [];
  const clock = createCountdown({
    ...time,
    onTick: (left, total) => ticks.push([left, total]),
    onExpire: () => expired++,
  });
  clock.start(1000);
  time.advance(300);
  assert.equal(clock.remaining, 700);
  clock.pause();
  time.advance(5000);
  assert.equal(clock.remaining, 700);
  assert.equal(expired, 0);
  clock.resume();
  time.advance(699);
  assert.equal(expired, 0);
  time.advance(1);
  assert.equal(expired, 1);
  assert.equal(clock.remaining, 0);
  clock.resume();
  time.advance(1000);
  assert.equal(expired, 1);
  assert.deepEqual(ticks.at(-1), [0, 1000]);
});
