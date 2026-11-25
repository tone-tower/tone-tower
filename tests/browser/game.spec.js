import { cantoneseCatalog, withSimplifiedCantonese } from '../../tools/catalog/runtime.mjs';
import { test, expect } from '@playwright/test';
import { openHeaderMenu } from '../helpers/header-menu.js';
import { pausePageClock } from '../helpers/fake-time.js';

// Keep smoke tests independent of downloads and speakers. Real recording playback
// still needs a quick check on a phone, particularly for browser audio permissions.
const singles = ['詩', '史', '試', '時', '市', '事'].map((character, i) => ({
  id: `si${i + 1}`,
  gloss: 'example',
  syllables: [{ character, jyutping: `si${i + 1}`, tone: i + 1 }],
}));
const words = [
  ...singles,
  {
    id: 'morning',
    gloss: 'good morning',
    syllables: [
      { character: '早', jyutping: 'zou2', tone: 2 },
      { character: '晨', jyutping: 'san4', tone: 4 },
    ],
  },
];
const catalog = {
  version: 1,
  words,
  recordings: [
    ...words.map((word) => ({ id: word.id, wordId: word.id, audio: `audio/${word.id}.mp3` })),
    ...singles.map((word) => ({
      id: `anchor-${word.id}`,
      wordId: word.id,
      audio: `audio/${word.id}.mp3`,
      anchor: true,
    })),
  ],
};
const errors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const pageErrors = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.clock.install();
  await page.route('**/catalogs/yue.json', (route) =>
    route.fulfill({ json: withSimplifiedCantonese(cantoneseCatalog(catalog)) }),
  );
  await page.addInitScript(() => {
    window.__audioPlays = [];
    window.Audio = class {
      constructor(src) {
        this.src = src;
      }
      load() {}
      removeAttribute(name) {
        if (name === 'src') this.src = '';
      }
      pause() {
        clearTimeout(this.end);
      }
      play() {
        window.__audioPlays.push(this.src);
        this.end = setTimeout(() => this.onended?.(), 100);
        return Promise.resolve();
      }
    };
  });
  await page.goto('/cantonese/');
  await expect(page.locator('.mode-cards')).toBeVisible();
  await pausePageClock(page);
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function start(page, world) {
  await page.locator(`.mode-card[data-destination="${world === 'tide' ? 'rail' : world}"]`).click();
  await page.locator('#start-adventure').click();
  await expect(page.locator('#app')).toHaveAttribute('data-world', world);
}

async function currentTone(page) {
  const character = await page.locator('.is-target .prompt-character').innerText();
  return String(
    words.flatMap((word) => word.syllables).find((s) => s.character === character).tone,
  );
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('Tower recovery flies into the meter and clears before the next prompt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    Math.random = () => 0;
    window.__heartLabels = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      if (value === '+1') window.__heartLabels.push(args.slice(0, 2));
      return fillText.call(this, value, ...args);
    };
  });
  await start(page, 'tone');
  await page.clock.runFor(2300);
  const first = await currentTone(page);
  const wrong = await page
    .locator(`.tone-door:not([data-tone="${first}"])`)
    .getAttribute('data-tone');
  await page.keyboard.press(wrong);
  await page.keyboard.press('Enter');
  await page.clock.runFor(200);
  const status = await page.locator('#audio-status').elementHandle();
  await page.keyboard.press(await currentTone(page));
  await expect(page.locator('#audio-status')).toHaveText('Heart restored. 4 of 4 lives remaining.');
  expect(await status.evaluate((node) => node.isConnected)).toBe(true);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.__heartLabels.length)).toBe(0);
  await expect(page.locator('.tone-door.has-heart-drop .tone-name')).toHaveCSS('opacity', '0');
  await page.clock.runFor(300);
  expect(await page.evaluate(() => window.__heartLabels.length)).toBeGreaterThan(0);
  await page.clock.runFor(1600);
  const before = await page.evaluate(() => window.__heartLabels.length);
  await page.clock.runFor(500);
  expect(await page.evaluate(() => window.__heartLabels.length)).toBe(before);
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'answering');
  await expectNoOverflow(page);
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`Skyrail shows the recovery badge with reduced motion set to ${reducedMotion}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.evaluate(() => {
      Math.random = () => 0;
      window.__railHeartLabels = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
        if (value === '+1' || value === '+ LIFE') window.__railHeartLabels.push(value);
        return fillText.call(this, value, ...args);
      };
    });
    await start(page, 'tide');
    await page.clock.runFor(200);
    await page.clock.fastForward(15000);
    await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'timeout');
    await page.locator('#continue-game').click();
    await page.clock.runFor(200);
    await expect(page.locator('.prompt-syllable.is-target .target-label')).toHaveText(
      'Listen here',
    );
    await expect(page.locator('#audio-status')).toContainText(
      'Clear this span to restore a heart.',
    );
    await page.locator('#transcription-answer').fill('si');
    await expect(page.locator('#audio-status')).toHaveText(
      'Heart restored. 4 of 4 lives remaining.',
    );
    await page.clock.runFor(950);
    await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
    const labels = () => page.evaluate(() => [...new Set(window.__railHeartLabels)]);
    expect(await labels()).toEqual(reducedMotion === 'reduce' ? ['+1'] : []);
    await page.clock.runFor(350);
    expect(await labels()).toEqual(['+1']);
    await page.clock.runFor(600);
    await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'answering');
    await expectNoOverflow(page);
  });
}

test('Tower and Skyrail share an equal-sized difficulty grid and save keyboard selections', async ({
  page,
}) => {
  const group = page.getByRole('group', { name: 'Tower difficulty' });
  const railGroup = page.getByRole('group', { name: 'Skyrail difficulty' });
  const entry = page.getByRole('button', { name: 'Enter Tone Tower', exact: true });
  await expect(entry).toBeVisible();
  const tower = page.locator('.mode-card[data-destination="tone"]');
  const rail = page.locator('.mode-card[data-destination="rail"]');
  const viewport = page.viewportSize();
  const buttonBoxes = async (difficultyGroup) => {
    const modes = difficultyGroup.getByRole('button');
    await expect(modes).toHaveCount(4);
    return modes.evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const grid = button.parentElement.getBoundingClientRect();
        const range = document.createRange();
        range.selectNode(button.firstChild);
        const label = range.getBoundingClientRect();
        const hearts = [...button.querySelectorAll('.difficulty-hearts svg')];
        return {
          x: rect.left - grid.left,
          y: rect.top - grid.top,
          width: rect.width,
          height: rect.height,
          fits:
            label.left >= rect.left &&
            label.right <= rect.right &&
            hearts.every((heart) => {
              const bounds = heart.getBoundingClientRect();
              return bounds.left >= rect.left && bounds.right <= rect.right;
            }),
        };
      }),
    );
  };
  for (const width of [viewport.width, 760, 320]) {
    await page.setViewportSize({ ...viewport, width });
    await page.evaluate(() => document.fonts.ready);
    await tower.click();
    const boxes = await buttonBoxes(group);
    await expectNoOverflow(page);
    await rail.click();
    expect(await buttonBoxes(railGroup)).toEqual(boxes);
    const widths = boxes.map((box) => box.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.1);
    expect(new Set(boxes.map((box) => box.height)).size).toBe(1);
    for (const { width, height, fits } of boxes) {
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
      expect(fits).toBe(true);
    }
    await expectNoOverflow(page);
  }
  const railHard = railGroup.getByRole('button', { name: /^Hard/ });
  await railHard.focus();
  await page.keyboard.press('Space');
  await expect(railHard).toBeFocused();
  await expect(railHard).toHaveAttribute('aria-pressed', 'true');
  await tower.click();
  const towerExtreme = group.getByRole('button', { name: /Extreme/ });
  await towerExtreme.focus();
  await page.keyboard.press('Space');
  await expect(towerExtreme).toBeFocused();
  await expect(towerExtreme).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(towerExtreme).toHaveAttribute('aria-pressed', 'true');
  await expect(entry).toBeVisible();
  await rail.click();
  await expect(railHard).toHaveAttribute('aria-pressed', 'true');
});

function layoutBoxes(page, selectors) {
  return page.evaluate(
    (items) =>
      items.map((selector) => {
        const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
        return { x: x + scrollX, y: y + scrollY, width, height };
      }),
    selectors,
  );
}

const skyrailLayout = [
  '.prompt-character',
  '.prompt-romanization',
  '.prompt-gloss',
  '#replay-word',
  '.rail-answer-controls',
  '.scene-frame',
];

for (const world of ['tone', 'tide']) {
  test(`${world} centers the word and keeps the meaning in a stable slot`, async ({ page }) => {
    const phone = page.viewportSize().width <= 700;
    if (phone) await page.setViewportSize({ width: 320, height: 640 });
    await start(page, world);
    const selectors = [
      '.prompt-syllables',
      '.prompt-gloss',
      '.prompt-actions',
      '.round-prompt',
      '.scene-question',
    ];
    const boxes = await layoutBoxes(page, selectors);
    const [syllables, meaningBox, actions, prompt] = boxes;
    const gloss = page.locator('.prompt-gloss > span');
    const lineCount = phone ? 4 : 3;
    await expect(gloss).toHaveCSS('-webkit-line-clamp', String(lineCount));
    const lineHeight = parseFloat(
      await gloss.evaluate((node) => getComputedStyle(node).lineHeight),
    );
    expect(meaningBox.height).toBeCloseTo(lineHeight * lineCount, 1);
    expect(syllables.x + syllables.width / 2).toBeCloseTo(prompt.x + prompt.width / 2, 1);
    expect(meaningBox.x + meaningBox.width).toBeLessThan(syllables.x);
    expect(syllables.x + syllables.width).toBeLessThan(actions.x);
    expect(meaningBox.y + meaningBox.height / 2).toBeCloseTo(syllables.y + syllables.height / 2, 1);
    expect(actions.y + actions.height / 2).toBeCloseTo(syllables.y + syllables.height / 2, 1);
    await expect(page.locator('.word-prompt')).toHaveCSS('min-height', '120px');
    await expect(page.locator('.prompt-character').first()).toHaveCSS(
      'font-size',
      phone ? '48px' : '50px',
    );
    if (world === 'tide') {
      const replay = await page.locator('#replay-word').boundingBox();
      const pause = await page.locator('#pause-run').boundingBox();
      expect(pause.height).toBe(replay.height);
      if (phone) expect(pause.width).toBe(replay.width);
      else expect(pause.y).toBe(replay.y);
    }
    for (const meaning of [
      '',
      'short meaning',
      'An expression with two common uses, with both meanings in view',
      'An example of an unusually long dictionary definition. '.repeat(6).trim(),
    ]) {
      await gloss.evaluate((node, text) => (node.textContent = text), meaning);
      await expect(gloss).toHaveText(meaning);
      await expect(gloss).toHaveCSS('text-align', 'center');
      const [glossText] = await layoutBoxes(page, ['.prompt-gloss > span']);
      expect(glossText.y + glossText.height / 2).toBeCloseTo(
        meaningBox.y + meaningBox.height / 2,
        1,
      );
      expect(await layoutBoxes(page, selectors)).toEqual(boxes);
    }
    expect(await gloss.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await expectNoOverflow(page);
  });
}

test('a long Tower word fits beside Replay and leaves space for Listen here', async ({ page }) => {
  const phone = page.viewportSize().width <= 600;
  if (phone) await page.setViewportSize({ width: 320, height: 640 });
  const phrase = {
    id: 'long',
    gloss: 'Cantonese language class',
    syllables: ['廣', '東', '話', '班'].map((character, i) => ({
      character,
      jyutping: ['gwong2', 'dung1', 'waa2', 'baan1'][i],
      tone: [2, 1, 2, 1][i],
    })),
  };
  await page.route('**/catalogs/yue.json', (route) =>
    route.fulfill({
      json: cantoneseCatalog({
        ...catalog,
        words: [...singles, phrase],
        recordings: [
          ...catalog.recordings.filter((recording) => recording.anchor),
          { id: phrase.id, wordId: phrase.id, audio: 'audio/long.mp3' },
        ],
      }),
    }),
  );
  await page.reload();
  await start(page, 'tone');
  await page.clock.runFor(2200);
  await expect(page.locator('.prompt-character')).toHaveText(['廣', '東', '話', '班']);
  const [label, character, word, replay] = await layoutBoxes(page, [
    '.target-label',
    '.is-target .prompt-character',
    '.prompt-syllables',
    '#replay-word',
  ]);
  expect(label.y + label.height).toBeLessThan(character.y);
  expect(word.x + word.width).toBeLessThan(replay.x);
  expect(replay.y + replay.height / 2).toBeGreaterThan(word.y);
  const characters = await page.locator('.prompt-character').evaluateAll((nodes) =>
    nodes.map((node) => {
      const { left, right, top } = node.getBoundingClientRect();
      return { left: left + scrollX, right: right + scrollX, top };
    }),
  );
  expect(new Set(characters.map(({ top }) => Math.round(top))).size).toBe(1);
  expect(characters[0].left).toBeGreaterThanOrEqual(word.x);
  expect(characters.at(-1).right).toBeLessThanOrEqual(word.x + word.width);
  expect(character.height).toBeGreaterThan(phone ? 32 : 48);
  const question = page.locator('.scene-question');
  const height = (await question.boundingBox()).height;
  await page.locator('.tone-door:enabled').first().click();
  expect((await question.boundingBox()).height).toBe(height);
  await expectNoOverflow(page);
});

test('Cantonese character style updates the current prompt and carries over to the guide', async ({
  page,
}) => {
  const traditional = page.getByRole('radio', { name: 'Traditional' });
  const simplified = page.getByRole('radio', { name: 'Simplified' });
  await expect(traditional).toBeChecked();
  await page.locator('#setup-practice').click();
  for (const tone of [1, 2, 5, 6]) await page.locator(`[data-practice-tone="${tone}"]`).click();
  await page.locator('#start-adventure').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'game');
  await page.clock.runFor(150);

  const character = page.locator('.word-prompt .prompt-character');
  await expect(character).toHaveAttribute('lang', 'yue-Hant');
  await expect(character).toHaveText(/^[試時]$/);
  const written = await character.innerText();
  const tone = await currentTone(page);
  const door = await page.locator('.tone-door').first().elementHandle();
  const plays = await page.evaluate(() => window.__audioPlays.length);
  await simplified.check();
  await expect(character).toHaveAttribute('lang', 'yue-Hans');
  await expect(character).toHaveText(written === '試' ? '试' : '时');
  expect(await door.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => window.__audioPlays.length)).toBe(plays);
  await expect(page.locator('.game-layout')).toBeFocused();
  const shortcuts = page.locator('.keyboard, .door-key');
  for (const shortcut of await shortcuts.all()) {
    if (page.viewportSize().width <= 700) await expect(shortcut).toBeHidden();
    else await expect(shortcut).toBeVisible();
  }
  await expect(page.locator('.keyboard')).toHaveText(
    'Choose a tone with the keys shown on its door. Replay with Space or R.',
  );
  for (const key of await page.locator('.keyboard kbd').all()) {
    await expect(key).toHaveCSS('margin-inline-start', '0px');
  }
  await page.keyboard.press(tone);
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await expect(page.locator('.tone-door.is-correct')).toHaveCount(1);
  await expect(page.locator('#audio-status')).toHaveText('Correct.');
  await expect(page.locator('.tower-feedback')).toBeHidden();

  await page.goto('/cantonese/guide/');
  await expect(simplified).toBeChecked();
  const reference = page.locator('.guide-tones [data-guide-tone="5"] span[lang]');
  await expect(reference).toHaveText('妇');
  await expect(reference).toHaveAttribute('lang', 'yue-Hans');
  await traditional.check();
  await expect(reference).toHaveText('婦');
  await expect(reference).toHaveAttribute('lang', 'yue-Hant');
});

test('pause and resume buttons keep keyboard activation', async ({ page }) => {
  await start(page, 'tide');
  await page.clock.runFor(150);
  await expect(page.locator('.rail-feedback')).toBeHidden();
  const pause = page.getByRole('button', { name: 'Pause game' });
  await expect(pause).toBeInViewport({ ratio: 1 });
  const { width, height } = await pause.boundingBox();
  expect(Math.min(width, height)).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.game-readout')).toHaveCSS('clip-path', 'inset(50%)');
  const plays = () => page.evaluate(() => window.__audioPlays.length);
  const before = await plays();
  await pause.press('Space');
  await expect(page.locator('#resume-game')).toBeFocused();
  expect(await plays()).toBe(before);
  await page.locator('#resume-game').press('Enter');

  await expect(page.locator('#transcription-answer')).toBeFocused();
});

test('header navigation pauses an unfinished run and confirms the full destination', async ({
  page,
}) => {
  await start(page, 'tide');
  await page.clock.runFor(150);
  const input = page.locator('#transcription-answer');
  await input.fill('zz');
  const clock = page.locator('#countdown');
  const remaining = await clock.textContent();
  const resume = page.getByRole('button', { name: 'Resume' });

  await page.locator('#replay-word').focus();
  await page.keyboard.down('Space');
  await page.locator('.brand').click();
  await page.keyboard.up('Space');
  await expect(page.getByRole('heading', { name: 'Go to Home?' })).toBeVisible();
  await expect(resume).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'End run & go to Home' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(resume).toBeFocused();
  await page.clock.runFor(5000);
  await expect(clock).toHaveText(remaining);
  await expect(page).toHaveURL(/cantonese\/$/);
  await resume.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('zz');

  await openHeaderMenu(page);
  await page.locator('#learn').press('Enter');
  await expect(page.getByRole('heading', { name: 'Go to Jyutping guide?' })).toBeVisible();
  await page.getByRole('button', { name: 'End run & go to Jyutping guide' }).press('Enter');
  await expect(page).toHaveURL(/cantonese\/guide\/$/);
  await expect(page.getByRole('heading', { name: 'Jyutping guide', exact: true })).toBeFocused();
});

test('Tower returns pointer replay focus to gameplay and keeps arrow shortcuts off buttons', async ({
  page,
}) => {
  await start(page, 'tone');
  await page.clock.runFor(2200);
  const game = page.locator('.game-layout');
  const replay = page.locator('#replay-word');
  await expect(game).toBeFocused();
  await expect(page.locator('#pause-run')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-overlay')).toHaveCount(0);
  await replay.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.tone-door:enabled')).not.toHaveCount(0);
  await expect(replay).toBeFocused();
  await replay.click();
  await expect(game).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.tone-door:enabled')).toHaveCount(0);
});

test('a ready Tower door scores on one tap after the room stops moving', async ({
  page,
  hasTouch,
}) => {
  test.skip(!hasTouch, 'Requires touch input.');
  await start(page, 'tone');
  const doors = page.locator('.tone-door');
  await expect(doors.first()).toBeDisabled();
  await page.clock.runFor(2200);
  await page.locator(`[data-tone="${await currentTone(page)}"]`).tap();
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await page.clock.runFor(1850);
  await expect(page.locator('.world-scene')).toHaveAttribute('data-moving', '');
  await expect(page.locator('.scene-content')).toHaveAttribute('inert', '');
  await page.keyboard.press(await currentTone(page));
  await expect(page.locator('.is-correct')).toHaveCount(0);
  await page.clock.runFor(600);
  await expect(page.locator('.scene-content')).not.toHaveAttribute('inert', '');
  const correct = await currentTone(page);
  await page.locator(`[data-tone]:not([data-tone="${correct}"])`).first().tap();
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'wrong');
  await expect(page.locator('.tone-door.is-answer')).toHaveAttribute('data-tone', correct);
  await expect(page.locator('.game-readout')).toContainText('3 of 4 lives remaining');
});

test('Tower intro, crossing, mistake review and failed-run practice', async ({ page }) => {
  await start(page, 'tone');
  await page.clock.runFor(1900);
  expect(await page.evaluate(() => window.__audioPlays.length)).toBe(0);
  await expect(page.locator('[data-tone]').first()).toBeDisabled();
  await page.clock.runFor(300);
  await expect(page.locator('[data-tone]').first()).toBeEnabled();
  expect(await page.evaluate(() => window.__audioPlays.length)).toBe(1);
  const tone = await currentTone(page);
  await page.locator(`[data-tone="${tone}"]`).click();
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await expect(page.getByRole('link', { name: 'Report recording' })).toHaveCount(0);
  await page.clock.runFor(2700);
  expect(await page.evaluate(() => window.__audioPlays.length)).toBe(2);
  await expect(page.locator('[data-tone]').first()).toBeEnabled();
  let finalTones;
  for (let miss = 1; miss <= 4; miss++) {
    finalTones = await page
      .locator('[data-tone]')
      .evaluateAll((doors) => doors.map((door) => door.dataset.tone).sort());
    const correct = await currentTone(page);
    await page.locator(`[data-tone]:not([data-tone="${correct}"])`).first().click();
    if (miss < 4) {
      await expect(page.locator('#practise-mistakes')).toHaveCount(0);
      await expect(page.locator('#ending-practice')).toHaveCount(0);
      await expect(page.locator('.scene-review-action .recording-report')).toBeVisible();
      const solution = page.locator('.tone-door.is-answer');
      await expect(solution.locator('.tone-name')).toHaveText('✓ Correct');
      const symbol = await solution.locator('.tone-symbol').boundingBox();
      const label = await solution.locator('.tone-name').boundingBox();
      const door = await solution.boundingBox();
      expect(symbol.y + symbol.height).toBeLessThanOrEqual(label.y);
      expect(label.y + label.height).toBeLessThanOrEqual(door.y + door.height);
      await page.locator('#continue-game').click();
      await page.clock.runFor(150);
    }
  }
  await page.clock.runFor(2900);
  const report = page.getByRole('link', { name: 'Report recording' });
  await expect(report).toBeVisible();
  expect(new URL(await report.getAttribute('href')).searchParams.get('context')).toMatch(
    /^Where: Tone Tower\n/,
  );
  await expect(page.getByRole('button', { name: 'Practice your mistakes' })).toBeEnabled();
  await page.getByRole('button', { name: 'Practice this tone combination' }).click();
  await expect(page.getByRole('heading', { name: 'Practice tones' })).toBeVisible();
  await expect(page.locator('.game-progress-label')).toHaveText('0 / 20');
  expect(
    await page
      .locator('[data-tone]')
      .evaluateAll((doors) => doors.map((door) => door.dataset.tone).sort()),
  ).toEqual(finalTones);
  await expectNoOverflow(page);
});

test('Cantonese practice labels all six tones and uses the selected pair', async ({ page }) => {
  await page.locator('#setup-practice').click();
  const tones = page.getByRole('group', { name: 'Tones to practise' });
  await expect(tones.locator('.practice-tone-description')).toHaveText([
    'High and level',
    'Rises high',
    'Middle and level',
    'Low and falling',
    'Rises from low',
    'Low and level',
  ]);
  for (const tone of [1, 4, 5, 6]) {
    const choice = tones.getByRole('button', { name: 'Tone ' + tone, exact: true });
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'false');
  }
  await page.locator('#start-adventure').click();
  await page.clock.runFor(150);
  const choices = await page
    .locator('[data-tone]')
    .evaluateAll((doors) => doors.map((door) => door.dataset.tone).sort());
  expect(choices).toEqual(['2', '3']);
  const correct = await currentTone(page);
  await page.locator(`[data-tone]:not([data-tone="${correct}"])`).first().click();
  const report = page.locator('.scene-review-action .recording-report');
  await expect(report).toBeVisible();
  expect(new URL(await report.getAttribute('href')).searchParams.get('context')).toMatch(
    /^Where: Tone Tower Practice\n/,
  );
  await expectNoOverflow(page);
});

test('Skyrail retry, crossing, pause and timeout keep the input usable', async ({ page }) => {
  await start(page, 'tide');
  await page.clock.runFor(150);
  await expect(page.locator('.rail-feedback')).toBeHidden();
  const input = page.getByRole('textbox');
  const character = await page.locator('.is-target .prompt-character').innerText();
  await expect(input).toHaveAccessibleName('Jyutping for the highlighted syllable, ' + character);
  const originalInput = await input.elementHandle();
  const before = await layoutBoxes(page, skyrailLayout);
  await expect(page.locator('.prompt-romanization').first()).toBeHidden();
  await input.fill('wrong');
  await page.locator('#check-answer').click();
  await expect(page.locator('#input-status')).toContainText('No life lost');
  await expect(input).toBeEnabled();
  expect(await layoutBoxes(page, skyrailLayout)).toEqual(before);
  await input.fill('si');
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await expect(page.locator('.rail-feedback')).toBeHidden();
  await expect(page.locator('.prompt-romanization')).toHaveText('si' + (await currentTone(page)));
  expect(await layoutBoxes(page, skyrailLayout)).toEqual(before);
  await page.clock.runFor(1050);
  await expect(input).toHaveValue('');
  expect(await input.evaluate((node, original) => node === original, originalInput)).toBe(true);
  await input.fill('unfinished');
  await page.getByRole('button', { name: 'Pause game' }).click();
  await page.clock.runFor(20000);
  await expect(input).toHaveValue('unfinished');
  await page.getByRole('button', { name: 'Resume', exact: false }).click();
  const reviewLayout = await layoutBoxes(page, skyrailLayout);
  await page.clock.runFor(16000);
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'timeout');
  await expect(page.locator('.rail-feedback')).toHaveCSS('clip-path', 'inset(50%)');
  const report = page.locator('.rail-review-actions .recording-report');
  await expect(report).toBeVisible();
  expect(await layoutBoxes(page, skyrailLayout)).toEqual(reviewLayout);
  const [actions, scenery] = await layoutBoxes(page, ['.rail-review-actions', '.scene-frame']);
  expect(actions.y + actions.height).toBeLessThanOrEqual(scenery.y);
  const nextCar = page.getByRole('button', { name: /Catch the next car/ });
  const [reportBox, nextBox] = await Promise.all([report.boundingBox(), nextCar.boundingBox()]);
  expect(reportBox.y + reportBox.height / 2).toBeCloseTo(nextBox.y + nextBox.height / 2, 1);
  expect((reportBox.x + nextBox.x + nextBox.width) / 2).toBeCloseTo(
    actions.x + actions.width / 2,
    1,
  );
  const toolbar = await page.locator('.rail-review-actions').boundingBox();
  expect(nextBox.y + nextBox.height / 2).toBeCloseTo(toolbar.y + toolbar.height / 2, 1);
  const shortcut = nextCar.locator('kbd');
  if (page.viewportSize().width > 700) {
    await expect(shortcut).toBeVisible();
    await expect(shortcut).toHaveCSS(
      'color',
      await nextCar.evaluate((node) => getComputedStyle(node).color),
    );
  } else await expect(shortcut).toBeHidden();
  expect(new URL(await report.getAttribute('href')).searchParams.get('context')).toMatch(
    /^Where: Skyrail\n/,
  );
  await expect(page.locator('#transcription-answer')).toBeDisabled();
  await expect(page.locator('#continue-game')).toBeVisible();
  await page.locator('#continue-game').click();
  await page.clock.runFor(150);
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('');
  await expectNoOverflow(page);
});

test('phone keyboard keeps the rail journey visible above the typing field', async ({ page }) => {
  test.skip(page.viewportSize().width > 700, 'Keyboard layout is only used on phones.');
  await start(page, 'tide');
  await page.clock.runFor(150);
  const size = page.viewportSize();
  const prompt = page.locator('.scene-question');
  const restingHeight = (await prompt.boundingBox()).height;
  await page.setViewportSize({ width: size.width, height: size.width === 360 ? 380 : 450 });
  await page.getByRole('textbox').focus();
  await expect(page.locator('body')).toHaveClass(/keyboard-open/);
  expect((await prompt.boundingBox()).height).toBeLessThan(restingHeight);
  const scene = page.locator('.world-scene');
  await expect(scene).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('textbox')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Pause game' })).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.game-readout')).toHaveCSS('clip-path', 'inset(50%)');
  await expect(page.locator('.site-header')).toBeVisible();
  const rail = await scene.boundingBox();
  const field = await page.getByRole('textbox').boundingBox();
  const before = await layoutBoxes(page, skyrailLayout);
  expect(rail.height).toBeGreaterThanOrEqual(88);
  expect(rail.y + rail.height).toBeLessThanOrEqual(field.y);
  await page.getByRole('textbox').fill('si');
  await expect(scene).toBeInViewport({ ratio: 1 });
  expect(await layoutBoxes(page, skyrailLayout)).toEqual(before);
  await page.clock.runFor(1050);
  await expect(scene).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('textbox')).toBeFocused();
  const beforeReview = await layoutBoxes(page, skyrailLayout);
  await page.clock.runFor(16000);
  await expect(page.locator('.rail-review-actions .recording-report')).toBeVisible();
  expect(await layoutBoxes(page, skyrailLayout)).toEqual(beforeReview);
  await expectNoOverflow(page);
  await page.setViewportSize(size);
  await expect(page.locator('body')).not.toHaveClass(/keyboard-open/);
});

for (const { text, parts, gloss } of [
  {
    text: '廣東話班',
    parts: ['gwong2', 'dung1', 'waa2', 'baan1'],
    gloss: 'Cantonese language class',
  },
  {
    text: '廣東話入門課',
    parts: ['gwong2', 'dung1', 'waa2', 'jap6', 'mun4', 'fo3'],
    gloss: 'introductory Cantonese class',
  },
]) {
  test(`a ${parts.length}-character Skyrail answer reveals its tones in the reserved space`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 430 });
    const phrase = {
      id: 'long',
      gloss,
      syllables: [...text].map((character, i) => ({
        character,
        jyutping: parts[i],
        tone: Number(parts[i].at(-1)),
      })),
    };
    await page.route('**/catalogs/yue.json', (route) =>
      route.fulfill({
        json: cantoneseCatalog({
          ...catalog,
          words: [...singles, phrase],
          recordings: [
            ...catalog.recordings.filter((recording) => recording.anchor),
            { id: phrase.id, wordId: phrase.id, audio: 'audio/long.mp3' },
          ],
        }),
      }),
    );
    await page.reload();
    await page.locator('.mode-card[data-destination="rail"]').click();
    await page.locator('#setup-practice').click();
    await page.locator('#start-adventure').click();
    await page.clock.runFor(150);
    await expect(page.locator('.prompt-syllables > .target-label')).toHaveText('Listen here');
    const selectors = [...skyrailLayout, '.prompt-syllables', '.prompt-actions'];
    const before = await layoutBoxes(page, selectors);
    await page
      .locator('#transcription-answer')
      .fill(parts.map((part) => part.slice(0, -1)).join(' '));
    await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
    await expect(page.locator('.prompt-romanization')).toHaveText(parts);
    expect(await layoutBoxes(page, selectors)).toEqual(before);
    const [meaning, word, controls] = await layoutBoxes(page, [
      '.prompt-gloss',
      '.prompt-syllables',
      '.prompt-actions',
    ]);
    const characters = await page.locator('.prompt-character').evaluateAll((nodes) =>
      nodes.map((node) => {
        const { top, left, right } = node.getBoundingClientRect();
        return { top, left: left + scrollX, right: right + scrollX };
      }),
    );
    expect(new Set(characters.map(({ top }) => Math.round(top))).size).toBe(1);
    expect(characters[0].left).toBeGreaterThanOrEqual(word.x);
    expect(characters.at(-1).right).toBeLessThanOrEqual(word.x + word.width);
    expect(meaning.x + meaning.width).toBeLessThan(word.x);
    expect(word.x + word.width).toBeLessThan(controls.x);
    expect(meaning.y + meaning.height / 2).toBeCloseTo(word.y + word.height / 2, 1);
    expect(controls.y + controls.height / 2).toBeCloseTo(word.y + word.height / 2, 1);
    await expectNoOverflow(page);
  });
}

test('first completion reveals a permanent friend at home', async ({ page }) => {
  test.skip(page.viewportSize().width < 700, 'One complete journey covers the unlock lifecycle.');
  test.setTimeout(90000);
  const extraWords = Array.from({ length: 120 }, (_, i) => ({
    ...singles[i % singles.length],
    id: 'journey-' + i,
  }));
  await page.route('**/catalogs/yue.json', (route) =>
    route.fulfill({
      json: cantoneseCatalog({
        ...catalog,
        words: [...words, ...extraWords],
        recordings: [
          ...catalog.recordings,
          ...extraWords.map((word) => ({
            id: word.id,
            wordId: word.id,
            audio: 'audio/' + word.id + '.mp3',
          })),
        ],
      }),
    }),
  );
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page, 'tone');
  await page.clock.runFor(2200);
  for (let floor = 1; floor <= 100; floor++) {
    await page.locator('[data-tone="' + (await currentTone(page)) + '"]').click();
    await page.clock.fastForward(1800);
    await page.clock.runFor(150);
    if (floor < 100 && floor % 20 === 0) {
      await expect(page.locator('.scene-question .tower-interlude')).toContainText(
        'Lives refilled',
      );
      await expect(page.locator('.world-scene .tower-interlude')).toHaveCount(0);
      await page.locator('#continue-game').click();
      await page.clock.runFor(150);
    }
  }
  await expect(page.locator('.homecoming-message')).toContainText('Rooftop cat unlocked.');
  await page.locator('#ending-home').click();
  await expect(page.getByRole('button', { name: 'Pet the rooftop cat' })).toBeVisible();
  await expect(page.locator('#home-reward-status')).toContainText('Welcome home.');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pet the rooftop cat' })).toBeVisible();
  await expect(page.locator('.home-friend')).toHaveCount(1);
});

test('missed-sound practice retains multi-syllable recordings from the tower', async ({ page }) => {
  // Force every missed recording to be a word, so the default single-syllable filter cannot hide it.
  await page.route('**/catalogs/yue.json', (route) =>
    route.fulfill({
      json: cantoneseCatalog({
        ...catalog,
        words: singles.map((word) => ({
          ...word,
          syllables: [...word.syllables, ...word.syllables],
        })),
        recordings: catalog.recordings.filter((recording) => recording.wordId !== 'morning'),
      }),
    }),
  );
  await page.reload();
  await start(page, 'tone');
  await page.clock.runFor(2200);
  const missed = [];
  const prompt = () =>
    page.evaluate(() => ({
      audio: window.__audioPlays.at(-1),
      target: [...document.querySelectorAll('.prompt-syllable')].findIndex((item) =>
        item.classList.contains('is-target'),
      ),
      tones: [...document.querySelectorAll('[data-tone]')].map((door) => door.dataset.tone),
    }));
  for (let miss = 0; miss < 4; miss++) {
    missed.push(await prompt());
    const correct = await currentTone(page);
    await page
      .locator('[data-tone]:not([data-tone="' + correct + '"])')
      .first()
      .click();
    if (miss < 3) {
      await page.locator('#continue-game').click();
      await page.clock.runFor(150);
    }
  }
  await page.clock.runFor(2900);
  await page.getByRole('button', { name: 'Practice your mistakes' }).click();
  await expect(page.getByRole('heading', { name: 'Practice tones' })).toBeVisible();
  await expect(page.locator('.game-progress-label')).toHaveText('0 / 4');
  for (let i = 0; i < missed.length; i++) {
    await page.clock.runFor(800);
    expect(await prompt()).toEqual(missed[i]);
    await page
      .locator('[data-tone]')
      .nth(i % 2)
      .click();
    if (i < missed.length - 1) {
      if ((await page.locator('#app').getAttribute('data-outcome')) === 'wrong')
        await page.locator('#continue-game').click();
      else await page.clock.runFor(1700);
    }
  }
  await page.clock.runFor(100);
  await page.getByRole('button', { name: 'See practice results' }).click();
  await expect(page.getByRole('heading', { name: 'Practice complete' })).toBeVisible();
  await expect(page.locator('.results-actions button')).toHaveCount(2);
  await expect(page.getByText('One to listen to again')).toHaveCount(0);
  await expect(page.getByText('Copy session summary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Practice again' }).click();
  await expect(page.locator('.game-progress-label')).toHaveText('0 / 4');
  await expectNoOverflow(page);
});
