import path from 'node:path';
import { parseArgs } from 'node:util';
import { importVietnamese, buildVietnameseCatalog } from './vietnamese.mjs';
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    csv: { type: 'string' },
    audio: { type: 'string' },
    voice: { type: 'string' },
    name: { type: 'string' },
    generator: { type: 'string' },
    'min-syllables': { type: 'string', default: '2' },
    'max-rank': { type: 'string' },
    release: { type: 'boolean' },
  },
});
const root = process.cwd();
let result;
switch (positionals[0]) {
  case 'import':
    if (!values.csv || !values.audio || !values.voice)
      throw Error('Specify --csv, --audio and --voice.');
    result = await importVietnamese(root, {
      voice: values.voice,
      name: values.name,
      generator: values.generator,
      csv: path.resolve(values.csv),
      audio: path.resolve(values.audio),
      minSyllables: Number(values['min-syllables']),
      maxRank: values['max-rank'] === undefined ? Infinity : Number(values['max-rank']),
    });
    break;
  case 'status': {
    const catalog = await buildVietnameseCatalog(root);
    result = {
      ...catalog.availability,
      playable: catalog.recordings.length,
      pronunciations: catalog.pronunciations.length,
      voices: new Set(catalog.recordings.map((r) => r.speakerId)).size,
    };
    if (values.release && !result.ready) process.exitCode = 1;
    break;
  }
  default:
    throw Error('Use import or status.');
}
console.log(JSON.stringify(result, null, 2));
