import path from 'node:path';
import { languages } from '../../src/languages/profiles.ts';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createStaticServer } from './static-server.mjs';
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dist: { type: 'boolean' },
    base: { type: 'string', default: '/' },
    port: { type: 'string' },
  },
});
const port = Number(values.port || positionals[0] || process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port.');
if (values.dist) {
  const server = await createStaticServer({ root: path.resolve('dist'), base: values.base });
  server.listen(port, '127.0.0.1', () =>
    console.log('Tone Tower preview: http://127.0.0.1:' + server.address().port + values.base),
  );
} else {
  const { serveSite } = await import('../publishing/vite.mjs');
  const catalogs = Object.fromEntries(
    await Promise.all(
      Object.keys(languages).map(async (id) => [
        id,
        JSON.parse(await readFile('catalogs/' + id + '.json', 'utf8')),
      ]),
    ),
  );
  const server = await serveSite(process.cwd(), catalogs, port);
  server.printUrls();
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
}
