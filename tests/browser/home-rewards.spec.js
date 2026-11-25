import { test, expect } from '@playwright/test';
import { pausePageClock } from '../helpers/fake-time.js';

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
  await expect(page.locator('.home-friend')).toHaveCount(7);
  await expect(page.locator('#map-variants')).not.toContainText('✦');
  await expect(page.locator('#reward-hint')).toHaveCount(0);
  await expect(page.locator('.home-world')).not.toContainText('Saved for');
  await expect(page.locator('.home-world')).not.toContainText('Tower windows remember');
  const home = page.locator('.home-world');
  const homeHeight = () => home.evaluate((node) => node.offsetHeight);
  const beforeDialogue = await homeHeight();
  const caption = home.locator('.stage #home-reward-status');
  const towerButterflies = page.getByRole('button', { name: 'Visit the tower butterflies' });
  await towerButterflies.click();
  await expect(caption).toContainText('followed the light');
  await expect(caption).toHaveCSS('opacity', '1');
  expect(await homeHeight()).toBe(beforeDialogue);
  const canvas = await page.locator('.map-canvas').elementHandle();
  await page.getByRole('radio', { name: 'Simplified' }).check();
  expect(await canvas.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('#home-reward-status')).toContainText('followed the light');
  await page.getByRole('button', { name: 'Pet the rooftop cat' }).click();
  await expect(page.locator('#home-reward-status')).toContainText('stretches and purrs');
  expect(await homeHeight()).toBe(beforeDialogue);
  await page.getByRole('button', { name: 'Wake the spire dragon' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-reward-status')).toContainText('opens one eye');
  await expect(page.locator('#app')).toHaveAttribute('data-view', 'home');
  await page.locator('[data-destination="rail"]').click();
  await expect(page.locator('#map-variants')).not.toContainText('✦');
  const stationButterflies = page.getByRole('button', { name: 'Visit the station butterflies' });
  await stationButterflies.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-reward-status')).toContainText('station flowers');
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-reward-status')).toContainText('window seat');
  await page.getByRole('button', { name: 'Pet the station cat' }).click();
  await expect(page.locator('#home-reward-status')).toContainText('sleepy eye');
  await page.getByRole('button', { name: 'Wake the golden dragon' }).click();
  await expect(page.locator('#home-reward-status')).toContainText('sparkle');
  await page.getByRole('button', { name: 'Talk to the moon heron' }).click();
  await expect(page.locator('#home-reward-status')).toContainText('Hard Skyrail');
  await page.locator('#setup-practice').click();
  await page.reload();
  await expect(page.locator('.home-friend')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/mandarin/');
  await expect(page.locator('.mode-cards')).toBeVisible();
  await expect(page.locator('.home-friend')).toHaveCount(0);
});

test('cat targets follow roaming sprites, hold still for focus, and respect reduced motion', async ({
  page,
}) => {
  await page.clock.install();
  await pausePageClock(page);
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
