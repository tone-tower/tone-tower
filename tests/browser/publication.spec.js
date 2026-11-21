import { test, expect } from '@playwright/test';
for (const base of [
  'http://127.0.0.1:4176/',
  'http://127.0.0.1:4177/release-check/renamed-project/',
]) {
  test(
    'static About links work with JavaScript disabled at ' + new URL(base).pathname,
    async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      try {
        const page = await context.newPage();
        await page.goto(base + 'cantonese/about/');
        await expect(page.getByRole('region', { name: 'Recordings' })).toBeVisible();
        await page
          .getByRole('region', { name: 'Other languages' })
          .getByRole('link', { name: 'Play Tone Tower in Vietnamese' })
          .click();
        await expect(page).toHaveURL(base + 'vietnamese/');
      } finally {
        await context.close();
      }
    },
  );

  for (const language of ['cantonese', 'mandarin', 'vietnamese'])
    test(
      'built ' + language + ' routes, assets and playback resolve at ' + new URL(base).pathname,
      async ({ page }) => {
        const errors = [],
          failed = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('response', (r) => {
          if (r.status() >= 400) failed.push(r.url());
        });
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
              this.end = setTimeout(() => this.onended?.(), 30);
              return Promise.resolve();
            }
          };
        });
        await page.goto(base);
        await expect(page.locator('.language-card--mandarin')).toBeVisible();
        await expect(page.locator('.language-card--vietnamese')).toBeVisible();
        await page.goto(base + language + '/guide/');
        await expect(page.locator('.info-page h1')).toBeVisible();
        if (language === 'mandarin') {
          await expect(page.locator('.info-page h1')).toHaveText('Pinyin guide');
          await page.locator('[data-guide-word="commons-124599289"]').click();
          const guideAudio = await page.evaluate(() => window.__audioPlays.at(-1));
          expect(guideAudio).toBe(base + 'audio/cmn/commons-124599289.mp3');
          expect((await page.request.get(guideAudio)).status()).toBe(200);
          for (const tone of [1, 2, 3, 4]) {
            await page.locator('.guide-tones [data-guide-tone="' + tone + '"]').click();
            await expect
              .poll(() => page.evaluate(() => window.__audioPlays.at(-1)))
              .toContain(base + 'audio/cmn/commons-83387745-ma' + tone + '-');
            const toneAudio = await page.evaluate(() => window.__audioPlays.at(-1));
            const response = await page.request.get(toneAudio);
            expect(response.status()).toBe(200);
            expect(response.headers()['content-type']).toMatch(/^audio\/mpeg/);
          }
        }
        if (language === 'vietnamese') {
          await expect(page.getByRole('heading', { name: 'Six tones, five marks' })).toBeVisible();
          await page.locator('[data-guide-tone="ngã"]').click();
          const guideAudio = await page.evaluate(() => window.__audioPlays.at(-1));
          expect(guideAudio).toBe(base + 'audio/vi/tuananh-mai4-mai4.mp3');
          expect((await page.request.get(guideAudio)).status()).toBe(200);
        }
        await page.locator('.brand').click();
        await expect(page.locator('#start-adventure')).toBeVisible();
        await expect(page.locator('.site-header [data-nav-page="about"]')).toHaveText('About');
        await expect(page.locator('#progress, #reward-hint')).toHaveCount(0);
        await expect(page.locator('.home-world')).not.toContainText('Tower windows remember');
        await expect(page.locator('.home-world')).not.toContainText('Saved for');
        await page.evaluate((language) => {
          localStorage.setItem(
            'soundbound-' + language + '-v1',
            JSON.stringify({
              version: 3,
              records: { tone: { normal: { runs: 1, wins: 1, best: 100, fewest: 0 } } },
            }),
          );
        }, language);
        await page.reload();
        await expect(page.getByRole('button', { name: 'Pet the rooftop cat' })).toBeVisible();
        await expect(page.locator('[data-variant="normal"] .earned-reward')).toHaveCount(1);
        await page.goBack();
        await expect(page).toHaveURL(base + language + '/guide/');
        await page.goForward();
        await expect(page).toHaveURL(base + language + '/');
        await page.goto(base + language + '/about/');
        await expect(page.locator('.about-page h1')).toHaveText('About Tone Tower');
        await page.getByText('Data and software credits').click();
        const license = page.getByRole('link', { name: 'MIT licensed code' });
        await expect(license).toHaveAttribute('href', base + 'LICENSE');
        await expect(page.getByRole('link', { name: 'DM Sans font licence' })).toHaveAttribute(
          'href',
          base + 'assets/fonts/DMSans-LICENSE.txt',
        );
        const otherLanguages = page.getByRole('region', { name: 'Other languages' });
        for (const other of ['cantonese', 'mandarin', 'vietnamese'].filter(
          (value) => value !== language,
        ))
          await expect(
            otherLanguages.getByRole('link', { name: new RegExp(other, 'i') }),
          ).toHaveAttribute('href', base + other + '/');
        await page.goto(base + language + '/practice/');
        await expect(page.locator('#start-adventure')).toBeVisible();
        if (language !== 'vietnamese')
          await page.locator('[data-mode-card][data-destination="rail"]').click();
        else await expect(page.locator('[data-destination="rail"]:visible')).toHaveCount(0);
        await page.locator('#setup-practice').click();
        await page.locator('#start-adventure').click();
        await expect(
          page.locator(language === 'vietnamese' ? '.tone-door' : '#check-answer').first(),
        ).toBeEnabled();
        const audio = await page.evaluate(() => window.__audioPlays.at(-1));
        expect(audio.startsWith(base + 'audio/')).toBe(true);
        const response = await page.request.get(audio);
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toMatch(/^audio\/mpeg/);
        expect((await response.body()).length).toBeGreaterThan(1000);
        if (language === 'vietnamese') {
          const catalog = await (await page.request.get(base + 'catalogs/vi.json')).json();
          const recording = catalog.recordings.find((row) => base + row.audio === audio);
          const target = await page
            .locator('.prompt-syllable')
            .evaluateAll((nodes) =>
              nodes.findIndex((node) => node.classList.contains('is-target')),
            );
          await page
            .locator('.tone-door[data-tone="' + recording.realizedTones[target] + '"]')
            .click();
          await expect(page.locator('.game-progress-label')).toContainText('1 / 20');
          await expect(page.locator('.recording-report')).toHaveAttribute(
            'href',
            /github\.com.*issues\/new/,
          );
        }
        expect(errors).toEqual([]);
        expect(failed).toEqual([]);
      },
    );
}
