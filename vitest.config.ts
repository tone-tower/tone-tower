import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/game/*.test.js'],
          exclude: ['tests/game/game-controller.test.js'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/game/game-controller.test.js'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
