import { cantoneseCatalog, withSimplifiedCantonese } from '../../tools/catalog/runtime.mjs';
import { test, expect } from '@playwright/test';

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
  await page.clock.pauseAt(new Date(Date.now() + 1000));
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
  await page.keyboard.press(tone);
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');

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
  await start(page, 'tone');
  await page.clock.runFor(2200);
  await expect(page.locator('.tower-feedback')).toBeHidden();
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

  await expect(page.locator('.game-layout')).toBeFocused();
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
  await replay.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.tone-door:enabled')).not.toHaveCount(0);
  await expect(replay).toBeFocused();
  await replay.click();
  await expect(game).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.tone-door:enabled')).toHaveCount(0);
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
    const pause = page.getByRole('button', { name: 'Pause game' });
    const pausePosition = await pause.boundingBox();
    await page.locator(`[data-tone]:not([data-tone="${correct}"])`).first().click();
    if (miss < 4) {
      await expect(page.locator('#practise-mistakes')).toHaveCount(0);
      await expect(page.locator('#ending-practice')).toHaveCount(0);
      await expect(page.locator('.scene-review-action .recording-report')).toBeVisible();
      expect(await pause.boundingBox()).toEqual(pausePosition);
      await page.locator('#continue-game').click();
      await page.clock.runFor(150);
    }
  }
  await page.clock.runFor(2900);
  await expect(page.getByRole('link', { name: 'Report recording' })).toBeVisible();
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
  await input.fill('wrong');
  await page.locator('#check-answer').click();
  await expect(page.locator('#input-status')).toContainText('No life lost');
  await expect(input).toBeEnabled();
  await input.fill('si');
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await expect(page.locator('.rail-feedback')).toBeHidden();
  await page.clock.runFor(1050);
  await expect(input).toHaveValue('');
  expect(await input.evaluate((node, original) => node === original, originalInput)).toBe(true);
  await input.fill('unfinished');
  await page.getByRole('button', { name: 'Pause game' }).click();
  await page.clock.runFor(20000);
  await expect(input).toHaveValue('unfinished');
  await page.getByRole('button', { name: 'Resume', exact: false }).click();
  await page.clock.runFor(16000);
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'timeout');
  await expect(page.locator('.rail-feedback')).toHaveCSS('clip-path', 'inset(50%)');
  await expect(page.locator('.scene-review-action .recording-report')).toBeVisible();
  await expect(input).toBeDisabled();
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
  await page.setViewportSize({ width: size.width, height: size.width === 360 ? 380 : 450 });
  await page.getByRole('textbox').focus();
  await expect(page.locator('body')).toHaveClass(/keyboard-open/);
  const scene = page.locator('.world-scene');
  await expect(scene).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('textbox')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Pause game' })).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.game-readout')).toHaveCSS('clip-path', 'inset(50%)');
  await expect(page.locator('.site-header')).toBeVisible();
  const rail = await scene.boundingBox();
  const field = await page.getByRole('textbox').boundingBox();
  expect(rail.height).toBeGreaterThanOrEqual(88);
  expect(rail.y + rail.height).toBeLessThanOrEqual(field.y);
  await page.getByRole('textbox').fill('si');
  await expect(scene).toBeInViewport({ ratio: 1 });
  await page.clock.runFor(1050);
  await expect(scene).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('textbox')).toBeFocused();
  await expectNoOverflow(page);
  await page.setViewportSize(size);
  await expect(page.locator('body')).not.toHaveClass(/keyboard-open/);
});

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
