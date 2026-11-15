import { cantonese, mandarin, vietnamese } from '../../src/languages/profiles.ts';
import { test, afterEach, assert } from 'vitest';
import { fakeTime } from '../helpers/fake-time.js';
import { createCountdown, createGameController } from '../../src/game/game-controller.ts';

const words = [
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `single-${i}`,
    text: `字${i}`,
    transcription: `si${i + 1}`,
    tone: i + 1,
    syllables: [{ text: `字${i}`, transcription: `si${i + 1}`, tone: i + 1 }],
    audio: `${i}.mp3`,
    gloss: 'example',
  })),
  {
    id: 'word-1',
    text: '你好',
    transcription: 'nei5 hou2',
    audio: 'word-1.mp3',
    gloss: 'hello',
    syllables: [
      { text: '你', transcription: 'nei5', tone: 5 },
      { text: '好', transcription: 'hou2', tone: 2 },
    ],
  },
  {
    id: 'word-2',
    text: '早晨',
    transcription: 'zou2 san4',
    audio: 'word-2.mp3',
    gloss: 'morning',
    syllables: [
      { text: '早', transcription: 'zou2', tone: 2 },
      { text: '晨', transcription: 'san4', tone: 4 },
    ],
  },
];
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const mounted = [];
afterEach(() => {
  for (const h of mounted) {
    h.controller.dispose();
    h.app.remove();
    h.dialog.remove();
  }
  mounted.length = 0;
  delete document.hidden;
});
function fire(receiver, type, options = {}) {
  const { target, ...init } = options;
  const event =
    type === 'keydown'
      ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
      : new Event(type, { bubbles: true, cancelable: true, ...init });
  const node =
    target instanceof EventTarget
      ? target
      : target?.tagName
        ? document.createElement(target.tagName)
        : receiver;
  if (node !== receiver && !node.isConnected) document.body.append(node);
  node.dispatchEvent(event);
  return event;
}
function harness(extra = {}, recordings = words, profile = cantonese) {
  const time = fakeTime();
  let hidden = false;
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
    set: (value) => {
      hidden = value;
    },
  });
  const app = document.createElement('main'),
    dialog = document.createElement('dialog');
  document.body.append(app, dialog);
  let current = null;
  const requests = [];
  const player = {
    preload() {},
    stop() {
      current?.resolve();
      current = null;
    },
    play(path) {
      this.stop();
      return new Promise((resolve, reject) => {
        current = { path, resolve, reject };
        requests.push(current);
      });
    },
  };
  const finished = [],
    homes = [];
  const controller = createGameController({
    profile,
    app,
    player,
    dialog,
    words: recordings,
    anchors: words.slice(0, 6).map((word) => ({ ...word, anchor: true })),
    onFinish: (run) => finished.push(run),
    onHome: () => homes.push(true),
    environment: {
      ...time,
      document,
      animateWorld: (canvas) => ({ canvas, update() {}, dispose() {} }),
      ...extra,
    },
  });
  mounted.push({ controller, app, dialog });
  return {
    time,
    document,
    app,
    dialog,
    player,
    requests,
    controller,
    finished,
    homes,
    click(id) {
      app.querySelector(id).click();
    },
    audio() {
      if (!current) time.advance(2000);
      requests.at(-1).resolve();
    },
  };
}

test('Tide starts after audio, replay never resets time, and timeout costs one life', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide', variant: 'spelling' });
  assert.strictEqual(h.controller.phase, 'listening');
  assert.match(h.app.innerHTML, /To the gap/);
  assert.notMatch(h.app.innerHTML, /Untimed practice/);
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '15s');
  const mountedInput = h.app.querySelector('#transcription-answer');
  h.time.advance(30000);
  assert.strictEqual(h.controller.state.mistakes, 0);
  h.audio();
  await flush();
  assert.strictEqual(h.controller.phase, 'answering');
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '15s');
  assert.strictEqual(h.app.querySelector('#transcription-answer'), mountedInput);
  assert.strictEqual(h.app.querySelector('#rail-message').textContent, '');
  assert.strictEqual(h.app.querySelector('.world-scene').dataset.phase, 'answering');
  h.time.advance(5000);
  h.click('#replay-word');
  h.time.advance(5000);
  h.audio();
  await flush();
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '5s');
  h.time.advance(5000);
  assert.strictEqual(h.controller.phase, 'review');
  assert.strictEqual(h.controller.state.lives, 3);
  assert.strictEqual(h.controller.state.opened, 0);
  h.time.advance(60000);
  assert.strictEqual(h.controller.state.mistakes, 1);
  h.click('#continue-game');
  h.audio();
  await flush();
  assert.strictEqual(h.controller.phase, 'answering');
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '15s');
  assert.strictEqual(h.app.querySelector('#transcription-answer').value, '');
  h.controller.dispose();
});

test('pause, hidden pages and dialogs freeze time and keep typed text', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  h.audio();
  await flush();
  h.time.advance(5000);
  h.app.querySelector('#transcription-answer').value = 'my answer';
  h.controller.pause();
  h.time.advance(30000);
  assert.strictEqual(h.controller.state.mistakes, 0);
  assert.strictEqual(h.app.querySelector('#transcription-answer').value, 'my answer');
  h.controller.resume();
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '10s');
  h.document.hidden = true;
  fire(h.document, 'visibilitychange');
  h.time.advance(30000);
  assert.strictEqual(h.controller.state.mistakes, 0);
  h.controller.resume();
  assert.ok(h.app.querySelector('#resume-game'));
  h.document.hidden = false;
  h.controller.resume();
  h.dialog.open = true;
  h.controller.pause('dialog');
  h.time.advance(30000);
  assert.strictEqual(h.controller.state.mistakes, 0);
  h.dialog.open = false;
  fire(h.dialog, 'close');
  h.time.advance(20000);
  assert.strictEqual(h.controller.state.mistakes, 1);
  h.controller.dispose();
});

test('typing permits spaces, auto-checks only correct input and locks a cleared answer', async () => {
  const h = harness();
  h.controller.start({
    challenge: 'tide',
    variant: 'full',
    practice: true,
    content: 'multi',
    target: 'whole',
    length: 10,
    timer: 'custom',
    seconds: 30,
  });
  h.audio();
  await flush();
  let input = h.app.querySelector('#transcription-answer');
  input.value = 'wrong';
  fire(input, 'input');
  assert.strictEqual(h.controller.state.guesses, 0);
  assert.strictEqual(h.controller.state.mistakes, 0);
  const requests = h.requests.length,
    key = fire(h.document, 'keydown', { key: ' ', target: input });
  assert.strictEqual(key.defaultPrevented, true);
  assert.strictEqual(h.requests.length, requests + 1);
  h.audio();
  await flush();
  input.value = h.controller.state.expected();
  fire(input, 'input');
  assert.strictEqual(h.controller.state.cleared, 1);
  assert.strictEqual(h.controller.phase, 'correct');
  fire(input, 'input');
  h.time.advance(899);
  assert.strictEqual(h.controller.state.cleared, 1);
  h.time.advance(1);
  assert.strictEqual(h.controller.phase, 'listening');
  assert.strictEqual(h.app.querySelector('#transcription-answer').value, '');
  h.controller.dispose();
});

test('failed replay freezes its remaining time and replacement is unscored', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  h.audio();
  await flush();
  h.time.advance(5000);
  h.click('#replay-word');
  h.requests.at(-1).reject(Error('unavailable'));
  await flush();
  h.time.advance(60000);
  assert.strictEqual(h.controller.state.mistakes, 0);
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '10s');
  assert.ok(h.app.querySelector('#replace-recording'));
  h.click('#replace-recording');
  assert.strictEqual(h.controller.state.attempts, 0);
  assert.strictEqual(h.controller.state.opened, 0);
  h.audio();
  await flush();
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '15s');
  h.controller.dispose();
});

test('timeout costs one life, stale audio cannot reactivate a disposed run, and practice can end', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  h.audio();
  await flush();
  h.app.querySelector('#transcription-answer').value = 'partial';
  h.time.advance(15000);
  assert.strictEqual(h.controller.state.lives, 3);
  assert.strictEqual(h.controller.state.lastAnswer, 'partial');
  h.click('#replay-word');
  const pending = h.requests.at(-1);
  h.controller.dispose();
  pending.resolve();
  await flush();
  h.time.advance(60000);
  assert.strictEqual(h.controller.active, false);
  assert.strictEqual(h.controller.state.mistakes, 1);
  h.controller.start({ challenge: 'tone', practice: true, length: 'endless' });
  h.audio();
  await flush();
  h.click('#finish-practice');
  assert.strictEqual(h.finished.length, 1);
  assert.strictEqual(h.finished[0].status, 'complete');
  assert.strictEqual(h.controller.active, false);
});

test('tone keyboard choices score once and a paused run cannot accept answers', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tone', variant: 'extreme' });
  h.audio();
  await flush();
  const right = h.controller.state.word.tone;
  fire(h.document, 'keydown', { key: String(right), repeat: true, target: { tagName: 'BODY' } });
  assert.strictEqual(h.controller.state.cleared, 0);
  h.controller.pause();
  fire(h.document, 'keydown', { key: String(right), target: { tagName: 'BODY' } });
  assert.strictEqual(h.controller.state.cleared, 0);
  h.controller.resume();
  fire(h.document, 'keydown', { key: String(right), target: { tagName: 'BODY' } });
  fire(h.document, 'keydown', { key: String(right), target: { tagName: 'BODY' } });
  assert.strictEqual(h.controller.state.cleared, 1);
  assert.strictEqual(h.controller.state.attempts, 1);
  h.controller.dispose();
});

test('a terminal mistake records once and offers retry in the same scene after its animation', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tone', variant: 'extreme' });
  h.audio();
  await flush();
  const wrong = h.controller.state.choices.find((tone) => tone !== h.controller.state.word.tone);
  fire(h.document, 'keydown', { key: String(wrong), target: { tagName: 'BODY' } });
  assert.strictEqual(h.controller.state.status, 'lost');
  assert.strictEqual(h.finished.length, 1);
  assert.strictEqual(h.controller.active, true);
  assert.ok(h.app.querySelector('.run-conclusion'));
  assert.strictEqual(h.app.querySelector('#continue-game'), null);
  assert.strictEqual(h.app.querySelector('#retry-run').disabled, true);
  h.time.advance(2800);
  assert.strictEqual(h.app.querySelector('#retry-run').disabled, false);
  assert.strictEqual(h.app.querySelectorAll('.scene-frame').length, 1);
  fire(h.document, 'keydown', { key: 'Enter', target: { tagName: 'BODY' } });
  h.time.advance(60000);
  assert.strictEqual(h.finished.length, 1);
  assert.strictEqual(h.controller.active, true);
  h.controller.dispose();
});

test('switching runs rejects delayed audio callbacks from the previous prompt', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  const previous = h.requests.at(-1);
  h.controller.start({ challenge: 'tone' });
  previous.resolve();
  await flush();
  assert.strictEqual(h.controller.phase, 'listening');
  assert.strictEqual(h.requests.length, 1, 'The old callback cannot start the new recording');
  assert.strictEqual(h.app.querySelector('[data-tone]').disabled, true);
  h.audio();
  await flush();
  assert.strictEqual(h.controller.phase, 'answering');
  assert.strictEqual(h.app.querySelector('[data-tone]').disabled, false);
  h.controller.dispose();
  assert.strictEqual(h.time.pending, 0);
});

test.each(['click', 'Enter'])(
  'Skyrail checkpoints depart on the first %s without a Tower delay',
  async (action) => {
    const recordings = Array.from({ length: 120 }, (_, i) => ({
      ...words[i % words.length],
      id: 'checkpoint-' + i,
    }));
    const h = harness({}, recordings);
    h.controller.start({ challenge: 'tide', variant: 'spelling' });
    for (let span = 1; span <= 20; span++) {
      h.audio();
      await flush();
      const input = h.app.querySelector('#transcription-answer');
      input.value = h.controller.state.expectedParts().map(cantonese.withoutTones).join(' ');
      fire(input, 'input');
      if (span < 20) h.time.advance(900);
    }
    assert.strictEqual(h.controller.phase, 'landing');
    const depart = h.app.querySelector('#continue-game');
    assert.strictEqual(depart.disabled, false);
    const requests = h.requests.length;
    if (action === 'click') depart.click();
    else fire(depart, 'keydown', { key: 'Enter' });
    assert.strictEqual(h.controller.phase, 'listening');
    assert.strictEqual(h.controller.state.opened, 20);
    assert.strictEqual(h.requests.length, requests + 1);
    assert.strictEqual(h.app.querySelector('#continue-game'), null);
  },
);

test('Skyrail landings and progress describe spans', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide', practice: true, format: 'rehearsal', start: 20 });
  h.audio();
  await flush();
  const input = h.app.querySelector('#transcription-answer');
  input.value = h.controller.state.expected();
  fire(input, 'input');
  assert.strictEqual(h.controller.phase, 'landing');
  assert.match(h.app.innerHTML, /20 spans crossed/);
  assert.match(h.app.innerHTML, /Depart when ready/);
  assert.notMatch(h.app.innerHTML, /Continue the ascent/);
  h.controller.dispose();
});

test('Tower removes in-game references and Space replays without scoring or choosing a door', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tone' });
  h.audio();
  await flush();
  assert.strictEqual(h.app.querySelector('#show-reference'), null);
  assert.strictEqual(h.app.querySelector('[data-reference-tone]'), null);
  const requests = h.requests.length,
    event = fire(h.document, 'keydown', { key: ' ', target: { tagName: 'BUTTON' } });
  assert.strictEqual(event.defaultPrevented, true);
  assert.strictEqual(h.requests.length, requests + 1);
  assert.strictEqual(h.controller.state.attempts, 0);
  h.audio();
  await flush();
  const wrong = h.controller.state.choices.find((t) => t !== h.controller.state.word.tone);
  fire(h.document, 'keydown', { key: String(wrong), target: { tagName: 'BODY' } });
  assert.strictEqual(h.app.querySelector('.reference-grid'), null);
  assert.ok(h.app.querySelector('.answer-mark'));
  h.controller.dispose();
});

import { arrowChoiceIndex } from '../../src/game/game-controller.ts';
test('three and four door arrows select the matching spatial door', async () => {
  for (const [count, start, keys] of [
    [3, 21, ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']],
    [4, 41, ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']],
  ]) {
    for (const key of keys) {
      const h = harness();
      h.controller.start({ challenge: 'tone', practice: true, format: 'rehearsal', start });
      h.audio();
      await flush();
      assert.strictEqual(h.controller.state.choices.length, count);
      const expected = h.controller.state.choices[arrowChoiceIndex(count, key)];
      const event = fire(h.document, 'keydown', { key, target: { tagName: 'BODY' } });
      assert.strictEqual(event.defaultPrevented, true);
      assert.strictEqual(h.controller.state.lastAnswer, expected);
      h.controller.dispose();
    }
  }
  assert.strictEqual(arrowChoiceIndex(6, 'ArrowLeft'), null);
});
test('review keeps one question in the same scene and retains typing controls', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  h.audio();
  await flush();
  const structure = () => ({
    questions: h.app.querySelectorAll('.scene-question').length,
    prompts: h.app.querySelectorAll('.word-prompt').length,
    forms: h.app.querySelectorAll('#typed-form').length,
    frames: h.app.querySelectorAll('.scene-frame').length,
  });
  const before = structure();
  assert.deepEqual(before, { questions: 1, prompts: 1, forms: 1, frames: 1 });
  h.app.querySelector('#transcription-answer').value = 'unfinished';
  h.time.advance(15000);
  assert.deepEqual(structure(), before);
  assert.strictEqual(h.app.querySelector('#transcription-answer').value, 'unfinished');
  assert.strictEqual(h.app.querySelector('#transcription-answer').disabled, true);
  assert.ok(h.app.querySelector('.scene-status'));
  assert.ok(h.app.querySelector('.game-progress-label'));
  h.controller.dispose();
});

test('retry feedback clears on editing and timeout stays full until next prompt', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  h.audio();
  await flush();
  const input = h.app.querySelector('#transcription-answer');
  input.value = 'zzz';
  fire(input, 'input');
  fire(h.app.querySelector('#typed-form'), 'submit');
  assert.strictEqual(h.app.dataset.outcome, 'retry');
  assert.strictEqual(h.document.activeElement, input);
  assert.match(h.app.querySelector('#input-status').textContent, /No life lost/);
  const lives = h.controller.state.lives;
  input.value = 'zz';
  fire(input, 'input');
  assert.strictEqual(h.app.dataset.outcome, 'answering');
  assert.notMatch(h.app.querySelector('#input-status').textContent, /Not quite/);
  h.time.advance(25000);
  assert.strictEqual(h.app.dataset.outcome, 'timeout');
  assert.strictEqual(h.controller.state.lives, lives - 1);
  assert.strictEqual(
    h.app.querySelector('.world-scene').style.getPropertyValue('--rail-progress'),
    '100%',
  );
  assert.notMatch(h.app.innerHTML, /Not quite—try again/);
  assert.match(h.app.innerHTML, /Connection missed — 1 life lost/);
  h.click('#continue-game');
  assert.strictEqual(h.app.dataset.outcome, 'listening');
  assert.strictEqual(
    h.app.querySelector('.world-scene').style.getPropertyValue('--rail-progress'),
    '0%',
  );
  h.controller.dispose();
});
test('wrong door marks the correct answer without a success door', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tone' });
  h.audio();
  await flush();
  const right = h.controller.state.word.tone,
    wrong = h.controller.state.choices.find((t) => t !== right);
  fire(h.document, 'keydown', { key: String(wrong), target: { tagName: 'BODY' } });
  assert.strictEqual(h.app.dataset.outcome, 'wrong');
  assert.ok(h.app.querySelector('.is-wrong'));
  assert.ok(h.app.querySelector('.is-answer'));
  assert.strictEqual(h.app.querySelector('.is-correct'), null);
  assert.match(h.app.innerHTML, /bright door/);
  h.click('#continue-game');
  assert.strictEqual(h.app.querySelector('.is-wrong'), null);
  h.audio();
  await flush();
  fire(h.document, 'keydown', {
    key: String(h.controller.state.word.tone),
    target: { tagName: 'BODY' },
  });
  assert.strictEqual(h.app.dataset.outcome, 'success');
  assert.ok(h.app.querySelector('.is-correct'));
  h.controller.dispose();
});
test('Skyrail has no reveal or bottom sound guide, and retry stays available', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  h.audio();
  await flush();
  assert.strictEqual(h.app.querySelector('#reveal-answer'), null);
  assert.strictEqual(h.app.querySelector('#game-learn'), null);
  const input = h.app.querySelector('#transcription-answer');
  input.value = 'zzz';
  fire(h.app.querySelector('#typed-form'), 'submit');
  assert.strictEqual(input.disabled, false);
  assert.strictEqual(h.controller.phase, 'answering');
  assert.strictEqual(h.controller.state.lives, 4);
  h.controller.dispose();
});

test('R replays from the spelling field without changing input or the remaining time', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  h.audio();
  await flush();
  h.time.advance(4000);
  const input = h.app.querySelector('#transcription-answer');
  input.value = 'fu';
  fire(input, 'input');
  const attempts = h.controller.state.attempts,
    requests = h.requests.length;
  const event = fire(h.document, 'keydown', { key: 'r', target: input });
  assert.strictEqual(event.defaultPrevented, true);
  assert.strictEqual(h.requests.length, requests + 1);
  assert.strictEqual(input.value, 'fu');
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '11s');
  assert.strictEqual(h.controller.state.attempts, attempts);
  fire(h.document, 'keydown', { key: 'r', target: input, isComposing: true });
  fire(h.document, 'keydown', { key: 'r', target: input, ctrlKey: true });
  assert.strictEqual(h.requests.length, requests + 1);
  h.controller.dispose();
});

test('Skyrail gives each crossing 900ms, keeps typing enabled, and leaves checkpoints deliberate', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide', practice: true, length: 10 });
  h.audio();
  await flush();
  const oldId = h.controller.state.word.id,
    input = h.app.querySelector('#transcription-answer');
  input.value = h.controller.state.expected();
  fire(input, 'input');
  assert.strictEqual(h.controller.phase, 'correct');
  assert.strictEqual(h.app.querySelector('#transcription-answer').disabled, false);
  h.time.advance(899);
  assert.strictEqual(h.controller.phase, 'correct');
  h.time.advance(1);
  assert.strictEqual(h.controller.phase, 'listening');
  assert.notStrictEqual(h.controller.state.word.id, oldId);
  assert.strictEqual(h.app.querySelector('#transcription-answer').value, '');
  h.audio();
  await flush();
  assert.strictEqual(h.controller.phase, 'answering');
  h.controller.dispose();
  h.controller.start({ challenge: 'tide', practice: true, format: 'rehearsal', start: 20 });
  h.audio();
  await flush();
  h.app.querySelector('#transcription-answer').value = h.controller.state.expected();
  fire(h.app.querySelector('#typed-form'), 'submit');
  assert.strictEqual(h.controller.phase, 'landing');
  assert.match(h.app.innerHTML, /Station reached/);
  assert.match(h.app.innerHTML, /Climber car/);
  h.time.advance(10000);
  assert.strictEqual(h.controller.phase, 'landing');
  h.click('#continue-game');
  assert.strictEqual(h.controller.phase, 'listening');
  h.controller.dispose();
});

test('audio recovery clears unavailable and retry styling without resetting the remaining clock', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide' });
  h.audio();
  await flush();
  h.time.advance(4000);
  const input = h.app.querySelector('#transcription-answer');
  input.value = 'zzz';
  fire(input, 'input');
  fire(h.app.querySelector('#typed-form'), 'submit');
  assert.match(h.app.querySelector('#rail-message').textContent, /No life lost/);
  input.value = 'zz';
  fire(input, 'input');
  assert.strictEqual(h.app.querySelector('.rail-feedback').dataset.feedback, 'neutral');
  assert.notMatch(h.app.querySelector('#rail-message').textContent, /Not quite/);
  h.click('#replay-word');
  h.requests.at(-1).reject(Error('offline'));
  await flush();
  assert.strictEqual(h.app.dataset.outcome, 'unavailable');
  assert.match(h.app.innerHTML, /Clock stopped/);
  assert.ok(h.app.querySelector('#replace-recording'));
  h.time.advance(30000);
  h.click('#replay-word');
  h.audio();
  await flush();
  assert.strictEqual(h.app.dataset.outcome, 'answering');
  assert.strictEqual(h.app.querySelector('#replace-recording'), null);
  assert.strictEqual(h.app.querySelector('#countdown').textContent, '11s');
  assert.strictEqual(h.app.querySelector('#transcription-answer').value, 'zz');
  assert.strictEqual(h.controller.state.lives, 4);
  h.controller.dispose();
});

test('Tower checkpoints name the next district, restore lives and wait for Continue', async () => {
  const h = harness();
  h.controller.start({
    challenge: 'tone',
    practice: true,
    format: 'rehearsal',
    start: 20,
    lives: 'standard',
  });
  h.audio();
  await flush();
  h.controller.state.lives = 1;
  fire(h.document, 'keydown', {
    key: String(h.controller.state.word.tone),
    target: { tagName: 'BODY' },
  });
  assert.strictEqual(h.controller.phase, 'landing');
  assert.strictEqual(h.controller.state.lives, h.controller.state.maxLives);
  assert.ok(h.app.innerHTML.includes('20 floors lit · A rest landing'));
  assert.match(h.app.innerHTML, /Next: Rain Gallery · 3 doors/);
  assert.match(h.app.innerHTML, /Lives refilled/);
  assert.strictEqual(h.app.querySelector('#continue-game').disabled, true);
  h.click('#continue-game');
  assert.strictEqual(h.controller.phase, 'landing');
  assert.match(h.app.innerHTML, /lives restored/);
  assert.strictEqual(h.app.querySelectorAll('#continue-game').length, 1);
  h.time.advance(10000);
  assert.strictEqual(h.controller.phase, 'landing');
  h.click('#continue-game');
  assert.strictEqual(h.controller.state.choices.length, 3);
  assert.strictEqual(h.controller.state.opened, 20);
  h.controller.dispose();
});

test('Tower audio failure uses the fixed notice and replacement never awards a floor', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tone' });
  h.click('#replay-word');
  h.requests.at(-1).reject(Error('offline'));
  await flush();
  assert.match(h.app.innerHTML, /Recording unavailable/);
  assert.strictEqual(h.app.querySelectorAll('#replace-recording').length, 1);
  const lives = h.controller.state.lives;
  h.click('#replace-recording');
  assert.strictEqual(h.controller.state.opened, 0);
  assert.strictEqual(h.controller.state.lives, lives);
  h.audio();
  await flush();
  assert.strictEqual(h.app.querySelector('#replace-recording'), null);
  assert.strictEqual(
    h.app.querySelector('#tower-message').textContent,
    'Listen to the highlighted syllable and choose its tone.',
  );
  h.controller.dispose();
});

test('awarding progress during clock.pause cannot advance the displayed room before the door walk', async () => {
  const updates = [],
    h = harness({
      animateWorld: (canvas) => ({
        canvas,
        update: (state) => updates.push({ ...state }),
        dispose() {},
      }),
    });
  h.controller.start({ challenge: 'tone' });
  h.audio();
  await flush();
  fire(h.document, 'keydown', {
    key: String(h.controller.state.word.tone),
    target: { tagName: 'BODY' },
  });
  const finalTick = updates.find((s) => s.phase === 'answering' && s.progress === 1);
  assert.ok(finalTick);
  assert.strictEqual(finalTick.floor, 0);
  assert.ok(updates.filter((s) => s.phase === 'correct').every((s) => s.floor === 0));
  h.time.advance(1699);
  assert.strictEqual(h.controller.phase, 'correct');
  h.time.advance(1);
  assert.strictEqual(h.controller.phase, 'listening');
  assert.strictEqual(updates.at(-1).floor, 1);
  h.controller.dispose();
});

test('a Tower ending waits for an explicit action, including after pause and resume', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tone', practice: true, format: 'rehearsal', start: 100 });
  h.audio();
  await flush();
  fire(h.document, 'keydown', {
    key: String(h.controller.state.word.tone),
    target: { tagName: 'BODY' },
  });
  assert.strictEqual(h.controller.state.status, 'complete');
  assert.strictEqual(h.finished.length, 0);
  assert.ok(h.app.querySelector('.tower-run-end'));
  fire(h.document, 'keydown', { key: 'Enter', target: { tagName: 'BODY' } });
  assert.strictEqual(h.finished.length, 0);
  h.controller.pause();
  h.time.advance(5000);
  h.controller.resume();
  h.time.advance(2800);
  assert.strictEqual(h.finished.length, 0);
  h.time.advance(60000);
  assert.strictEqual(h.finished.length, 0);
  fire(h.document, 'keydown', { key: 'Enter', target: { tagName: 'BODY' } });
  assert.strictEqual(h.finished.length, 1);
});

test('a full Tower victory stays in one scene and records without a second ending page', async () => {
  const recordings = Array.from({ length: 120 }, (_, i) => ({
      ...words[i % 6],
      id: 'full-climb-' + i,
    })),
    h = harness({}, recordings);
  h.controller.start({ challenge: 'tone' });
  for (let floor = 1; floor <= 100; floor++) {
    h.audio();
    await flush();
    fire(h.document, 'keydown', {
      key: String(h.controller.state.word.tone),
      target: { tagName: 'BODY' },
    });
    if (floor < 100) {
      if (floor % 20 === 0) {
        h.time.advance(2400);
        h.click('#continue-game');
      } else h.time.advance(1700);
    }
  }
  assert.strictEqual(h.controller.state.status, 'won');
  assert.match(h.app.innerHTML, /The whole tower is alight/);
  assert.strictEqual(h.finished.length, 1);
  assert.strictEqual(h.controller.active, true);
  assert.strictEqual(h.app.querySelector('#continue-game'), null);
  assert.ok(h.app.querySelector('.run-conclusion'));
  h.time.advance(60000);
  assert.strictEqual(h.finished.length, 1);
  assert.strictEqual(h.app.querySelector('#retry-run').disabled, false);
  h.controller.dispose();
});

test('a Skyrail terminal timeout stays in-scene, records once, and never starts a new prompt', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tide', difficulty: 'extreme' });
  h.audio();
  await flush();
  h.time.advance(15000);
  assert.strictEqual(h.controller.state.status, 'lost');
  assert.strictEqual(h.finished.length, 1);
  assert.ok(h.app.querySelector('.run-conclusion'));
  assert.strictEqual(h.app.querySelector('#continue-game'), null);
  const requests = h.requests.length;
  h.time.advance(60000);
  assert.strictEqual(h.requests.length, requests);
  assert.strictEqual(h.finished.length, 1);
  assert.strictEqual(h.controller.active, true);
  h.controller.dispose();
});

test('Tower progress exposes the full height while Skyrail retains its journey readout', async () => {
  for (const challenge of ['tone', 'tide']) {
    const h = harness();
    h.controller.start({ challenge });
    h.audio();
    await flush();
    if (challenge === 'tone') assert.match(h.app.innerHTML, /0 \/ 100 floors lit/);
    else assert.notMatch(h.app.innerHTML, /of 100|\/ 100|aria-valuemax="100"/);
    h.controller.dispose();
  }
});

test('Tower plays after the entrance and keeps the pace between floors', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tone', variant: 'normal' });
  assert.strictEqual(h.controller.phase, 'listening');
  assert.strictEqual(h.app.querySelector('[data-tone]').disabled, true);
  assert.match(h.app.innerHTML, /Entering the tower/);
  h.time.advance(1999);
  assert.strictEqual(h.requests.length, 0);
  h.time.advance(1);
  assert.strictEqual(h.requests.length, 1);
  assert.strictEqual(h.requests[0].path, h.controller.state.word.audio);
  assert.notMatch(h.app.innerHTML, /Entering the tower/);
  h.audio();
  await flush();
  assert.strictEqual(h.controller.phase, 'answering');
  assert.strictEqual(h.app.querySelector('[data-tone]').disabled, false);
  fire(h.document, 'keydown', {
    key: String(h.controller.state.word.tone),
    target: { tagName: 'BODY' },
  });
  h.time.advance(1699);
  assert.strictEqual(h.controller.phase, 'correct');
  h.time.advance(1);
  assert.strictEqual(h.controller.phase, 'listening');
  assert.strictEqual(
    h.requests.length,
    2,
    'The next sound follows the door crossing automatically',
  );
  h.controller.dispose();
});

test('pausing or leaving the Tower entrance cancels its pending audio', () => {
  const h = harness();
  h.controller.start({ challenge: 'tone' });
  h.time.advance(1000);
  h.controller.pause();
  h.time.advance(60000);
  assert.strictEqual(h.requests.length, 0);
  h.controller.resume();
  h.time.advance(1999);
  assert.strictEqual(h.requests.length, 0);
  h.time.advance(1);
  assert.strictEqual(h.requests.length, 1);
  h.controller.start({ challenge: 'tone' });
  h.controller.dispose();
  h.time.advance(60000);
  assert.strictEqual(h.requests.length, 1);
  assert.strictEqual(h.time.pending, 0);
});

test('Tower offers missed-sound practice only after the run fails', async () => {
  const h = harness();
  h.controller.start({ challenge: 'tone', variant: 'hard' });
  for (let miss = 1; miss <= 3; miss++) {
    h.audio();
    await flush();
    fire(h.document, 'keydown', {
      key: String(h.controller.state.choices.find((t) => t !== h.controller.state.word.tone)),
      target: { tagName: 'BODY' },
    });
    assert.strictEqual(h.app.querySelector('#practise-mistakes'), null);
    if (miss < 3) {
      assert.strictEqual(h.app.querySelector('#ending-practice'), null);
      assert.strictEqual(h.controller.state.status, 'playing');
      h.click('#continue-game');
    }
  }
  assert.strictEqual(h.controller.state.status, 'lost');
  assert.ok(h.app.querySelector('#ending-practice'));
  assert.strictEqual(h.app.querySelector('#ending-practice').disabled, true);
  h.time.advance(2800);
  assert.strictEqual(h.app.querySelector('#ending-practice').disabled, false);
  h.controller.dispose();
});

test('practice uses its own starting scene with fixed progress and a finish action for either skill', async () => {
  for (const challenge of ['tone', 'tide']) {
    const snapshots = [];
    const h = harness({
      animateWorld: (canvas) => ({
        canvas,
        update: (state) => snapshots.push(state),
        dispose() {},
      }),
    });
    h.controller.start({
      challenge,
      practice: true,
      length: 20,
      content: 'single',
      timer: 'off',
      lives: 'unlimited',
    });
    h.audio();
    await flush();
    assert.match(h.app.innerHTML, challenge === 'tone' ? /Practice tones/ : /Practice spelling/);
    assert.ok(h.app.querySelector('#finish-practice'));
    for (let i = 0; i < 21; i++) {
      assert.strictEqual(snapshots.at(-1).scene, challenge === 'tone' ? 'tone' : 'rail');
      assert.strictEqual(snapshots.at(-1).progress, 0);
      assert.strictEqual(snapshots.at(-1).floor, 0);
      assert.strictEqual(snapshots.at(-1).timed, false);
      if (i === 20) break;
      if (challenge === 'tone')
        fire(h.document, 'keydown', {
          key: String(h.controller.state.word.tone),
          target: { tagName: 'DIV' },
        });
      else {
        const input = h.app.querySelector('#transcription-answer');
        input.value = h.controller.state.expected();
        fire(input, 'input');
      }
      if (i < 19) {
        h.time.advance(900);
        h.audio();
        await flush();
      }
    }
    assert.strictEqual(h.controller.state.status, 'complete');
    h.controller.dispose();
  }
});

test('focused Skyrail practice auto-checks only the selected word parts', async () => {
  for (const spellingFocus of ['initials', 'finals']) {
    const h = harness();
    h.controller.start({
      challenge: 'tide',
      practice: true,
      spellingFocus,
      variant: 'full',
      content: 'multi',
      target: 'whole',
      length: 20,
    });
    h.audio();
    await flush();
    const input = h.app.querySelector('#transcription-answer');
    input.value = h.controller.state.expected();
    fire(input, 'input');
    assert.strictEqual(h.controller.state.cleared, 1);
    assert.strictEqual(h.controller.phase, 'correct');
    h.controller.dispose();
  }
});

test('a wrong final practice question completes the set and can open results', async () => {
  for (const challenge of ['tone', 'tide']) {
    const h = harness();
    h.controller.start({ challenge, practice: true, length: 10 });
    h.audio();
    await flush();
    for (let i = 0; i < 9; i++) {
      if (challenge === 'tone')
        fire(h.document, 'keydown', {
          key: String(h.controller.state.word.tone),
          target: { tagName: 'DIV' },
        });
      else {
        const input = h.app.querySelector('#transcription-answer');
        input.value = h.controller.state.expected();
        fire(input, 'input');
      }
      h.time.advance(900);
      h.audio();
      await flush();
    }
    if (challenge === 'tone')
      fire(h.document, 'keydown', {
        key: String(h.controller.state.choices.find((t) => t !== h.controller.state.word.tone)),
        target: { tagName: 'DIV' },
      });
    else {
      h.app.querySelector('#transcription-answer').value = 'incorrect';
      fire(h.app.querySelector('#typed-form'), 'submit');
    }
    assert.strictEqual(h.controller.state.status, 'complete');
    assert.strictEqual(h.controller.state.attempts, 10);
    assert.strictEqual(h.controller.state.cleared, 9);
    assert.strictEqual(h.controller.phase, 'review');
    assert.match(h.app.innerHTML, /10 \/ 10/);
    if (challenge === 'tone') h.time.advance(2400);
    h.click('#continue-game');
    assert.strictEqual(h.finished.length, 1);
    h.controller.dispose();
  }
});

const greeting = [
  {
    id: 'greeting',
    text: '你好',
    transcription: 'ni3 hao3',
    audio: 'greeting.mp3',
    syllables: [
      { text: '你', transcription: 'ni3', dictionaryTone: 3, tone: 2 },
      { text: '好', transcription: 'hao3', dictionaryTone: 3, tone: 3 },
    ],
  },
];
test('Mandarin feedback explains heard tones without exposing tone marks before answering', async () => {
  const h = harness({}, greeting, mandarin);
  h.controller.start({
    challenge: 'tone',
    practice: true,
    content: 'multi',
    focusIds: ['greeting'],
    tones: [2, 4],
  });
  h.audio();
  await flush();
  assert.notMatch(h.app.innerHTML, /nǐ|hǎo|Dictionary spelling/);
  assert.strictEqual(h.app.querySelector('.recording-report'), null);
  fire(h.document, 'keydown', { key: '2', target: { tagName: 'BODY' } });
  assert.match(h.app.innerHTML, /Written nǐ hǎo; listening answer ní hǎo/);
  assert.match(h.app.innerHTML, /A third tone changes before another third tone/);
  assert.ok(h.app.querySelector('.recording-report'));
  assert.match(h.app.querySelector('.recording-report').getAttribute('href'), /greeting/);
  h.controller.dispose();
});
test('Mandarin replays with Space while preserving Pinyin r and composition', async () => {
  const h = harness({}, greeting, mandarin);
  h.controller.start({
    challenge: 'tide',
    practice: true,
    variant: 'full',
    content: 'multi',
    target: 'whole',
  });
  h.audio();
  await flush();
  const input = h.app.querySelector('#transcription-answer'),
    requests = h.requests.length;
  input.value = 'r';
  for (const init of [
    { key: 'r' },
    { key: ' ', isComposing: true },
    { key: 'r', altKey: true },
    { key: ' ', ctrlKey: true },
  ])
    assert.strictEqual(
      fire(h.document, 'keydown', { ...init, target: input }).defaultPrevented,
      false,
    );
  assert.strictEqual(h.requests.length, requests);
  for (const init of [{ key: ' ' }]) {
    assert.strictEqual(
      fire(h.document, 'keydown', { ...init, target: input }).defaultPrevented,
      true,
    );
    assert.strictEqual(input.value, 'r');
    h.audio();
    await flush();
  }
  assert.strictEqual(h.requests.length, requests + 1);
  assert.strictEqual(h.controller.state.attempts, 0);
  fire(input, 'compositionstart');
  input.value = 'nǐ hǎo';
  fire(input, 'input');
  assert.strictEqual(h.controller.state.cleared, 0);
  fire(h.app.querySelector('#typed-form'), 'submit');
  assert.strictEqual(h.controller.state.cleared, 0);
  fire(input, 'compositionend');
  assert.strictEqual(h.controller.state.cleared, 1);
  h.controller.dispose();
});
test('changing the Mandarin script during a run preserves input, timing, and scoring', async () => {
  const recordings = [
    {
      id: 'mother',
      forms: { default: '妈妈', simplified: '妈妈', traditional: '媽媽' },
      text: '妈妈',
      transcription: 'ma1 ma5',
      audio: 'mother.mp3',
      syllables: [
        {
          forms: { simplified: '妈', traditional: '媽' },
          text: '妈',
          transcription: 'ma1',
          tone: 1,
        },
        {
          forms: { simplified: '妈', traditional: '媽' },
          text: '妈',
          transcription: 'ma5',
          tone: 5,
        },
      ],
    },
  ];
  const h = harness({}, recordings, mandarin);
  h.controller.start({
    challenge: 'tide',
    practice: true,
    variant: 'full',
    content: 'multi',
    target: 'whole',
    timer: 'custom',
    seconds: 20,
  });
  h.audio();
  await flush();
  h.app.querySelector('#transcription-answer').value = 'ma1';
  h.time.advance(5000);
  h.controller.setScript('traditional');
  assert.strictEqual(h.app.querySelector('#transcription-answer').value, 'ma1');
  h.time.advance(14999);
  assert.strictEqual(h.controller.phase, 'answering');
  assert.match(h.app.innerHTML, /媽/);
  assert.strictEqual(h.app.querySelector('.prompt-character').lang, 'cmn-Hant');
  assert.strictEqual(h.controller.state.cleared, 0);
  assert.strictEqual(h.controller.state.expected(), 'ma1 ma5');
  h.time.advance(1);
  assert.strictEqual(h.controller.phase, 'review');
  h.controller.dispose();
});

for (const profile of [cantonese, mandarin]) {
  for (const variant of ['spelling', 'full']) {
    test(profile.label + ' Skyrail only shows tone controls with tones enabled', async () => {
      const h = harness({}, profile === mandarin ? greeting : words, profile);
      h.controller.start({
        challenge: 'tide',
        practice: true,
        variant,
        content: 'multi',
        target: 'whole',
      });
      h.audio();
      await flush();
      assert.strictEqual(
        h.app.querySelector(
          '#typed-help, .typing-hint, .keyboard, [data-insert="ü"], .target-label',
        ),
        null,
      );
      assert.strictEqual(h.app.querySelector('#input-status').textContent.trim(), '');
      assert.strictEqual(h.app.querySelector('#rail-message').textContent, '');
      assert.strictEqual(
        h.app.querySelectorAll('[data-insert]').length,
        profile === mandarin && variant === 'full' ? 5 : 0,
      );
      const input = h.app.querySelector('#transcription-answer');
      input.value = h.controller.state.expected();
      fire(input, 'input');
      assert.strictEqual(h.controller.state.cleared, 1);
      assert.strictEqual(h.app.querySelector('.tone-explanation'), null);
      const spelling = h.controller.state.word.syllables.map((s) =>
        variant === 'full'
          ? profile.format(s.transcription)
          : profile.withoutTones(s.transcription),
      );
      assert.deepEqual(
        [...h.app.querySelectorAll('.prompt-romanization')].map((node) => node.textContent.trim()),
        spelling,
      );
    });
  }
}

test('Mandarin accepts v for ü without an insertion button', async () => {
  const recordings = [
    {
      id: 'green',
      text: '绿',
      transcription: 'lü4',
      audio: 'green.mp3',
      syllables: [{ text: '绿', transcription: 'lü4', tone: 4 }],
    },
  ];
  for (const variant of ['spelling', 'full']) {
    const h = harness({}, recordings, mandarin);
    h.controller.start({ challenge: 'tide', practice: true, variant });
    h.audio();
    await flush();
    const input = h.app.querySelector('#transcription-answer');
    input.value = variant === 'full' ? 'lv4' : 'lv';
    fire(input, 'input');
    assert.strictEqual(h.controller.state.cleared, 1);
    h.controller.dispose();
  }
});

const vietnameseWords = [
  ['được phép', ['nặng', 'sắc'], 'to be allowed'],
  ['ma quỷ', ['ngang', 'hỏi'], 'ghosts and demons'],
  ['mù mờ', ['huyền', 'huyền'], undefined],
  ['cứu sinh', ['sắc', 'ngang'], 'lifesaving (áo cứu sinh)'],
].map(([text, tones, gloss]) => ({
  id: 'vi-' + text,
  text,
  transcription: text,
  audio: text + '.mp3',
  gloss,
  syllables: text
    .split(' ')
    .map((part, i) => ({ text: part, transcription: part, tone: tones[i] })),
}));
test('Vietnamese conceals every tone, uses named keyboard choices, and reveals once', async () => {
  const h = harness({}, vietnameseWords, vietnamese);
  h.controller.start({
    challenge: 'tone',
    practice: true,
    focusIds: ['vi-được phép'],
    tones: ['hỏi', 'nặng'],
  });
  h.audio();
  await flush();
  assert.equal(h.controller.state.word.tone, 'nặng');
  assert.equal(
    [...h.app.querySelectorAll('.prompt-character')].map((node) => node.textContent).join(' '),
    'đươc phep',
  );
  assert.equal(h.app.querySelectorAll('.tone-cover').length, 2);
  assert.equal(h.app.querySelectorAll('.tone-mark').length, 2);
  assert.equal(h.app.querySelector('.prompt-gloss').textContent, 'to be allowed');
  assert.equal(h.app.querySelector('.is-reserved').getAttribute('aria-hidden'), 'true');
  fire(document, 'keydown', { key: '6', target: document.body });
  assert.equal(h.controller.phase, 'answering');
  fire(document, 'keydown', { key: '3', target: document.body });
  assert.equal(h.controller.phase, 'review');
  assert.match(h.app.querySelector('#tower-message').textContent, /dấu hỏi → dấu nặng/i);
  assert.equal(
    [...h.app.querySelectorAll('.prompt-character')].map((node) => node.textContent).join(' '),
    'được phép',
  );
  assert.equal(
    h.app.querySelector('.is-target .prompt-romanization').textContent.trim(),
    'dấu nặng',
  );
  assert.equal(h.app.querySelectorAll('.tone-cover.is-leaving').length, 2);
  h.controller.pause();
  h.controller.resume();
  assert.equal(h.app.querySelectorAll('.tone-cover').length, 0);
});
test('Vietnamese unmarked tones retain the same cover and key six selects the blank mark', async () => {
  const h = harness({}, vietnameseWords, vietnamese);
  h.controller.start({
    challenge: 'tone',
    practice: true,
    focusIds: ['vi-ma quỷ'],
    tones: ['sắc', 'ngang'],
  });
  h.audio();
  await flush();
  assert.equal(h.app.querySelectorAll('.tone-cover').length, 2);
  assert.ok(h.app.querySelector('.tone-mark.is-blank'));
  fire(document, 'keydown', { key: '6', target: document.body });
  assert.equal(h.app.dataset.outcome, 'success');
  assert.equal(
    h.app.querySelector('.is-target .prompt-romanization').textContent.trim(),
    'không dấu',
  );
});
test('Vietnamese words without meanings keep stable empty feedback and reveal on timeout', async () => {
  const h = harness({}, vietnameseWords, vietnamese);
  h.controller.start({
    challenge: 'tone',
    practice: true,
    focusIds: ['vi-mù mờ'],
    tones: ['sắc', 'huyền'],
    timer: 'custom',
    seconds: 5,
  });
  h.audio();
  await flush();
  assert.equal(h.app.querySelector('.prompt-gloss').textContent.trim(), '');
  h.time.advance(5000);
  assert.equal(h.controller.phase, 'review');
  assert.equal(
    [...h.app.querySelectorAll('.prompt-character')].map((node) => node.textContent).join(' '),
    'mù mờ',
  );
  assert.notMatch(h.app.innerHTML, /undefined/);
});

test('quoted Vietnamese in a meaning is concealed until the answer is revealed', async () => {
  const h = harness({}, vietnameseWords, vietnamese);
  h.controller.start({
    challenge: 'tone',
    practice: true,
    focusIds: ['vi-cứu sinh'],
    tones: ['sắc', 'ngang'],
  });
  h.audio();
  await flush();
  assert.equal(h.app.querySelector('.prompt-gloss').textContent.trim(), 'lifesaving (ao cưu sinh)');
  assert.notMatch(h.app.innerHTML, /á|ứ/);
  h.click('[data-tone="' + h.controller.state.word.tone + '"]');
  assert.equal(h.app.dataset.outcome, 'success');
  assert.equal(h.app.querySelector('.prompt-gloss').textContent.trim(), 'lifesaving (áo cứu sinh)');
});
