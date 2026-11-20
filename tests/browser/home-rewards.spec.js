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
  await expect(page.locator('.home-friend')).toHaveCount(5);
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
  await page.getByRole('button', { name: 'Talk to the moon heron' }).click();
  await expect(page.locator('#home-reward-status')).toContainText('Hard Skyrail');
  await page.locator('#setup-practice').click();
  await page.reload();
  await expect(page.locator('.home-friend')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/mandarin/');
  await expect(page.locator('.mode-cards')).toBeVisible();
  await expect(page.locator('.home-friend')).toHaveCount(0);
  await expect(page.locator('.earned-reward')).toHaveCount(0);
});

test('cat targets follow roaming sprites, hold still for focus, and respect reduced motion', async ({
  page,
}) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.addInitScript(
    (progress) => localStorage.setItem('soundbound-cantonese-v1', JSON.stringify(progress)),
    saved,
  );
  await page.goto('/cantonese/');
  const cat = page.getByRole('button', { name: 'Pet the rooftop cat' });
  await expect(cat).toBeVisible();
  const position = () => cat.evaluate((button) => button.style.left);
  const first = await position();
  await page.clock.runFor(10000);
  expect(await position()).not.toBe(first);
  await cat.focus();
  const focused = await position();
  await page.clock.runFor(10000);
  expect(await position()).toBe(focused);
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-reward-status')).toContainText('Normal Tower');
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-reward-status')).toContainText('tiny moon');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(50);
  const still = await position();
  await page.clock.runFor(10000);
  expect(await position()).toBe(still);
});
