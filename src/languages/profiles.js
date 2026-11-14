import { jyutping } from './jyutping.js';
import { pinyin } from './pinyin.js';
import { quocNgu } from './vietnamese.js';

const cedictSource = Object.freeze({
  name: 'CC-CEDICT',
  url: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
});
const cantoSource = Object.freeze({
  name: 'CC-Canto',
  url: 'https://github.com/amadeusine/cc-canto-data',
  attribution: '© 2015–2016 Pleco Software Incorporated',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
});

function tones(descriptions, paths) {
  return descriptions.map((description, i) =>
    Object.freeze({
      value: i + 1,
      label: i === 4 && descriptions.length === 5 ? 'Neutral' : `Tone ${i + 1}`,
      description,
      path: paths[i],
    }),
  );
}
export const cantonese = Object.freeze({
  ...jyutping,
  id: 'yue',
  dictionarySources: [cantoSource, cedictSource],
  slug: 'cantonese',
  label: 'Cantonese',
  toneSummary: 'six tones',
  learningResources: [
    [
      'https://opencantonese.org/books/cantonese-life-1/pronunciation-guide',
      'Open Cantonese pronunciation course',
    ],
    ['https://jyutping.org/en/learn/', 'Jyutping.org’s guide'],
  ],
  romanization: 'Jyutping',
  transcriptionSystem: 'jyutping',
  practiceToneContent: 'single',
  usesToneMarks: false,
  allowWordSpaces: false,
  storageKey: 'soundbound-cantonese-v1',
  defaultScript: 'traditional',
  scripts: ['traditional'],
  tones: [1, 2, 3, 4, 5, 6],
  choiceCounts: [2, 3, 4, 6],
  stageChoices: [2, 3, 4, 6, 6],
  challenges: ['tone', 'tide'],
  spellingFocuses: ['initials', 'finals', 'full'],
  toneDefinitions: tones(
    [
      'High and level',
      'Rises high',
      'Middle and level',
      'Low and falling',
      'Rises from low',
      'Low and level',
    ],
    [
      'M5 5 L95 5',
      'M5 27 L95 5',
      'M5 16 L95 16',
      'M5 21 L95 30',
      'M5 30 Q60 30 95 17',
      'M5 26 L95 26',
    ],
  ),
  example: {
    text: '你好',
    parts: ['nei5', 'hou2'],
    initial: 'f',
    final: 'u',
    tone: 2,
    transcription: 'fu2',
    written: '虎',
    gloss: 'tiger',
  },
});
export const mandarin = Object.freeze({
  ...pinyin,
  id: 'cmn',
  dictionarySources: [cedictSource],
  slug: 'mandarin',
  label: 'Mandarin',
  toneSummary: 'four tones and neutral tone',
  learningResources: [
    ['https://web.mit.edu/~jinzhang/www/pinyin/tones/', 'MIT’s Mandarin tone guide'],
  ],
  romanization: 'Pinyin',
  transcriptionSystem: 'pinyin',
  practiceToneContent: 'mixed',
  usesToneMarks: true,
  allowWordSpaces: true,
  storageKey: 'soundbound-mandarin-v1',
  defaultScript: 'simplified',
  scripts: ['simplified', 'traditional'],
  tones: [1, 2, 3, 4, 5],
  choiceCounts: [2, 3, 4, 5],
  stageChoices: [2, 3, 4, 5, 5],
  challenges: ['tone', 'tide'],
  spellingFocuses: ['initials', 'finals', 'full'],
  toneDefinitions: tones(
    [
      'High and level',
      'Rising',
      'Low or dipping',
      'Falling',
      'Short and unstressed; pitch depends on context',
    ],
    ['M5 5 L95 5', 'M5 30 L95 5', 'M5 19 Q45 45 95 12', 'M5 5 L95 31', 'M35 20 L65 20'],
  ),
  example: {
    text: '你好',
    parts: ['ni3', 'hao3'],
    initial: 'm',
    final: 'a',
    tone: 3,
    transcription: 'ma3',
    written: '马',
    forms: { simplified: '马', traditional: '馬' },
    gloss: 'horse',
  },
});
export const vietnamese = Object.freeze({
  ...quocNgu,
  id: 'vi',
  dictionarySources: [],
  slug: 'vietnamese',
  label: 'Vietnamese',
  toneSummary: 'six tones',
  learningResources: [
    [
      'https://en.wikipedia.org/wiki/Vietnamese_phonology#Tone',
      'Wikipedia’s overview of Vietnamese tones',
    ],
  ],
  romanization: 'Quốc ngữ',
  guideName: 'Tone guide',
  transcriptionSystem: 'quoc-ngu',
  practiceToneContent: 'mixed',
  usesToneMarks: true,
  allowWordSpaces: true,
  storageKey: 'soundbound-vietnamese-v1',
  defaultScript: 'latin',
  scripts: ['latin'],
  // The order follows the VNI number keys 1–5; a syllable without a mark comes last.
  tones: ['sắc', 'huyền', 'hỏi', 'ngã', 'nặng', 'ngang'],
  choiceCounts: [2, 3, 4, 6],
  stageChoices: [2, 3, 4, 6, 6],
  challenges: ['tone'],
  spellingFocuses: ['full'],
  // `mark` draws the written tone mark on its door; `path` is the pitch shape.
  toneDefinitions: [
    ['sắc', 'dấu sắc', 'High and rising', 'M5 24 Q55 23 95 5', 'M14 29 L26 11'],
    ['huyền', 'dấu huyền', 'Low and falling', 'M5 19 L95 30', 'M14 11 L26 29'],
    [
      'hỏi',
      'dấu hỏi',
      'Dips, then rises',
      'M5 17 Q45 44 95 13',
      'M13 15 Q13 8 20 8 Q27 8 27 14 Q27 18 20 21 L20 27',
    ],
    [
      'ngã',
      'dấu ngã',
      'Rises with a break in the voice',
      'M5 20 L38 15 M58 17 L95 4',
      'M8 23 Q14 12 20 20 T32 17',
    ],
    [
      'nặng',
      'dấu nặng',
      'Low, short and cut off',
      'M5 19 L42 31',
      'M18 27a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    ],
    ['ngang', 'không dấu', 'Mid and level, with no mark', 'M5 13 L95 13', ''],
  ].map(([value, label, description, path, mark]) =>
    Object.freeze({ value, label, description, path, mark }),
  ),
  example: {
    text: 'xin chào',
    parts: ['xin', 'chào'],
    initial: 'm',
    final: 'ai',
    tone: 'dấu ngã',
    // The syllable is shown on its own and heard in a word that repeats it.
    syllable: 'mãi',
    transcription: 'mãi mãi',
    written: 'mãi mãi',
    gloss: 'forever',
  },
  copy: {
    homeTitle: 'Tone Tower · Vietnamese tone games',
    homeDescription:
      'Train your ear for Vietnamese. Climb Tone Tower and practise the six tones with a synthetic voice.',
    guideDescription:
      'Learn the six Vietnamese tones and their marks with playable pronunciation examples.',
    practiceDescription: 'Practise Vietnamese tones at your own pace, without a timer or lives.',
    heading: 'Practise Vietnamese tones.',
    introduction:
      'Vietnamese is written with Latin letters. Each syllable carries one of five tone marks, or none.',
    guidePrompt: 'New to Vietnamese tones?',
    loading: 'Play Tone Tower to practise the six Vietnamese tones.',
    recordings:
      'recordings are synthetic speech: each word was generated with ElevenLabs using the voice “Tuan Anh”. They are not recordings of a person, and a synthetic voice can get a tone wrong, so please report any clip that sounds off. The word list and English meanings were compiled by the project’s contributors; the less common words have no meaning yet.',
    credits: 'Synthetic speech generated with ElevenLabs. No person recorded these words.',
  },
});
export const languages = Object.freeze({ yue: cantonese, cmn: mandarin, vi: vietnamese });
// Numbered tones read “tone 3”; named tones use their own label.
export const toneText = (profile, tone) =>
  typeof tone === 'number'
    ? 'tone ' + tone
    : (profile.toneDefinitions.find((def) => def.value === tone)?.label ?? String(tone));
export const guideName = (profile) => profile.guideName ?? profile.romanization + ' guide';
export function requireProfile(profile) {
  if (
    !profile?.id ||
    !Array.isArray(profile.tones) ||
    !profile.tones.length ||
    typeof profile.evaluate !== 'function'
  )
    throw Error('An explicit language profile is required.');
  return profile;
}

export function decodeTonePair(key) {
  try {
    const pair = key.startsWith('[') ? JSON.parse(key) : key.split('-').map(Number);
    return Array.isArray(pair) ? pair : [];
  } catch {
    return [];
  }
}
