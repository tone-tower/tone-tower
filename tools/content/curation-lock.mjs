import path from 'node:path';
import { withFileLock } from '../lib/lock.mjs';

export function withCurationLock(root, language, task) {
  if (!['yue', 'cmn', 'vi'].includes(language)) throw Error('Unknown review language: ' + language);
  return withFileLock(task, path.join(root, '.audio-import-cache', language, 'curation.lock'), {
    label: { yue: 'Cantonese', cmn: 'Mandarin', vi: 'Vietnamese' }[language] + ' curation',
  });
}
