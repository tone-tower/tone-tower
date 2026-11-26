import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  correctMandarin,
  refreshMandarinDictionary,
  prepareMandarin,
  importReviews,
  buildMandarinCatalog,
  exportReview,
} from './mandarin.mjs';
import { hskCoverage, importMandarinHsk } from './hsk.mjs';
import { importPracticeTiers, practiceTierCoverage } from './practice-tiers.mjs';
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: 'string' },
    legacy: { type: 'string' },
    assessments: { type: 'string' },
    edition: { type: 'string', default: 'v1' },
    release: { type: 'boolean' },
    recording: { type: 'string' },
    pronunciation: { type: 'string' },
    tones: { type: 'string' },
    exclude: { type: 'boolean' },
    restore: { type: 'boolean' },
    reason: { type: 'string' },
  },
});
const root = process.cwd();
let result;
switch (positionals[0]) {
  case 'dictionary':
    result = await refreshMandarinDictionary(
      root,
      path.resolve(values.file ?? '.audio-import-cache/cedict-source.txt.gz'),
      values.edition,
    );
    break;
  case 'hsk':
    if (!values.file) throw Error('Specify --file with the pinned Gushi vocabulary download.');
    result = await importMandarinHsk(root, path.resolve(values.file));
    break;
  case 'practice-tiers':
    if (!values.file || !values.legacy)
      throw Error(
        'Specify --file with the 2021 word list and --legacy with the HSK 2.0 word list.',
      );
    result = await importPracticeTiers(root, {
      standard: values.file,
      legacy: values.legacy,
      assessments: values.assessments,
    });
    break;
  case 'review':
    result = await exportReview(
      root,
      path.resolve(values.file ?? '.audio-import-cache/cmn/pronunciation-review.html'),
    );
    break;
  case 'import-review':
    if (!values.file) throw Error('Specify --file with exported listening decisions.');
    result = await importReviews(root, path.resolve(values.file));
    break;
  case 'correct':
    if (values.exclude && values.restore) throw Error('Choose exclude or restore.');
    result = await correctMandarin(root, {
      recordingId: values.recording,
      reason: values.reason,
      pronunciationId: values.pronunciation,
      realizedTones:
        values.tones === undefined ? undefined : values.tones.split(/[\s,]+/).map(Number),
      excluded: values.exclude ? true : values.restore ? false : undefined,
    });
    break;
  case 'status': {
    const catalog = await buildMandarinCatalog(root);
    result = {
      ...catalog.availability,
      playable: catalog.recordings.length,
      pronunciations: catalog.pronunciations.length,
      speakers: new Set(catalog.recordings.map((r) => r.speakerId).filter(Boolean)).size,
      ...(catalog.hskSource ? { hsk: hskCoverage(catalog) } : {}),
      ...(catalog.entries.some((entry) => entry.practiceTier)
        ? { practiceTiers: practiceTierCoverage(catalog.entries) }
        : {}),
    };
    if (values.release && !result.ready) process.exitCode = 1;
    break;
  }
  default:
    throw Error('Use dictionary, hsk, practice-tiers, review, import-review, correct, or status.');
}
console.log(JSON.stringify(result, null, 2));
