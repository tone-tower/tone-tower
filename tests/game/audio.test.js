import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Player } from '../../src/audio/audio.ts';
test('replay interrupts the earlier clip and releases its pending promise', async () => {
  globalThis.Audio = class {
    constructor(src) {
      this.src = src;
      this.currentTime = 0;
      this.paused = true;
    }
    load() {}
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  };
  const p = new Player();
  p.preload(['a', 'b']);
  const a = p.play('a');
  await Promise.resolve();
  const b = p.play('b');
  await a;
  assert.equal(p.cache.get('a').paused, true);
  assert.equal(p.cache.get('b').paused, false);
  p.stop();
  await b;
  assert.equal(p.cache.get('b').paused, true);
});
test('blocked playback and missing recordings reject cleanly and can be retried', async () => {
  let fail = true;
  globalThis.Audio = class {
    constructor() {
      this.currentTime = 0;
    }
    load() {}
    pause() {}
    play() {
      if (fail) {
        const e = Error('Playback blocked');
        e.name = 'NotAllowedError';
        return Promise.reject(e);
      }
      return Promise.resolve();
    }
  };
  const p = new Player();
  await assert.rejects(p.play('word'), { name: 'NotAllowedError' });
  fail = false;
  const retry = p.play('word');
  await Promise.resolve();
  p.current.onended();
  await retry;
  const missing = p.play('missing');
  await Promise.resolve();
  p.current.onerror();
  await assert.rejects(missing, /Recording unavailable/);
  p.stop();
});

test('audio cache is bounded, releases evicted media, and protects the current recording', async () => {
  const released = [];
  globalThis.Audio = class {
    constructor(src) {
      this.src = src;
      this.currentTime = 0;
    }
    load() {}
    pause() {}
    removeAttribute(name) {
      if (name === 'src') {
        released.push(this.src);
        this.src = '';
      }
    }
    play() {
      return Promise.resolve();
    }
  };
  const player = new Player(8);
  const active = player.play('active');
  await Promise.resolve();
  player.preload(Array.from({ length: 20 }, (_, i) => 'word-' + i));
  assert.equal(player.cache.size, 8);
  assert.ok(player.cache.has('active'));
  assert.ok(released.length >= 13);
  assert.equal(player.current.src, 'active');
  player.stop();
  await active;
  assert.equal(player.cache.size, 8);
});
