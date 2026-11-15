import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { atomicJSON, atomicText, readJSON } from '../lib/json.mjs';
import { importReviews } from './mandarin.mjs';
import { listeningItems, importListeningReviews } from './listening-workflow.mjs';
import { listeningPage } from './listening-page.mjs';
import { qualityIssues } from './listening-state.mjs';
import { audioCoverage } from './audio-coverage.mjs';
import { analyzeAudio } from './audio-measurements.mjs';
import { reviewServer } from './listening-server.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    language: { type: 'string', default: 'all' },
    file: { type: 'string' },
    port: { type: 'string', default: '4180' },
    limit: { type: 'string' },
  },
});
const root = process.cwd();
if (!['yue', 'cmn', 'all'].includes(values.language))
  throw Error('Use --language yue, cmn, or all.');
const languages = values.language === 'all' ? ['yue', 'cmn'] : [values.language];
const action = positionals[0];
if (['review', 'import-review'].includes(action) && languages.length !== 1)
  throw Error('Choose one language with --language yue or --language cmn.');
switch (action) {
  case 'review': {
    const language = languages[0];
    if (values.file) {
      const items = await listeningItems(root, language);
      const file = path.resolve(values.file);
      await atomicText(
        file,
        listeningPage({
          language,
          items,
          qualityIssues,
          maxTone: language === 'yue' ? 6 : 5,
          audioBase: pathToFileURL(root + path.sep).href,
        }),
      );
      console.log('Internal review page: ' + file);
    } else {
      const port = Number(values.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid review port.');
      const server = await reviewServer(root, language);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      console.log(
        'Optional ' + language + ' review: http://127.0.0.1:' + server.address().port + '/',
      );
      console.log(
        'Drafts stay in this browser. Export and import decisions to update the catalog.',
      );
      for (const signal of ['SIGINT', 'SIGTERM'])
        process.once(signal, () => {
          server.closeAllConnections();
          server.close();
        });
    }
    break;
  }
  case 'import-review': {
    if (!values.file) throw Error('Specify --file with exported listening decisions.');
    const file = path.resolve(values.file);
    const input = await readJSON(file);
    const result =
      languages[0] === 'cmn' && input?.annotations
        ? await importReviews(root, file)
        : await importListeningReviews(root, languages[0], file);
    console.log(JSON.stringify(result, null, 2));
    break;
  }
  case 'coverage':
    if (values.file && languages.length !== 1)
      throw Error('Choose one language when specifying --file.');
    for (const language of languages) {
      const report = await audioCoverage(root, language);
      const file = path.resolve(
        values.file ?? '.audio-import-cache/' + language + '/coverage.json',
      );
      await atomicJSON(file, report);
      console.log(JSON.stringify({ language, ...report.summary, report: file }, null, 2));
    }
    break;
  case 'analyze':
    for (const language of languages) {
      const result = await analyzeAudio(root, language, {
        limit: values.limit === undefined ? Infinity : Number(values.limit),
        progress: ({ completed, pending }) => {
          if (completed % 100 === 0 || completed === pending)
            console.log(language + ': measured ' + completed + '/' + pending);
        },
      });
      console.log(JSON.stringify(result));
    }
    break;
  default:
    throw Error('Use review, import-review, coverage, or analyze.');
}
