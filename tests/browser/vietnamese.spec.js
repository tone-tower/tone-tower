import { test, expect } from '@playwright/test';
import { openHeaderMenu } from '../helpers/header-menu.js';

const marks = { '́': 'sắc', '̀': 'huyền', '̉': 'hỏi', '̃': 'ngã', '̣': 'nặng' };
const toneOf = (syllable) =>
  [...syllable.normalize('NFD')].map((ch) => marks[ch]).find(Boolean) ?? 'ngang';
const toneless = (text) => text.normalize('NFD').replace(/[̣̀́̃̉]/g, '');
const toneName = (tone) => (tone === 'ngang' ? 'không dấu' : 'dấu ' + tone);
// Each tone's example is a word whose syllables all carry that tone.
const references = [
  ['chú ý', 'to pay attention'],
  ['hoàn toàn', 'completely'],
  ['đảm bảo', 'to ensure'],
  ['mãi mãi', 'forever'],
  ['hiện tại', 'present'],
  ['hôm nay', 'today'],
];
const words = [
  ...references,
  ['xin chào', 'hello'],
  ['có thể', 'can'],
  ['được phép', 'to be allowed'],
  ['ý nghĩa', 'meaning'],
  ['ma quỷ', 'ghosts and demons'],
  ['mù mờ'],
  ['phòng thí nghiệm', 'laboratory'],
  ['chủ nghĩa xã hội'],
];
function catalogOf(list, { examplesOnly = false } = {}) {
  const isReference = (text) => references.some(([word]) => word === text);
  return {
    version: 2,
    language: 'vi',
    transcriptionSystem: 'quoc-ngu',
    entries: list.map(([text, gloss], i) => ({
      id: 'vi-' + i,
      forms: { default: text },
      gloss: gloss ?? '',
    })),
    pronunciations: list.map(([text], i) => ({
      id: 'vi-' + i,
      entryId: 'vi-' + i,
      syllables: text
        .split(' ')
        .map((part) => ({ text: part, transcription: part, tone: toneOf(part) })),
    })),
    recordings: list.map(([text], i) => ({
      id: 'vi-voice-' + i,
      pronunciationId: 'vi-' + i,
      audio: 'audio/vi/voice-' + i + '.mp3',
      realizedTones: text.split(' ').map(toneOf),
      ...(examplesOnly && isReference(text) ? { referenceOnly: true } : {}),
      author: 'Fixture · synthetic voice',
      synthetic: true,
      conversion: 'Synthetic speech generated with a fixture.',
    })),
    references: references.map(([text], i) => ({
      tone: toneOf(text.split(' ')[0]),
      recordingId: 'vi-voice-' + i,
      targetIndex: 0,
    })),
    availability: { ready: true },
  };
}
const catalog = catalogOf(words);

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.route('**/catalogs/vi.json', (route) => route.fulfill({ json: catalog }));
  await page.addInitScript(() => {
    window.__audioPlays = [];
    window.Audio = class {
      constructor(src) {
        this.src = src;
      }
      load() {}
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
});
async function loaded(page, url = '/vietnamese/') {
  await page.goto(url);
  await expect(page.locator('#start-adventure')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}
async function practice(page, choices) {
  await loaded(page);
  await page.locator('#setup-practice').click();
  if (choices) await page.locator('[data-practice-setting="choices"]').selectOption(choices);
  await page.locator('#start-adventure').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'game');
  await page.clock.runFor(150);
  await expect(page.locator('.tone-door').first()).toBeEnabled();
}
const noOverflow = async (page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
// The word being asked, and the tone of its highlighted syllable.
async function current(page) {
  const clip = await page.evaluate(() => window.__audioPlays.at(-1));
  const [text, gloss] = words[catalog.recordings.findIndex((r) => clip.endsWith(r.audio))];
  const index = await page
    .locator('.prompt-syllable')
    .evaluateAll((nodes) => nodes.findIndex((n) => n.classList.contains('is-target')));
  return { text, gloss, parts: text.split(' '), index, tone: toneOf(text.split(' ')[index]) };
}
const shown = async (page) =>
  (await page.locator('.prompt-character').allTextContents()).map((part) => part.trim()).join(' ');

test('the chooser opens a Vietnamese site with the tower only and synthetic voice credits', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.language-card--vietnamese').click();
  await expect(page).toHaveURL(/\/vietnamese\/$/);
  await expect(page.locator('h1')).toHaveText('Practice Vietnamese');
  await expect(page.locator('#destination-title')).toHaveText('Tone Tower');
  await expect(page.locator('.mode-picker')).toHaveCount(0);
  await expect(page.locator('[data-destination="rail"]:visible')).toHaveCount(0);
  await expect(page.locator('.site-language')).toContainText('Vietnamese');
  await expect(page.locator('#setup-practice')).toBeVisible();
  await expect(page.locator('#script-display')).toHaveCount(0);
  await openHeaderMenu(page);
  await page.locator('#about').click();
  const credits = page.getByRole('region', { name: 'Recordings' });
  await expect(credits).toContainText('ElevenLabs voice “Tuan Anh”');
  await credits.getByRole('button', { name: 'Browse recordings' }).click();
  await expect(page.locator('#dialog')).toContainText('Fixture · synthetic voice');
  await expect(page.locator('#dialog')).not.toContainText(/undefined|Wikimedia|Original/);
  await page.locator('#close-dialog').click();
  await expect(page.locator('#progress')).toHaveCount(0);
  await openHeaderMenu(page);
  await page.locator('#learn').click();
  await expect(page).toHaveURL(/\/vietnamese\/guide\/$/);
  await expect(page.getByRole('heading', { name: 'Six tones, five marks' })).toBeVisible();
  await expect(page.locator('.guide-tone .tone-mark')).toHaveCount(6);
  await expect(page.locator('.guide-tone:enabled')).toHaveCount(6);
  // Each tone's example is a whole word, never an isolated syllable.
  expect(await page.locator('.guide-tone mark').allInnerTexts()).toEqual(
    references.map(([text]) => text),
  );
  await page.locator('.guide-tone').nth(3).click();
  expect(await page.evaluate(() => window.__audioPlays.at(-1))).toMatch(/tuananh-mai4-mai4\.mp3$/);
  await page.goto('/vietnamese/about/');
  await expect(page.locator('.about-page .info-card')).toHaveCount(1);
  await expect(page.locator('.about-page')).toContainText('synthetic speech');
  await expect(page.locator('.about-page')).not.toContainText(/Skyrail|human speech/);
  await noOverflow(page);
});

test('six doors show tone marks and names, and every cover leaves once a door is chosen', async ({
  page,
}) => {
  await practice(page, '6');
  const doors = page.locator('.tone-door');
  await expect(doors).toHaveCount(6);
  await expect(page.locator('.tone-door .tone-mark')).toHaveCount(6);
  expect((await page.locator('.tone-symbol').allInnerTexts()).join('')).not.toMatch(/[0-9]/);
  expect(await page.locator('.tone-name').allInnerTexts()).toEqual([
    'dấu sắc',
    'dấu huyền',
    'dấu hỏi',
    'dấu ngã',
    'dấu nặng',
    'không dấu',
  ]);
  // Each mark and its name stay inside their own door on every screen size.
  for (const door of await doors.all()) {
    const frame = await door.boundingBox();
    for (const part of [door.locator('.tone-mark'), door.locator('.tone-name')]) {
      const box = await part.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(frame.x - 4);
      expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 4);
      expect(box.y).toBeGreaterThanOrEqual(frame.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    }
  }

  // A whole word is asked.
  const { text, gloss, parts, index, tone } = await current(page);
  expect(parts.length).toBeGreaterThan(1);
  expect((await shown(page)).normalize('NFD')).toBe(toneless(text));
  await expect(page.locator('.tone-cover')).toHaveCount(parts.length);
  await expect(page.locator('.tone-cover-top').first()).toBeVisible();
  await expect(page.locator('.tone-cover-bottom').first()).toBeVisible();
  await expect(page.locator('.is-target')).toHaveCount(1);
  await expect(page.locator('.prompt-romanization.is-reserved')).toBeHidden();
  // The meaning is shown from the start.
  await expect(page.locator('.prompt-gloss')).toHaveText(gloss ?? '');
  // Each cover sits over its own marked letter without leaving the prompt.
  const question = await page.locator('.scene-question').boundingBox();
  for (const carrier of await page.locator('.tone-carrier').all()) {
    const letter = await carrier.boundingBox(),
      creature = await carrier.locator('.tone-cover-top').boundingBox();
    expect(creature.y).toBeGreaterThanOrEqual(question.y);
    expect(creature.y + creature.height).toBeLessThan(letter.y + letter.height / 2);
    expect(Math.abs(creature.x + creature.width / 2 - (letter.x + letter.width / 2))).toBeLessThan(
      2,
    );
  }
  const before = await page.locator('.prompt-syllables').boundingBox();

  await page.locator('.tone-door[data-tone="' + tone + '"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  expect(await shown(page)).toBe(text);
  await expect(page.locator('.is-target .prompt-romanization')).toHaveText(toneName(tone));
  expect(
    (await page.locator('.prompt-syllable:not(.is-target) .prompt-romanization').allInnerTexts())
      .join('')
      .trim(),
  ).toBe('');
  await expect(page.locator('.prompt-gloss')).toHaveText(gloss ?? '');
  // Revealing the answer does not move or resize the word.
  expect(await page.locator('.prompt-syllables').boundingBox()).toEqual(before);
  await expect(page.locator('.recording-report')).toHaveCount(0);
  await page.clock.runFor(1900);
  await expect(page.locator('.tone-cover.is-leaving')).toHaveCount(0);
  await expect(page.locator('.tone-cover')).toHaveCount((await current(page)).parts.length);
  await noOverflow(page);
});

test('a wrong door names both tones, and number keys follow the door order', async ({ page }) => {
  await practice(page, '6');
  const order = ['sắc', 'huyền', 'hỏi', 'ngã', 'nặng', 'ngang'];
  const { text, tone } = await current(page);
  const wrong = order.find((value) => value !== tone);
  await page.keyboard.press(String(order.indexOf(wrong) + 1));
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'wrong');
  await expect(page.locator('#tower-message')).toContainText(
    new RegExp(toneName(wrong) + '\\. The correct tone is ' + toneName(tone), 'i'),
  );
  await expect(page.locator('.scene-review-action .recording-report')).toHaveAttribute(
    'href',
    /github\.com.*issues\/new/,
  );
  expect(await shown(page)).toBe(text);
  await expect(page.locator('.tone-door.is-answer')).toHaveAttribute('data-tone', tone);
  await noOverflow(page);
});

for (const text of ['trung học chuyên nghiệp', 'nghiêng nghiêng', 'phòng thí nghiệm'])
  test('a long word stays on one line beside Replay: ' + text, async ({ page }) => {
    await page.route('**/catalogs/vi.json', (route) =>
      route.fulfill({ json: catalogOf([...references, [text]], { examplesOnly: true }) }),
    );
    await loaded(page);
    // A climb with a single word asks that word on its first floor.
    await page.locator('#start-adventure').click();
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'game');
    await page.clock.runFor(2300);
    await expect(page.locator('.tone-door').first()).toBeEnabled();
    expect((await shown(page)).normalize('NFD')).toBe(toneless(text));
    const syllables = await page
      .locator('.prompt-syllable')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    const replay = await page.locator('#replay-word').boundingBox(),
      question = await page.locator('.scene-question').boundingBox();
    expect(new Set(syllables.map((box) => Math.round(box.top))).size).toBe(1);
    expect(syllables[0].left).toBeGreaterThanOrEqual(question.x);
    expect(syllables.at(-1).right).toBeLessThanOrEqual(replay.x);
    // No syllable is broken across lines around its covered letter.
    for (const character of await page.locator('.prompt-character').all()) {
      const box = await character.boundingBox(),
        size = parseFloat(await character.evaluate((node) => getComputedStyle(node).fontSize));
      expect(box.height).toBeLessThan(size * 2);
    }
    await noOverflow(page);
  });

test('a meaning that quotes Vietnamese shows it without tones until a door is chosen', async ({
  page,
}) => {
  const text = 'cứu sinh',
    gloss = 'lifesaving (áo cứu sinh)';
  await page.route('**/catalogs/vi.json', (route) =>
    route.fulfill({ json: catalogOf([...references, [text, gloss]], { examplesOnly: true }) }),
  );
  await loaded(page);
  await page.locator('#start-adventure').click();
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'game');
  await page.clock.runFor(2300);
  await expect(page.locator('.tone-door').first()).toBeEnabled();
  await expect(page.locator('.prompt-gloss')).toHaveText('lifesaving (ao cưu sinh)');
  const before = await page.locator('.prompt-gloss').boundingBox();
  const index = await page
    .locator('.prompt-syllable')
    .evaluateAll((nodes) => nodes.findIndex((n) => n.classList.contains('is-target')));
  const tone = toneOf(text.split(' ')[index]);
  await page.locator('.tone-door[data-tone="' + tone + '"]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await expect(page.locator('.prompt-gloss')).toHaveText(gloss);
  // The meaning keeps its place when its tones return.
  const after = await page.locator('.prompt-gloss').boundingBox();
  expect(after.y).toBe(before.y);
  expect(after.height).toBe(before.height);
  await noOverflow(page);
});

test('reduced motion shows the answer without the leaving cover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await practice(page);
  await expect(page.locator('.tone-cover').first()).toBeVisible();
  const { text, tone } = await current(page);
  await page.locator('.tone-door[data-tone="' + tone + '"]').click();
  expect(await shown(page)).toBe(text);
  await expect(page.locator('.tone-cover').first()).toBeHidden();
});

test('Vietnamese saves stay separate and About links to each language home', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('soundbound-cantonese-v1', 'cantonese-sentinel');
    localStorage.setItem('soundbound-mandarin-v1', 'mandarin-sentinel');
  });
  await practice(page, '6');
  const { tone } = await current(page);
  await page.locator('.tone-door[data-tone="' + tone + '"]').click();
  await page.locator('#finish-practice').click();
  const saves = await page.evaluate(() => ({
    vi: localStorage.getItem('soundbound-vietnamese-v1'),
    yue: localStorage.getItem('soundbound-cantonese-v1'),
    cmn: localStorage.getItem('soundbound-mandarin-v1'),
  }));
  expect(saves.vi).toBeTruthy();
  expect(saves.yue).toBe('cantonese-sentinel');
  expect(saves.cmn).toBe('mandarin-sentinel');
  await openHeaderMenu(page);
  await page.locator('#about').click();
  const otherLanguages = page.getByRole('region', { name: 'Other languages' });
  await expect(
    otherLanguages.getByRole('link', { name: 'Play Tone Tower in Mandarin' }),
  ).toHaveAttribute('href', /mandarin\/$/);
  await otherLanguages.getByRole('link', { name: 'Play Tone Tower in Cantonese' }).click();
  await expect(page).toHaveURL(/cantonese\/$/);
});

test('home keyboard shortcuts keep Vietnamese on its supported tower', async ({ page }) => {
  await loaded(page);
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('End');
  await expect(page.locator('#destination-title')).toHaveText('Tone Tower');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#destination-title')).toHaveText('Tone Tower');
  await expect(page.locator('[data-mode-card][data-destination="rail"]:visible')).toHaveCount(0);
});
