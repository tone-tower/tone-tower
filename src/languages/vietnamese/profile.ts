import type { LanguageProfile } from '../../types.ts';
import { quocNgu } from '../vietnamese.ts';
export const vietnamese = Object.freeze<LanguageProfile>({
  ...quocNgu,
  id: 'vi',
  scriptLabels: { latin: 'Quốc ngữ' },
  textLanguages: { latin: 'vi' },
  toneNotation: 'marks',
  typingHelpers: [],
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
  ].map(([value, label, description, path, markPath]) =>
    Object.freeze({ value, label, name: label, symbol: '', description, path, markPath }),
  ),
  example: {
    text: 'xin chào',
    parts: ['xin', 'chào'],
    initial: 'm',
    final: 'ai',
    tone: 'ngã',
    // The syllable is shown on its own and heard in a word that repeats it.
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
    loading: 'Play Tone Tower to practise the six Vietnamese tones.',
    recordings:
      'recordings are synthetic speech: each word was generated with ElevenLabs using the voice “Tuan Anh”. They are not recordings of a person, and a synthetic voice can get a tone wrong, so please report any clip that sounds off. The word list and English meanings were compiled by the project’s contributors.',
    credits: 'Synthetic speech generated with ElevenLabs. No person recorded these words.',
  },
});
