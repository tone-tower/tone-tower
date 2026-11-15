import { test, expect } from '@playwright/test';

const win = { runs: 1, wins: 1, best: 100, fewest: 0 };
const saved = {
  version: 3,
  records: {
    tone: { easy: win, normal: win, hard: win, extreme: win },
    tide: { spelling: { easy: win, normal: win }, full: { hard: win, extreme: win } },
  },
};

test('saved completions decorate home, persist, and stay separate for each language', async ({
  page,
}) => {
  await page.goto('/cantonese/');
  await expect(page.locator('.mode-cards')).toBeVisible();
  await page.evaluate(
    (progress) => localStorage.setItem('soundbound-cantonese-v1', JSON.stringify(progress)),
    saved,
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Records', exact: true })).toHaveCount(0);
  await expect(page.locator('.site-header [data-nav-page="about"]')).toHaveText('About');
  await expect(page.locator('.home-friend')).toHaveCount(4);
  await expect(page.locator('[data-variant] .earned-reward')).toHaveCount(4);
  await expect(page.locator('#reward-hint')).toHaveCount(0);
  await expect(page.locator('.home-world')).not.toContainText('Saved for');
  await expect(page.locator('.home-world')).not.toContainText('Tower windows remember');
  await page.getByRole('button', { name: 'Pet the rooftop cat' }).click();
  await expect(page.locator('#home-reward-status')).toContainText('stretches and purrs');
  await page.getByRole('button', { name: 'Wake the spire dragon' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-reward-status')).toContainText('opens one eye');
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'home');
  await page.locator('[data-destination="rail"]').click();
  await expect(page.locator('[data-difficulty] .earned-reward')).toHaveCount(4);
  await page.getByRole('button', { name: 'Pet the station cat' }).click();
  await expect(page.locator('#home-reward-status')).toContainText('sleepy eye');
  await page.getByRole('button', { name: 'Wake the golden dragon' }).click();
  await expect(page.locator('#home-reward-status')).toContainText('sparkle');
  await page.locator('#setup-practice').click();
  await page.reload();
  await expect(page.locator('.home-friend')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/mandarin/');
  await expect(page.locator('.mode-cards')).toBeVisible();
  await expect(page.locator('.home-friend')).toHaveCount(0);
  await expect(page.locator('.earned-reward')).toHaveCount(0);
});

test('About provides a deliberate reset, which clears only the current language', async ({
  page,
}) => {
  await page.goto('/cantonese/');
  await page.evaluate((progress) => {
    for (const language of ['cantonese', 'mandarin'])
      localStorage.setItem('soundbound-' + language + '-v1', JSON.stringify(progress));
  }, saved);
  await page.goto('/cantonese/about/');
  await page.getByRole('button', { name: 'Reset saved progress…' }).click();
  await expect(page.getByRole('button', { name: 'Keep my progress' })).toBeFocused();
  await page.getByRole('button', { name: 'Keep my progress' }).click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Reset saved progress…' }).click();
  await page.getByRole('button', { name: 'Reset everything' }).click();
  await expect(page.locator('.mode-cards')).toBeVisible();
  await expect(page.locator('.home-friend')).toHaveCount(0);
  await expect(page.locator('.earned-reward')).toHaveCount(0);
  await page.goto('/mandarin/');
  await expect(page.locator('.home-friend')).toHaveCount(4);
});
