import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { listeningFixture } from '../helpers/listening-fixture.js';
import { reviewServer } from '../../tools/content/listening-server.mjs';
import { importListeningReviews, listeningItems } from '../../tools/content/listening-workflow.mjs';
import { reviewPath } from '../../tools/content/listening-state.mjs';

for (const language of ['yue', 'cmn']) {
  test(
    language + ': Chromium saves drafts, filters, exports and imports only explicit decisions',
    async (t) => {
      const f = await listeningFixture(t, language);
      const server = await reviewServer(f.root, language);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      t.after(() => {
        server.closeAllConnections();
        return new Promise((resolve) => server.close(resolve));
      });
      const browser = await chromium.launch({ headless: true });
      t.after(() => browser.close());
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('http://127.0.0.1:' + server.address().port);
      const id = language === 'yue' ? 'other-voice' : 'commons-105';
      await page.locator('#search').fill(id);
      assert.equal(await page.locator('article').count(), 1);
      await page.locator('#reviewer').fill('Browser fixture listener');
      await page.locator('[data-field="status"]').selectOption('uncertain');
      await page.locator('[data-field="reason"]').fill('Need another listening pass');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.reload();
      await page.locator('#status-filter').selectOption('uncertain');
      assert.equal(await page.locator('article').count(), 1);
      assert.match(await page.locator('article').textContent(), new RegExp(id));
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export edited reviews' }).click();
      const download = await downloadPromise;
      const stream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const batch = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.deepEqual(Object.keys(batch.recordings), [id]);
      assert.equal(batch.recordings[id].status, 'uncertain');
      await f.put('download.json', batch);
      await importListeningReviews(f.root, language, f.root + '/download.json');
      assert.equal(
        JSON.parse(await readFile(reviewPath(f.root, language), 'utf8')).recordings[id].status,
        'uncertain',
      );
      await page.reload();
      await page.locator('#status-filter').selectOption('uncertain');
      assert.equal(await page.locator('article').count(), 1);
      assert.equal(
        (await listeningItems(f.root, language)).filter((i) => i.reviewStatus === 'uncertain')
          .length,
        1,
      );
      assert.deepEqual(errors, []);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      );
    },
  );
}
