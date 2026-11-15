// Shared contracts. External JSON is validated before it enters these interfaces.
export type Tone = number | string;
export type Challenge = 'tone' | 'tide';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export type SpellingFocus = 'initials' | 'finals' | 'full';
export type Forms = Record<string, string>;
export interface Syllable {
  text?: string;
  forms?: Forms;
  transcription: string;
  tone: Tone;
  dictionaryTone?: Tone;
  toneEligible?: boolean;
}
export interface DictionarySource {
  name: string;
  url?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  [key: string]: unknown;
}
export interface Entry {
  id: string;
  forms: Forms;
  gloss: string;
  fullGloss?: string;
  dictionarySource?: DictionarySource;
  glossSource?: unknown;
  metadata?: Record<string, unknown>;
}
export interface Pronunciation {
  id: string;
  entryId: string;
  syllables: Syllable[];
  forms?: Forms;
  kind?: string;
  phonetics?: {
    basis: 'transcription';
    syllableCount: number;
    tonePattern: Tone[];
    syllables: { base: string; initial: string; final: string; coda: string; checked?: boolean }[];
  };
}
export interface Recording {
  id: string;
  pronunciationId: string;
  audio: string;
  realizedTones: Tone[];
  toneTargets?: number[];
  referenceOnly?: boolean;
  source?: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  conversion?: string;
  synthetic?: boolean;
  speakerId?: string;
  speakerEvidence?: { name: string; source: string; basis: 'explicit-speaker-credit' };
  toneEvidence?: { status: 'assumed' | 'reviewed' | 'corrected'; basis: string };
}
export interface ToneReference {
  tone: Tone;
  recordingId: string;
  targetIndex: number;
}
export interface Availability {
  ready: boolean;
  mode?: 'beta' | 'reviewed';
  missing?: string[];
  [key: string]: unknown;
}
export interface Catalog {
  version: 2;
  language: string;
  transcriptionSystem: string;
  entries: Entry[];
  pronunciations: Pronunciation[];
  recordings: Recording[];
  references: ToneReference[];
  availability?: Availability;
}
export interface ExerciseRow {
  id: string;
  text: string;
  syllables: Syllable[];
  audio: string;
  gloss?: string;
  forms?: Forms;
  transcription?: string;
  wordId?: string;
  pronunciationId?: string;
  anchor?: boolean;
  tone?: Tone;
  targetIndex?: number;
  assisted?: boolean;
  author?: string;
  source?: string;
  license?: string;
  licenseUrl?: string;
  conversion?: string;
}
export interface ToneDefinition {
  value: Tone;
  label: string;
  symbol: string;
  name: string;
  description: string;
  path: string;
  markPath?: string;
}
export interface TypingHelper {
  value: string;
  label: string;
  description: string;
  apply?: (value: string, start: number, end: number) => { value: string; caret: number };
}
export interface Transcription {
  parse?: (value: unknown) => { base: string; tone: number }[] | null;
  format: (value: string) => string;
  withoutTones: (value: string) => string;
  practiceSpelling: (value: string, focus?: SpellingFocus) => string;
  normalizeAnswer: (value: unknown, full?: boolean) => string | null;
  evaluate: (
    value: unknown,
    expected: string[],
    full?: boolean,
    focus?: SpellingFocus,
  ) => boolean | null;
}
export interface LanguageProfile extends Transcription {
  id: string;
  slug: string;
  label: string;
  romanization: string;
  transcriptionSystem: string;
  storageKey: string;
  defaultScript: string;
  scripts: readonly string[];
  scriptLabels: Readonly<Record<string, string>>;
  textLanguages: Readonly<Record<string, string>>;
  tones: readonly Tone[];
  choiceCounts: readonly number[];
  stageChoices: readonly number[];
  challenges: readonly Challenge[];
  spellingFocuses: readonly SpellingFocus[];
  practiceToneContent: 'single' | 'mixed' | 'multi';
  usesToneMarks: boolean;
  allowWordSpaces: boolean;
  toneSummary: string;
  dictionarySources: readonly DictionarySource[];
  learningResources: readonly (readonly [string, string])[];
  toneDefinitions: readonly ToneDefinition[];
  toneNotation: 'numbers' | 'marks';
  typingHelpers: readonly TypingHelper[];
  toneFeedback?: (syllables: readonly Syllable[]) => string;
  concealTone?: (text: string) => { base: string; index: number } | null;
  concealMeaning?: (text: string) => string;
  guideName?: string;
  copy?: {
    homeTitle?: string;
    homeDescription?: string;
    guideDescription?: string;
    practiceDescription?: string;
    loading?: string;
    recordings?: string;
    credits?: string;
  };
  example: {
    text: string;
    parts: string[];
    initial: string;
    final: string;
    tone: Tone;
    transcription: string;
    written: string;
    gloss: string;
    forms?: Forms;
  };
}
export interface ExerciseConfig {
  challenge: Challenge;
  variant: string;
  difficulty: string;
  practice: boolean;
  format: 'drill' | 'rehearsal';
  length: number | 'endless';
  start: number;
  content: 'single' | 'multi' | 'mixed';
  spellingFocus: SpellingFocus;
  singleSyllableOnly: boolean;
  target: 'whole' | 'highlighted' | 'stage';
  tones: Tone[];
  choices: number;
  lives: 'standard' | 'unlimited';
  timer: 'off' | 'stage' | 'custom';
  seconds: number;
  focusIds: string[];
}
export type RunInput = Partial<ExerciseConfig>;
export type FailureReason = 'tone' | 'spelling' | 'timeout' | 'reveal';
interface ResultDetails {
  correct: boolean;
  terminal: boolean;
  expected?: string;
  landing?: boolean;
  recovered?: number;
  reason?: FailureReason;
  ignored?: boolean;
}
export type RunResult =
  | (ResultDetails & { kind: 'empty'; correct: false })
  | (ResultDetails & { kind: 'wrong'; correct: false })
  | (ResultDetails & { kind: 'correct'; correct: true });
export interface Run {
  config: ExerciseConfig;
  profile: LanguageProfile;
  world: Challenge;
  opened: number;
  cleared: number;
  attempts: number;
  mistakes: number;
  guesses: number;
  lives: number | null;
  maxLives: number | null;
  status: 'playing' | 'won' | 'lost' | 'complete';
  word: ExerciseRow;
  targets: number[];
  choices: Tone[];
  missedIds: string[];
  confusions: Record<string, number>;
  assisted: number;
  promptState: 'ready' | 'answered' | 'failed';
  lastAnswer: unknown;
  lastFailure: FailureReason | null;
  lastResult: RunResult | null;
  stages: { attempts: number; correct: number; mistakes: number }[];
  recorded?: boolean;
  readonly goal: number | 'endless';
  readonly stage: number;
  expectedParts(): string[];
  expected(): string;
  timeLimit(): number;
  markAssisted(): void;
  next(): ExerciseRow | false;
  replace(): ExerciseRow | false;
  answer(value: unknown): RunResult;
  fail(reason?: FailureReason): RunResult;
  finish(): boolean;
}
export type ControllerPhase =
  | 'idle'
  | 'listening'
  | 'answering'
  | 'review'
  | 'correct'
  | 'landing'
  | 'interrupted'
  | 'finished';
export interface ChallengeRecord {
  runs: number;
  wins: number;
  best: number;
  fewest: number | null;
}
export type HomeRewards = Record<Challenge, Record<Difficulty, boolean>>;
export interface Progress {
  version: number;
  settings: {
    script: string;
    toneVariant: string;
    tideVariant: string;
    tideDifficulty: string;
    practice: Record<Challenge, ExerciseConfig>;
  };
  records: {
    tone: Record<string, ChallengeRecord>;
    tide: Record<string, Record<string, ChallengeRecord>>;
  };
  practice: { runs: number; completed: number; cleared: number };
  missedIds: string[];
  confusions: Record<string, number>;
}
export interface AudioPlayer {
  preload?(paths: string[]): void;
  stop(): void;
  play(path: string): Promise<void>;
}
