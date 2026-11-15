import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { listeningItems } from './listening-workflow.mjs';
import { listeningPage } from './listening-page.mjs';
import { qualityIssues } from './listening-state.mjs';

export async function reviewServer(root, language) {
  // Refresh snapshots on page load. Imports and new downloads appear without restarting the server.
  let allowed = new Set();
  const server = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') {
        const items = await listeningItems(root, language);
        allowed = new Set(items.filter((i) => i.audioAvailable).map((i) => '/' + i.audio));
        const html = listeningPage({
          language,
          items,
          qualityIssues,
          maxTone: language === 'yue' ? 6 : 5,
          audioBase: '/',
        });
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : html);
      } else if (allowed.has(url.pathname)) {
        const audio = await readFile(path.join(root, url.pathname.slice(1)));
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audio.length,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : audio);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (error) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.message);
    }
  });
  return server;
}
