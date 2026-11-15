import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'tone-tower-browser-results'),
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/publication.spec.js',
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'phone',
      testIgnore: '**/publication.spec.js',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'small-phone',
      testIgnore: '**/publication.spec.js',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 640 } },
    },
    {
      name: 'production',
      testMatch: '**/publication.spec.js',
      use: { baseURL: 'http://127.0.0.1:4176', viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: 'node --import tsx tools/server/serve.mjs --port 4175',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node --import tsx tools/server/serve.mjs --dist --port 4176',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'node --import tsx tools/server/serve.mjs --dist --base /release-check/renamed-project/ --port 4177',
      url: 'http://127.0.0.1:4177/release-check/renamed-project/',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
