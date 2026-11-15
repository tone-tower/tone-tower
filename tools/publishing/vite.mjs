import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  readdir,
  lstat,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { build, createServer } from 'vite';
import { pages } from '../../src/site.ts';
import { renderPage, sitemap } from './pages.mjs';
import { createStaticServer } from '../server/static-server.mjs';
import { createContentAllowlist } from '../server/content-allowlist.mjs';

async function readChooser(root) {
  return (await readFile(path.join(root, 'index.html'), 'utf8')).replace(
    /\b(href|src)="((?:src|assets)\/[^"#]+|favicon\.ico)"/g,
    '$1="/$2"',
  );
}

export async function prepareSite(root, catalogs) {
  const stage = await mkdtemp(path.join(os.tmpdir(), 'tone-tower-site-'));
  const dispose = async () => {
    const target = path.resolve(stage);
    if (
      path.dirname(target) !== path.resolve(os.tmpdir()) ||
      !path.basename(target).startsWith('tone-tower-site-')
    )
      throw Error('Unsafe staging cleanup');
    await rm(target, { recursive: true, force: true });
  };
  try {
    const put = async (name, text) => {
      await mkdir(path.dirname(path.join(stage, name)), { recursive: true });
      await writeFile(path.join(stage, name), text);
    };
    const template = await readFile(path.join(root, 'src/shell.html'), 'utf8');
    await put('index.html', await readChooser(root));
    for (const [key, p] of Object.entries(pages))
      await put(p.path + 'index.html', renderPage(template, key, catalogs[p.language]));
    for (const dir of ['assets/brand']) {
      await mkdir(path.join(stage, dir), { recursive: true });
      for (const name of await readdir(path.join(root, dir))) {
        const source = path.join(root, dir, name);
        if (!(await lstat(source)).isFile()) throw Error('Expected regular brand asset.');
        await copyFile(source, path.join(stage, dir, name));
      }
    }
    await copyFile(path.join(root, 'favicon.ico'), path.join(stage, 'favicon.ico'));
    return {
      stage,
      inputs: ['index.html', ...Object.values(pages).map((p) => p.path + 'index.html')],
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
export function siteConfig(root, prepared) {
  return {
    configFile: false,
    appType: 'mpa',
    root: prepared.stage,
    base: './',
    publicDir: false,
    resolve: { alias: { '/src': path.join(root, 'src') } },
    server: {
      host: '127.0.0.1',
      fs: { allow: [prepared.stage, path.join(root, 'src'), path.join(root, 'assets')] },
    },
  };
}
export async function buildSite(root, prepared, destination) {
  return build({
    ...siteConfig(root, prepared),
    build: {
      outDir: destination,
      emptyOutDir: false,
      sourcemap: false,
      rollupOptions: { input: prepared.inputs.map((n) => path.join(prepared.stage, n)) },
    },
  });
}
export async function serveSite(root, catalogs, port) {
  const prepared = await prepareSite(root, catalogs);
  const contentAllowed = createContentAllowlist(root, Object.keys(catalogs));
  const data = await createStaticServer({ root });
  let server;
  try {
    server = await createServer({
      ...siteConfig(root, prepared),
      plugins: [
        {
          name: 'tone-tower-content',
          configureServer(vite) {
            const chooserPath = path.resolve(root, 'index.html');
            vite.watcher.add(chooserPath);
            vite.watcher.on('change', (file) => {
              if (path.resolve(file) === chooserPath)
                vite.ws.send({ type: 'full-reload', path: '*' });
            });
            vite.middlewares.use(async (req, res, next) => {
              try {
                const pathname = new URL(req.url, 'http://localhost').pathname.slice(1);
                if (
                  (pathname === '' || pathname === 'index.html') &&
                  ['GET', 'HEAD'].includes(req.method)
                ) {
                  const html = await vite.transformIndexHtml(req.url, await readChooser(root));
                  res.setHeader('Content-Type', 'text/html; charset=utf-8');
                  res.end(req.method === 'HEAD' ? undefined : html);
                  return;
                }
                const content = pathname.startsWith('catalogs/') || pathname.startsWith('audio/');
                if (
                  (content && (await contentAllowed(pathname))) ||
                  ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'assets/fonts/DMSans-LICENSE.txt'].includes(
                    pathname,
                  )
                )
                  data.emit('request', req, res);
                else next();
              } catch (error) {
                next(error);
              }
            });
          },
        },
      ],
      server: { ...siteConfig(root, prepared).server, port, strictPort: true },
    });
    await server.listen();
  } catch (error) {
    await server?.close();
    await prepared.dispose();
    throw error;
  }
  const close = server.close.bind(server);
  server.close = async () => {
    try {
      await close();
    } finally {
      await prepared.dispose();
    }
  };
  return server;
}
export { sitemap };
