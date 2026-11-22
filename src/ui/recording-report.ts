import { challenges } from '../game/game-core.ts';
import { site } from '../site.ts';
import type { LanguageProfile, ExerciseConfig, ExerciseRow, Recording } from '../types.ts';

export function recordingIssueUrl(
  recording: Partial<ExerciseRow & Recording> & { id: string },
  profile: LanguageProfile,
  context: Pick<ExerciseConfig, 'challenge' | 'practice'> | 'credits',
) {
  const location =
    context === 'credits'
      ? 'Voices & credits'
      : challenges[context.challenge].title + (context.practice ? ' Practice' : '');
  const transcription =
    recording.transcription ?? recording.syllables?.map((s) => s.transcription).join(' ') ?? '';
  const url = new URL(site.repository + '/issues/new');
  url.searchParams.set('template', 'recording-report.yml');
  url.searchParams.set(
    'title',
    `[Recording] ${profile.label}: ${recording.text ?? ''} (${recording.id})`,
  );
  url.searchParams.set(
    'context',
    [
      `Where: ${location}`,
      `Language: ${profile.label}`,
      `Recording ID: ${recording.id}`,
      `Written form: ${recording.text ?? ''}`,
      `Dictionary spelling: ${transcription}`,
      `Listening tones: ${recording.realizedTones?.join(' ') ?? recording.syllables?.map((s) => s.tone).join(' ') ?? ''}`,
      recording.source ? `Source: ${recording.source}` : undefined,
    ]
      .filter((line) => line !== undefined)
      .join('\n'),
  );
  return url.href;
}
