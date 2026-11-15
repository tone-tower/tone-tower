import { test, expect } from '@playwright/test';

const entries = [1, 2, 3, 4].map((t) => ({
  id: 'ma' + t,
  forms: { default: '妈', simplified: '妈', traditional: '媽' },
  gloss: 'fixture',
}));
entries.push(
  {
    id: 'mother',
    forms: { default: '妈妈', simplified: '妈妈', traditional: '媽媽' },
    gloss: 'mother',
  },
  {
    id: 'greeting',
    forms: { default: '你好', simplified: '你好', traditional: '你好' },
    gloss: 'hello',
  },
);
const pronunciations = [1, 2, 3, 4].map((t) => ({
  id: 'ma' + t,
  entryId: 'ma' + t,
  syllables: [{ forms: { simplified: '妈', traditional: '媽' }, transcription: 'ma' + t, tone: t }],
}));
pronunciations.push(
  {
    id: 'mother',
    entryId: 'mother',
    syllables: [
      { forms: { simplified: '妈', traditional: '媽' }, transcription: 'ma1', tone: 1 },
      { forms: { simplified: '妈', traditional: '媽' }, transcription: 'ma5', tone: 5 },
    ],
  },
  {
    id: 'greeting',
    entryId: 'greeting',
    syllables: [
      { text: '你', transcription: 'ni3', tone: 3 },
      { text: '好', transcription: 'hao3', tone: 3 },
    ],
  },
);
const catalog = {
  version: 2,
  language: 'cmn',
  transcriptionSystem: 'pinyin',
  entries,
  pronunciations,
  recordings: pronunciations.map((p) => ({
    id: p.id,
    pronunciationId: p.id,
    audio: 'audio/' + p.id + '.mp3',
    realizedTones: p.id === 'greeting' ? [2, 3] : p.syllables.map((s) => s.tone),
  })),
  references: [1, 2, 3, 4]
    .map((t) => ({ tone: t, recordingId: 'ma' + t, targetIndex: 0 }))
    .concat([{ tone: 5, recordingId: 'mother', targetIndex: 1 }]),
  availability: { ready: true, mode: 'beta' },
};

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.route('**/catalogs/cmn.json', (route) => route.fulfill({ json: catalog }));
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
async function loaded(page, url = '/mandarin/') {
  await page.goto(url);
  await expect(page.locator('.mode-cards')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
}
const noOverflow = async (page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('chooser loads no catalog and language navigation stays in Mandarin', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => {
    if (/catalogs\/|\.mp3/.test(r.url())) requests.push(r.url());
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Which language will you explore?' }),
  ).toBeVisible();
  expect(requests).toEqual([]);
  await page.locator('.language-card--mandarin').click();
  await expect(page.locator('h1')).toHaveText('Choose a game');
  await page.locator('#credits').click();
  await expect(page.locator('#dialog')).toContainText('CC-CEDICT');
  await expect(page.locator('#dialog')).not.toContainText('CC-Canto');
  await page.locator('#close-dialog').click();
  expect(
    requests.filter((url) => url.includes('/catalogs/')).every((url) => url.endsWith('/cmn.json')),
  ).toBe(true);
  await page.locator('#learn').click();
  await expect(page.locator('.brand')).toHaveAttribute(
    'href',
    new URL('/mandarin/', page.url()).href,
  );
  await expect(page.locator('#home')).toHaveAttribute(
    'href',
    new URL('/mandarin/', page.url()).href,
  );
  await expect(page.locator('#learn')).toHaveAttribute(
    'href',
    new URL('/mandarin/guide/', page.url()).href,
  );
  await expect(page.locator('[data-nav-page="about"]')).toHaveAttribute(
    'href',
    new URL('/mandarin/about/', page.url()).href,
  );
  await expect(page).toHaveURL(/\/mandarin\/guide\/$/);
  await expect(page.getByRole('heading', { name: 'Four tones and a neutral tone' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pinyin guide', exact: true })).toBeVisible();
  await page.locator('.brand').click();
  await expect(page).toHaveURL(/\/mandarin\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/mandarin\/guide\/$/);
  expect((await page.request.get('/guide/')).status()).toBe(404);
  await noOverflow(page);
});

test('Mandarin practice renders five doors and accepts neutral-tone keyboard answers', async ({
  page,
}) => {
  await loaded(page);
  await page.locator('#setup-practice').click();
  await page.locator('[data-practice-setting="choices"]').selectOption('5');
  await page.locator('#start-adventure').click();
  await page.clock.runFor(150);
  await expect(page.locator('.tone-door')).toHaveCount(5);
  await expect(page.locator('.tone-door .tone-symbol')).toHaveText(['ˉ', 'ˊ', 'ˇ', 'ˋ', 'Neutral']);
  await expect(page.locator('.tone-door').first()).toBeEnabled();
  const clip = await page.evaluate(() => window.__audioPlays.at(-1));
  const recording = catalog.recordings.find((r) => new URL(clip).pathname.endsWith('/' + r.audio));
  const target = await page.locator('.is-target .prompt-character').innerText();
  // Single reference words and the first mother syllable share text; use the highlighted index.
  const index = await page
    .locator('.prompt-syllable')
    .evaluateAll((nodes) => nodes.findIndex((n) => n.classList.contains('is-target')));
  await page.keyboard.press(String(recording.realizedTones[index]));
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await expect(page.locator('.recording-report')).toHaveAttribute(
    'href',
    /github\.com.*issues\/new/,
  );
  await noOverflow(page);
});

test('navigation separates language switching, learning, and project information', async ({
  page,
}) => {
  await loaded(page);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Records', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-nav-page="about"]')).toHaveCount(1);
  await expect(page.locator('.site-header [data-nav-page="about"]')).toHaveText('About');
  await expect(page.locator('.site-footer a')).toHaveCount(0);
  await expect(page.locator('.site-footer #script-display')).toHaveCount(0);
  await expect(page.locator('.learning-toolbar')).toHaveCount(0);
  await expect(page.locator('#script-display')).toBeHidden();
  await page.locator('.language-switcher summary').click();
  await expect(page.getByLabel('Characters', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#learn').click();
  const switcher = page.locator('.language-switcher');
  await switcher.locator('summary').click();
  await expect(page.locator('[data-language-link="yue"]')).toHaveAttribute(
    'href',
    /\/cantonese\/guide\/$/,
  );
  await expect(page.locator('[data-language-link="cmn"]')).toHaveAttribute(
    'href',
    /\/mandarin\/guide\/$/,
  );
  await page.keyboard.press('Escape');
  await expect(switcher).not.toHaveAttribute('open');
  await expect(switcher.locator('summary')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Records', exact: true })).toHaveCount(0);
  await page.locator('#home').click();
  await page.locator('#setup-practice').click();
  await page.locator('[data-mode-card][data-destination="rail"]').click();
  await expect(page.locator('#setup-practice')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#start-adventure')).toHaveText('Start spelling practice →');
  await expect(page.locator('#home')).toHaveAttribute(
    'href',
    new URL('/mandarin/', page.url()).href,
  );
  await noOverflow(page);
});

test('Pinyin typing supports composition, Space replay, tone buttons, and script switching', async ({
  page,
}) => {
  await loaded(page);
  await page.locator('[data-mode-card][data-destination="rail"]').click();
  await page.locator('#setup-practice').click();
  await page.locator('[data-practice-setting="variant"]').check();
  await page.locator('#start-adventure').click();
  await page.clock.runFor(150);
  const input = page.locator('#transcription-answer');
  await expect(page.locator('.typing-tools')).toBeVisible();
  await expect(page.locator('[data-insert="ü"]')).toHaveCount(0);
  await expect(page.locator('#typed-help, .typing-hint, .keyboard')).toHaveCount(0);
  await page.locator('.language-switcher summary').click();
  await page.locator('#script-display').selectOption('traditional');
  await page.keyboard.press('Escape');
  await expect(input).toBeEnabled();
  const clip = await page.evaluate(() => window.__audioPlays.at(-1));
  const p = pronunciations.find((p) => new URL(clip).pathname.endsWith('/audio/' + p.id + '.mp3'));
  const expected = p.syllables.map((s) => s.transcription).join(' ');
  await input.dispatchEvent('compositionstart');
  await input.fill(expected);
  await expect(page.locator('#app')).not.toHaveAttribute('data-outcome', 'success');
  await input.dispatchEvent('compositionend');
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await page.clock.runFor(1050);
  await input.focus();
  await input.fill('er');
  const plays = await page.evaluate(() => window.__audioPlays.length);
  await input.press('Space');
  await expect(input).toHaveValue('er');
  expect(await page.evaluate(() => window.__audioPlays.length)).toBe(plays + 1);
  await input.press('r');
  await expect(input).toHaveValue('err');
  expect(await page.evaluate(() => window.__audioPlays.length)).toBe(plays + 1);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('soundbound-mandarin-v1')).settings.script,
    ),
  ).toBe('traditional');
  if (page.viewportSize().width <= 700) {
    await page.setViewportSize({ width: page.viewportSize().width, height: 450 });
    await input.focus();
    await expect(input).toBeInViewport();
  }
  await noOverflow(page);
});

test('unavailable collection keeps the guide usable and games closed', async ({ page }) => {
  await page.route('**/catalogs/cmn.json', (route) =>
    route.fulfill({
      json: {
        ...catalog,
        entries: [],
        pronunciations: [],
        recordings: [],
        references: [],
        availability: { ready: false },
      },
    }),
  );
  await loaded(page);
  await expect(page.locator('.content-preview')).toContainText('gathering enough recordings');
  await expect(page.locator('#start-adventure')).toBeDisabled();
  await page.locator('#learn').click();
  await expect(page.getByRole('heading', { name: 'Pinyin guide', exact: true })).toBeVisible();
  await noOverflow(page);
});

test('reduced motion and blocked local storage still allow a language game', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw Error('blocked storage');
      },
    });
  });
  await loaded(page);
  await page.locator('#setup-practice').click();
  await page.locator('#start-adventure').click();
  await page.clock.runFor(150);
  await expect(page.locator('.tone-door').first()).toBeEnabled();
  await noOverflow(page);
});

test('home leads with games and keeps pronunciation introductions in the guides', async ({
  page,
}) => {
  for (const language of ['cantonese', 'mandarin']) {
    await page.goto('/' + language + '/');
    await expect(page.getByRole('heading', { name: 'Choose a game', level: 1 })).toBeVisible();
    await expect(page.locator('.home-intro, .transcription-intro, .beta-notice')).toHaveCount(0);
    await expect(page.locator('[data-mode-card]')).toHaveCount(2);
    await expect(page.locator('#learn')).toBeVisible();
    await noOverflow(page);
  }
});

test('About retains the original sections, game cards, privacy, and feedback links', async ({
  page,
}) => {
  for (const language of ['cantonese', 'mandarin']) {
    await page.goto('/' + language + '/about/');
    await expect(page.locator('.about-page h1')).toHaveText('About Tone Tower');
    await expect(page.locator('.about-page .info-card')).toHaveCount(2);
    for (const name of [
      'What you can practise',
      'Games and practice',
      'Recordings and sources',
      'Progress and privacy',
      'An open-source side project',
      'Help make it better',
    ])
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Report a problem ↗' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Suggest an idea ↗' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'explore it on GitHub ↗' })).toBeVisible();
    await noOverflow(page);
  }
});

test('Pinyin helpers insert once across answers, pause, script changes and audio recovery', async ({
  page,
}) => {
  await loaded(page);
  await page.locator('[data-mode-card][data-destination="rail"]').click();
  await page.locator('#setup-practice').click();
  await page.locator('[data-practice-setting="variant"]').check();
  await page.locator('#start-adventure').click();
  await page.clock.runFor(150);
  const input = page.locator('#transcription-answer');
  const check = async () => {
    await expect(page.locator('[data-insert="ü"]')).toHaveCount(0);
    await input.fill('lv');
    await page.locator('[data-insert="2"]').click();
    await expect(input).toHaveValue('lǘ');
    expect(await input.evaluate((n) => n.selectionStart)).toBe(2);
    await page.locator('[data-insert="5"]').click();
    await expect(input).toHaveValue('lü');
    await input.dispatchEvent('compositionstart');
    await page.locator('[data-insert="3"]').click();
    await expect(input).toHaveValue('lü');
    await input.dispatchEvent('compositionend');
  };
  await check();
  await page.locator('#pause-run').click();
  await page.locator('#resume-game').click();
  await check();
  await page.locator('.language-switcher summary').click();
  await page.locator('#script-display').selectOption('traditional');
  await page.keyboard.press('Escape');
  await check();
  const clip = await page.evaluate(() => window.__audioPlays.at(-1));
  const recording = catalog.recordings.find((r) => new URL(clip).pathname.endsWith('/' + r.audio));
  const reading = pronunciations.find((p) => p.id === recording.pronunciationId);
  await input.fill(reading.syllables.map((s) => s.transcription).join(' '));
  await expect(page.locator('#app')).toHaveAttribute('data-outcome', 'success');
  await page.clock.runFor(1050);
  await check();
  await page.evaluate(() => {
    window.__originalAudioPlay = window.Audio.prototype.play;
    window.Audio.prototype.play = () => Promise.reject(Error('Fixture playback failure'));
  });
  await page.locator('#replay-word').click();
  await expect(page.locator('#replace-recording')).toBeVisible();
  await page.evaluate(() => {
    window.Audio.prototype.play = window.__originalAudioPlay;
  });
  await page.locator('#replay-word').click();
  await page.clock.runFor(150);
  await expect(page.locator('#check-answer')).toBeEnabled();
  await check();
});
