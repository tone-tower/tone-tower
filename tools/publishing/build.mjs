import {
  readFile,
  readdir,
  mkdir,
  copyFile,
  writeFile,
  lstat,
  realpath,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildCatalogs } from '../catalog/catalog.mjs';
import { prepareSite, buildSite, sitemap } from './vite.mjs';
export const publicationManifest = '.publication.json';
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function safePublicationPath(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !name.includes('\\') &&
    !name.startsWith('/') &&
    !name.split('/').some((p) => !p || p === '.' || p === '..') &&
    !/^[a-z][\w+.-]*:/i.test(name)
  );
}
export async function publicationFiles(root) {
  const manifest = JSON.parse(await readFile(path.join(root, publicationManifest), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files))
    throw Error('Unsupported publication manifest.');
  const names = manifest.files.map((row) => {
    if (
      !safePublicationPath(row.name) ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(row.sha256)
    )
      throw Error('Invalid publication manifest entry.');
    return row.name;
  });
  if (new Set(names).size !== names.length || names.includes(publicationManifest))
    throw Error('Duplicate publication manifest path.');
  return [...names, publicationManifest].sort();
}
export async function publish(root = process.cwd()) {
  root = await realpath(root);
  const catalogs = await buildCatalogs(root);
  const destination = path.resolve(root, 'dist');
  try {
    const info = await lstat(destination);
    if (
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      (await realpath(destination)) !== destination
    )
      throw Error('Publishing directory must be a local directory.');
    await rm(destination, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(destination, { recursive: true });
  const prepared = await prepareSite(root, catalogs);
  try {
    const built = await buildSite(root, prepared, destination);
    const outputs = (Array.isArray(built) ? built : [built]).flatMap((result) =>
      result.output.map((row) => row.fileName),
    );
    const staticFiles = [
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      '.nojekyll',
      'assets/brand/share-card.png',
      ...Object.keys(catalogs).map((id) => 'catalogs/' + id + '.json'),
      ...Object.values(catalogs).flatMap((c) => c.recordings.map((r) => r.audio)),
    ];
    for (const name of await readdir(path.join(root, 'assets/fonts')))
      if (/LICENSE|OFL/i.test(name)) staticFiles.push('assets/fonts/' + name);
    const assets = [...new Set(staticFiles)];
    for (let start = 0; start < assets.length; start += 32) {
      await Promise.all(
        assets.slice(start, start + 32).map(async (name) => {
          if (!safePublicationPath(name)) throw Error('Asset outside publication root: ' + name);
          const from = path.join(root, name),
            info = await lstat(from),
            actual = await realpath(from);
          if (!info.isFile() || info.isSymbolicLink() || !actual.startsWith(root + path.sep))
            throw Error('Expected a regular publication file: ' + name);
          const target = path.join(destination, name);
          await mkdir(path.dirname(target), { recursive: true });
          await copyFile(from, target);
        }),
      );
    }
    await writeFile(path.join(destination, 'sitemap.xml'), sitemap());
    const names = [...new Set([...outputs, ...staticFiles, 'sitemap.xml'])].sort();
    const files = [];
    for (let start = 0; start < names.length; start += 32) {
      files.push(
        ...(await Promise.all(
          names.slice(start, start + 32).map(async (name) => {
            if (!safePublicationPath(name)) throw Error('Invalid Vite output path.');
            const bytes = await readFile(path.join(destination, name));
            return { name, bytes: bytes.length, sha256: digest(bytes) };
          }),
        )),
      );
    }
    await writeFile(
      path.join(destination, publicationManifest),
      JSON.stringify({ version: 1, files }) + '\n',
    );
    console.log('Prepared dist/: ' + names.length + ' files. Upload only dist/.');
    return { destination, files: [...names, publicationManifest].sort() };
  } finally {
    await prepared.dispose();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await publish();
