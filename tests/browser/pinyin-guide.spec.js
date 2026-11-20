import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__guideAudio = [];
    window.Audio = class {
      constructor(src) {
        this.src = src;
      }
      load() {}
      pause() {
        clearTimeout(this.end);
      }
      play() {
        window.__guideAudio.push(this.src);
        if (window.__rejectGuideAudio) return Promise.reject(Error('Playback blocked'));
        this.end = setTimeout(() => this.onended?.(), 20);
        return Promise.resolve();
      }
    };
  });
});

test('Pinyin lessons use marked spelling, contextual audio and accessible details', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/mandarin/guide/');
  await expect(page.getByRole('heading', { name: 'Pinyin guide', exact: true })).toBeVisible();
  await expect(page.locator('.lesson-result')).toContainText('mǎ');
  const lessons = page.locator('.info-section').filter({ has: page.locator('.eyebrow') });
  await expect(lessons).toHaveCount(4);
  // Numeric typing notation belongs only in the practice instructions.
  for (const section of await lessons.all().then((sections) => sections.slice(0, 3)))
    expect(await section.innerText()).not.toMatch(/\b[a-zü]+[0-5]\b/u);

  const cards = page.locator('.guide-tones .guide-tone');
  await expect(cards).toHaveCount(5);
  for (const [index, pinyin] of ['mā', 'má', 'mǎ', 'mà'].entries()) {
    await expect(cards.nth(index).locator('strong')).toHaveText(pinyin);
    await cards.nth(index).click();
    await expect
      .poll(() => page.evaluate(() => window.__guideAudio.at(-1)))
      .toMatch(new RegExp('commons-83387745-ma' + (index + 1) + '-[a-f0-9]{12}\\.mp3$'));
  }
  await expect(page.locator('.pinyin-guide')).toContainText('use one speaker');
  await expect(page.getByRole('link', { name: 'Wolfdog’s recording' })).toBeVisible();
  await expect(cards.nth(2).locator('strong')).toHaveText('mǎ');
  await expect(cards.last().locator('strong mark')).toHaveText('ma');
  await expect(cards.last().locator('mark[lang="cmn"]')).toHaveText('妈');
  await expect(cards.last().locator('svg')).toHaveCount(0);
  await cards.last().click();
  await expect
    .poll(() => page.evaluate(() => window.__guideAudio.at(-1)))
    .toMatch(/commons-113935685\.mp3$/);
  await expect(page.locator('#guide-status')).toContainText('mā ma');

  const lips = page.locator('[data-guide-word="commons-124599289"]');
  await lips.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__guideAudio.at(-1)))
    .toMatch(/commons-124599289\.mp3$/);
  await expect(lips.locator('xpath=..').locator('[role="status"]')).toContainText('bā');

  const thirdTone = page.locator('details').filter({
    has: page.getByText('Why does third tone often sound low instead of dipping?', {
      exact: true,
    }),
  });
  await thirdTone.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(thirdTone).toHaveAttribute('open', '');
  await thirdTone.locator('[data-guide-word="commons-113935637"]').click();
  await expect(thirdTone.locator('[role="status"]')).toContainText('nǐ hǎo');

  await page.evaluate(() => {
    window.__rejectGuideAudio = true;
  });
  await lips.click();
  await expect(lips.locator('xpath=..').locator('[role="status"]')).toContainText('could not play');
  await page.evaluate(() => {
    window.__rejectGuideAudio = false;
  });
  await lips.click();
  await expect(lips.locator('xpath=..').locator('[role="status"]')).toContainText('bā');
  await expect(page.locator('.resource-links > a')).toHaveCount(5);
  await page.locator('summary').evaluateAll((summaries) =>
    summaries.forEach((s) => {
      s.parentElement.open = true;
    }),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page
    .locator('.pinyin-guide')
    .getByRole('link', { name: 'recording directory on the About page', exact: true })
    .click();
  await page.getByRole('button', { name: 'Browse recordings' }).click();
  await page.locator('#credit-search').fill('Wolfdog');
  await expect(page.locator('#credit-results tbody tr')).toHaveCount(4);
  await expect(page.locator('#credit-results')).toContainText('CC-BY-SA-4.0');
  await expect(page.locator('#credit-results')).toContainText('Pitch and speed unchanged');
});

test('Pinyin examples follow script settings when a run exits to the full guide', async ({
  page,
}) => {
  await page.goto('/mandarin/');
  const characters = page.getByRole('group', { name: 'Character style' });
  const simplified = characters.getByRole('radio', { name: 'Simplified' });
  const traditional = characters.getByRole('radio', { name: 'Traditional' });
  await expect(simplified).toBeChecked();
  const selectedColor = await characters
    .locator('input:checked + span')
    .evaluate((label) => getComputedStyle(label).backgroundColor);
  await simplified.press('ArrowRight');
  await expect(traditional).toBeChecked();
  await expect(characters.locator('input:checked + span')).toHaveCSS(
    'background-color',
    selectedColor,
  );
  await expect(traditional).toBeInViewport();
  await page.reload();
  await expect(traditional).toBeChecked();
  await page.locator('#learn').click();
  await expect(page.locator('.guide-tones [data-guide-tone="3"]')).toContainText('馬');
  await expect(page.locator('.guide-tones [data-guide-tone="5"]')).toContainText('媽媽');
  await expect(page.locator('[data-guide-word="commons-190673878"]')).toContainText('鋁');
  await page.getByRole('button', { name: 'Choose Tower difficulty →' }).click();
  await page.locator('#start-adventure').click();
  await expect(page.locator('.tone-door').first()).toBeEnabled();
  await page.locator('#learn').click();
  await expect(page.getByRole('heading', { name: 'Go to Pinyin guide?' })).toBeVisible();
  await expect(page.locator('#dialog')).toBeHidden();
  await page.getByRole('button', { name: 'End run & go to Pinyin guide' }).click();
  await expect(page).toHaveURL(/mandarin\/guide\/$/);
  await expect(page.locator('.guide-tone')).toHaveCount(5);
  await page.locator('.guide-tones [data-guide-tone="3"]').click();
  await expect(page.locator('#guide-status')).toContainText('mǎ');
  await expect
    .poll(() => page.evaluate(() => window.__guideAudio.at(-1)))
    .toMatch(/commons-83387745-ma3-[a-f0-9]{12}\.mp3$/);
});
