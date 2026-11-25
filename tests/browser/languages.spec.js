import { test, expect } from '@playwright/test';
import { openHeaderMenu } from '../helpers/header-menu.js';

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

test('the selector centers the title and fits all three language cards in the viewport', async ({
  page,
}) => {
  await page.goto('/');
  const brand = await page.locator('.brand').boundingBox();
  const header = await page.locator('.site-header').boundingBox();
  expect(brand.x + brand.width / 2).toBeCloseTo(header.x + header.width / 2, 1);
  await expect(page.locator('.brand-wordmark')).toHaveText('Tone Tower');
  await expect(page.locator('.brand svg')).toBeVisible();
  const cards = page.locator('.language-card');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card).toBeInViewport({ ratio: 1 });
    expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(100);
  }
  await noOverflow(page);
});

test('Start is fully in view before scrolling on all language homes', async ({ page }) => {
  const size = page.viewportSize();
  if (size.width > 700) await page.setViewportSize({ width: 1280, height: 720 });
  for (const language of ['cantonese', 'mandarin', 'vietnamese']) {
    await page.goto('/' + language + '/');
    const start = page.locator('#start-adventure');
    await expect(start).toBeVisible();
    await expect(start).toBeInViewport({ ratio: 1 });
    await page.locator('#setup-practice').click();
    await expect(start).toBeInViewport({ ratio: 1 });
  }
});

test('guide playback works before the game library is requested, and Start can retry', async ({
  page,
}) => {
  let requests = 0;
  const firstResponse = Promise.withResolvers();
  await page.route('**/catalogs/cmn.json', async (route) => {
    if (++requests === 1) {
      await firstResponse.promise;
      await route.fulfill({ status: 503 });
    } else await route.fulfill({ json: catalog });
  });
  await loaded(page);
  await openHeaderMenu(page);
  await page.locator('#learn').click();
  await page.locator('.guide-tone[data-guide-tone="3"]').click();
  await page.clock.runFor(150);
  await expect(page.locator('#guide-status')).toContainText('mǎ');
  await page.locator('.brand').click();
  expect(requests).toBe(0);

  const start = page.locator('#start-adventure');
  await page.locator('#setup-practice').click();
  try {
    await start.click();
    await expect(start).toBeDisabled();
    await expect(page.locator('#setup-status')).toContainText('Loading');
    await expect(page.locator('#app')).toHaveAttribute('data-view', 'home');
  } finally {
    firstResponse.resolve();
  }
  await expect(page.locator('#setup-error')).toContainText('Couldn’t load the recording library');
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole('heading', { name: 'Practice tones' })).toBeVisible();
  expect(requests).toBe(2);
});

test('chooser loads no catalog and language navigation stays in Mandarin', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => {
    if (/catalogs\/|\.mp3/.test(r.url())) requests.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose a language' })).toBeVisible();
  expect(requests).toEqual([]);
  await expect(page.locator('.language-card h2')).toHaveText([
    'Mandarin',
    'Cantonese',
    'Vietnamese',
  ]);
  await page.locator('.language-card--mandarin').click();
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible();
  await openHeaderMenu(page);
  await page.locator('#about').click();
  const credits = page.getByRole('region', { name: 'Recordings' });
  await credits.getByText('Data and software credits').click();
  await expect(credits.getByRole('link', { name: 'CC-CEDICT' })).toBeVisible();
  await expect(credits).not.toContainText('CC-Canto');
  expect(requests).toEqual([]);
  const browse = credits.getByRole('button', { name: 'Browse recordings' });
  await browse.click();
  await expect(page.getByRole('heading', { name: 'Recording directory' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Find a recording' });
  await search.fill('hao');
  await expect(page.locator('#credit-results [role="status"]')).toHaveText('1–1 of 1 recordings');
  await expect(page.locator('#credit-results tbody')).toContainText('nǐ hǎo');
  const report = page.getByRole('link', { name: 'Report this recording' });
  await expect(report).toBeVisible();
  expect(new URL(await report.getAttribute('href')).searchParams.get('context')).toMatch(
    /^Where: Voices & credits\nLanguage: Mandarin\n/,
  );
  await page.locator('#close-dialog').click();
  await expect(browse).toBeFocused();
  expect(
    requests.filter((url) => url.includes('/catalogs/')).every((url) => url.endsWith('/cmn.json')),
  ).toBe(true);
  await openHeaderMenu(page);
  await page.locator('#learn').click();
  await expect(page.locator('.brand')).toHaveAttribute(
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
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'game');
  await page.clock.runFor(150);
  await expect(page.locator('.tone-door')).toHaveCount(5);
  await expect(page.locator('.tone-door .tone-mark')).toHaveCount(5);
  await expect(page.locator('.tone-door .tone-mark.is-blank')).toHaveCount(1);
  await expect(page.locator('.tone-door .tone-name')).toHaveText([
    'Tone 1',
    'Tone 2',
    'Tone 3',
    'Tone 4',
    'Neutral tone',
  ]);
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
  await expect(page.locator('.recording-report')).toHaveCount(0);
  await noOverflow(page);
});

test('navigation separates language switching, learning, and project information', async ({
  page,
}) => {
  await loaded(page);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Records', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-nav-page="about"]')).toHaveCount(1);
  await expect(page.locator('.site-header [data-nav-page="about"]')).toHaveText('About');
  await expect(page.locator('.site-footer')).toHaveCount(0);
  await expect(page.locator('.site-language')).toHaveText('Mandarin');
  await expect(
    page.locator('.site-header').getByRole('radio', { name: 'Simplified' }),
  ).toBeChecked();
  await openHeaderMenu(page);
  await page.locator('#learn').click();
  await expect(page.getByRole('heading', { name: 'Pinyin guide', exact: true })).toBeVisible();
  await page.locator('.brand').click();
  await page.locator('#setup-practice').click();
  await page.locator('[data-mode-card][data-destination="rail"]').click();
  await expect(page.locator('#setup-practice')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#start-adventure')).toHaveText('Start spelling practice →');
  await expect(page.locator('.brand')).toHaveAttribute(
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
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'game');
  await page.clock.runFor(150);
  const input = page.locator('#transcription-answer');
  await expect(page.locator('.typing-tools')).toBeVisible();
  await expect(page.locator('[data-insert="ü"]')).toHaveCount(0);
  await expect(page.locator('#typed-help, .typing-hint, .keyboard')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Traditional' }).check();
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
  await page.locator('#finish-practice').click();
  const results = page.getByRole('heading', { name: 'Practice complete' });
  await expect(results).toBeVisible();
  await page.getByRole('radio', { name: 'Simplified' }).check();
  await expect(results).toBeVisible();
  await noOverflow(page);
});

test('rapid Skyrail keys cannot activate navigation or dismiss a finished run', async ({
  page,
}) => {
  await loaded(page);
  await page.locator('[data-mode-card][data-destination="rail"]').click();
  await page.locator('[data-difficulty="extreme"]').click();
  await page.locator('#start-adventure').click();
  await expect(page.locator('#app')).toHaveAttribute('data-world', 'tide');
  await page.clock.runFor(150);
  const input = page.locator('#transcription-answer');
  await input.fill('zz');

  await openHeaderMenu(page);
  await page.locator('#about').click();
  await expect(page.getByRole('heading', { name: 'Go to About?' })).toBeVisible();
  await expect(page.locator('#dialog')).toBeHidden();
  await expect(page).toHaveURL(/mandarin\/$/);
  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('zz');

  await page.evaluate(() => history.pushState(null, '', '/mandarin/about/'));
  await page.goBack();
  await expect(page).toHaveURL(/mandarin\/$/);
  await expect(page.locator('.pause-overlay')).toHaveCount(0);

  await openHeaderMenu(page);
  await page.locator('.game-layout').focus();
  await page.keyboard.down('Enter');
  const about = page.locator('#about');
  await about.focus();
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page.locator('.pause-overlay')).toHaveCount(0);
  await expect(page).toHaveURL(/mandarin\/$/);

  await about.press('Enter');
  await expect(page.getByRole('heading', { name: 'Go to About?' })).toBeVisible();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('zz');
  await page.keyboard.press('Space');
  await page.clock.fastForward(16000);
  await expect(page.getByRole('heading', { name: 'Skyrail run ended.' })).toBeFocused();
  await expect(
    page.locator('.run-conclusion').getByRole('button', { name: /practice/i }),
  ).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(page.locator('.run-conclusion')).toBeVisible();
  await expect(page).toHaveURL(/\/mandarin\/$/);
  await openHeaderMenu(page);
  await page.locator('#about').click();
  await expect(page).toHaveURL(/mandarin\/about\/$/);
  await expect(page.locator('.pause-overlay')).toHaveCount(0);
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
  await page.locator('#start-adventure').click();
  await expect(page.locator('.content-preview')).toBeVisible();
  await expect(page.locator('.content-preview')).toContainText('gathering enough recordings');
  await expect(page.locator('#start-adventure')).toBeDisabled();
  await openHeaderMenu(page);
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
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'game');
  await page.clock.runFor(150);
  await expect(page.locator('.tone-door').first()).toBeEnabled();
  await noOverflow(page);
});

test('language homes have a brief introduction and guide link above the games', async ({
  page,
}) => {
  for (const [language, subject] of [
    ['cantonese', 'Jyutping'],
    ['mandarin', 'Pinyin'],
    ['vietnamese', 'Vietnamese'],
  ]) {
    await page.goto('/' + language + '/');
    const intro = page.locator('.home-welcome');
    const heading = intro.getByRole('heading', { level: 1 });
    const guideLabel = language === 'vietnamese' ? 'Vietnamese tone guide' : `New to ${subject}?`;
    const link = intro.getByRole('link', { name: guideLabel + ' Open the guide', exact: true });
    await expect(heading).toHaveText('Practice ' + subject);
    await expect(link).toHaveAttribute(
      'href',
      new URL('/' + language + '/guide/', page.url()).href,
    );
    await expect(intro.locator('[data-info-action="practice"]')).toHaveCount(0);
    await expect(page.locator('.home-learning, .targets')).toHaveCount(0);
    if (page.viewportSize().width > 700) {
      const titleBox = await heading.boundingBox();
      const guideBox = await link.boundingBox();
      expect(guideBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
      expect(guideBox.y).toBeLessThan(titleBox.y + titleBox.height);
    }
    const introBox = await intro.boundingBox();
    const gamesBox = await page.locator('.mode-picker, .home-world').first().boundingBox();
    expect(introBox.y + introBox.height).toBeLessThanOrEqual(gamesBox.y);
    await link.click();
    await expect(page).toHaveURL(new RegExp('/' + language + '/guide/$'));
    await page.locator('.brand').click();
    await noOverflow(page);
  }
});

test('About covers games, recordings, and ways to contribute', async ({ page }) => {
  for (const [language, subject] of Object.entries({
    cantonese: 'Jyutping',
    mandarin: 'Pinyin',
    vietnamese: 'Vietnamese',
  })) {
    await page.goto('/' + language + '/about/');
    await expect(page.locator('.about-page h1')).toHaveText('About Tone Tower');
    await expect(page.locator('.about-page .info-card')).toHaveCount(
      language === 'vietnamese' ? 1 : 2,
    );
    await expect(page.locator('.about-heading .lead')).toContainText(
      'Tone Tower is a browser game for practising ' + subject,
    );
    await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Practice Mode', exact: true })).toHaveAttribute(
      'href',
      new URL('/' + language + '/practice/', page.url()).href,
    );
    const recordings = page.getByRole('region', { name: 'Recordings' });
    await expect(recordings.getByRole('button', { name: 'Browse recordings' })).toBeVisible();
    const license = recordings.getByRole('link', {
      name: 'MIT licensed code',
      includeHidden: true,
    });
    await expect(license).toBeHidden();
    await recordings.getByText('Data and software credits').click();
    await expect(license).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset saved progress…' })).toHaveCount(0);
    const contributions = page.getByRole('region', { name: 'Project and feedback' });
    const repository = 'https://github.com/tonetower/tonetower.github.io';
    for (const [name, path] of [
      ['GitHub repository', ''],
      ['Report a problem ↗', '/issues/new?template=bug-report.yml'],
      ['Share an idea or feedback ↗', '/discussions/new?category=ideas-feedback'],
      ['Browse discussions ↗', '/discussions'],
    ]) {
      const link = contributions.getByRole('link', { name });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', repository + path);
    }
    const others = page.getByRole('region', { name: 'Other languages' });
    await expect(others.getByRole('link')).toHaveCount(2);
    for (const other of ['cantonese', 'mandarin', 'vietnamese'].filter((item) => item !== language))
      await expect(others.getByRole('link', { name: new RegExp(other, 'i') })).toHaveAttribute(
        'href',
        new URL('/' + other + '/', page.url()).href,
      );
    await noOverflow(page);
    const home = page.getByRole('link', { name: '← Home' });
    await home.click();
    await expect(page).toHaveURL(new URL('/' + language + '/', page.url()).href);
    await page.goBack();
    await page.getByRole('link', { name: 'New to ' + subject + '? Open the guide' }).click();
    await expect(page).toHaveURL(new URL('/' + language + '/guide/', page.url()).href);
    await page.locator('.page-heading .back-link').click();
    await expect(page).toHaveURL(new URL('/' + language + '/', page.url()).href);
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
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'game');
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
  await page.getByRole('radio', { name: 'Traditional' }).check();
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
