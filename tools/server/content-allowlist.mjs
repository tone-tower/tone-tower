import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { validateCatalog } from '../../src/content/catalog.ts';
import { languages } from '../../src/languages/profiles.ts';

// Catalogs can be rebuilt while Vite is running. Keep its public audio paths in
// sync with the catalog actually served to the browser, without opening archives.
export function createContentAllowlist(root, languageIds) {
  const snapshots = new Map();
  for (const id of languageIds)
    if (!Object.hasOwn(languages, id)) throw Error('Unknown catalog language: ' + id);
  return async function permits(pathname) {
    const allowed = new Set();
    for (const id of languageIds) {
      const name = 'catalogs/' + id + '.json';
      const file = path.join(root, name);
      const info = await stat(file);
      const version = [info.mtimeMs, info.size, info.ino].join(':');
      let snapshot = snapshots.get(id);
      if (snapshot?.version !== version) {
        const catalog = JSON.parse(await readFile(file, 'utf8'));
        validateCatalog(catalog, languages[id]);
        snapshot = { version, paths: catalog.recordings.map((recording) => recording.audio) };
        snapshots.set(id, snapshot);
      }
      allowed.add(name);
      for (const audio of snapshot.paths) allowed.add(audio);
    }
    return allowed.has(pathname);
  };
}
