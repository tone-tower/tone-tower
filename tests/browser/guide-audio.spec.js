import { test, expect } from '@playwright/test';
import { openHeaderMenu } from '../helpers/header-menu.js';

test('the four ma buttons play real audio through to completion', async ({ page }) => {
  // Observe the native elements; do not replace play(), loading or media events.
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__nativeGuidePlayback = [];
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      const state = {
        source: audio.src,
        playing: false,
        ended: false,
        duration: 0,
        time: 0,
        error: null,
      };
      window.__nativeGuidePlayback.push(state);
      audio.addEventListener('playing', () => {
        state.playing = true;
      });
      audio.addEventListener('ended', () => {
        state.ended = true;
        state.duration = audio.duration;
        state.time = audio.currentTime;
      });
      audio.addEventListener('error', () => {
        state.error = audio.error?.code;
      });
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
  });
  await page.goto('/mandarin/');
  await expect(page.locator('.mode-cards')).toBeVisible();
  await openHeaderMenu(page);
  await page.locator('#learn').click();
  for (const tone of [1, 2, 3, 4]) {
    await page.locator('.guide-tones [data-guide-tone="' + tone + '"]').click();
    await expect
      .poll(
        () =>
          page.evaluate((tone) => {
            return window.__nativeGuidePlayback.find((state) =>
              state.source.includes('commons-83387745-ma' + tone + '-'),
            );
          }, tone),
        { timeout: 10000 },
      )
      .toMatchObject({ playing: true, ended: true, error: null });
    const state = await page.evaluate(
      (tone) =>
        window.__nativeGuidePlayback.find((state) =>
          state.source.includes('commons-83387745-ma' + tone + '-'),
        ),
      tone,
    );
    expect(state.duration).toBeGreaterThan(0.5);
    expect(state.time).toBeCloseTo(state.duration, 2);
  }
});
