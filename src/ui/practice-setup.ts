import type { LanguageProfile, ExerciseConfig } from '../types.ts';
import { requireProfile } from '../languages/profile.ts';
import { toneDefinition, toneLabel, toneSymbolMarkup } from './tone-presentation.ts';
import { escape } from './dom.ts';
import { textLanguage } from '../languages/text-language.ts';

export function practiceSetupMarkup(
  config: ExerciseConfig,
  profile: LanguageProfile,
  script = profile.defaultScript,
) {
  requireProfile(profile);
  const options = (entries: (readonly [string | number, string])[], value: string | number) =>
    entries
      .map(
        ([key, label]) =>
          /* HTML */ `<option value="${key}" ${String(key) === String(value) ? 'selected' : ''}>
            ${label}
          </option>`,
      )
      .join('');
  const tone = config.challenge === 'tone',
    includeTones = config.variant === 'full';
  const numbered = profile.toneNotation === 'numbers';
  const exampleParts = profile.example.parts.map((part) => {
    const value = profile.practiceSpelling(part, config.spellingFocus);
    return includeTones ? value : value.replace(/[0-9]/g, '');
  });
  return /* HTML */ `<div class="practice-setup">
    ${
      tone
        ? /* HTML */ `<fieldset class="practice-tones">
              <legend>Tones to practise</legend>
              <div
                class="practice-tone-options${numbered ? ' practice-tone-options--numbered' : ''}"
              >
                ${profile.tones
                  .map((t, index) => {
                    const definition = toneDefinition(profile, t);
                    return /* HTML */ `<button
                      type="button"
                      data-practice-tone="${t}"
                      aria-label="${escape(toneLabel(profile, t))}"
                      aria-pressed="${config.tones.includes(t)}"
                      ${numbered ? `aria-describedby="practice-pitch-${index}"` : ''}
                      ${config.tones.length === 2 && config.tones.includes(t) ? 'disabled' : ''}
                    >
                      ${numbered ? '' : toneSymbolMarkup(profile, t)}
                      <span class="practice-tone-label">${escape(definition.label)}</span>
                      ${numbered ? `<span class="practice-tone-description" id="practice-pitch-${index}">${escape(definition.description)}</span>` : ''}
                    </button>`;
                  })
                  .join('')}
              </div>
              <p>Select at least two tones.</p>
            </fieldset>
            <label
              >Doors per question<select data-practice-setting="choices">
                ${options(
                  profile.choiceCounts
                    .filter((n) => n <= config.tones.length)
                    .map((n) => [n, n + ' doors']),
                  config.choices,
                )}
              </select></label
            >`
        : /* HTML */ `<label
              >What to practise<select data-practice-setting="spellingFocus">
                ${options(
                  [
                    ...profile.spellingFocuses.map(
                      (focus) =>
                        [
                          focus,
                          focus === 'full'
                            ? 'Full spelling'
                            : focus === 'initials'
                              ? 'Initials only'
                              : 'Finals only',
                        ] as const,
                    ),
                  ],
                  config.spellingFocus,
                )}
              </select></label
            >
            <div class="practice-spelling-options">
              <label class="practice-tone-toggle"
                ><input
                  type="checkbox"
                  data-practice-setting="variant"
                  ${config.variant === 'full' ? 'checked' : ''}
                />
                Include tones</label
              ><label class="practice-tone-toggle"
                ><input
                  type="checkbox"
                  data-practice-setting="target"
                  ${config.target === 'highlighted' ? 'checked' : ''}
                />
                Single syllable only</label
              >
            </div>
            <p class="practice-example">
              <span lang="${escape(textLanguage(profile, script))}"
                >${escape(profile.example.text)}</span
              >
              → ${config.target === 'whole' ? exampleParts.join(' ') : exampleParts[0]}
            </p>`
    }<label class="practice-session-length"
      >Session length<select data-practice-setting="length">
        ${options(
          [
            [10, '10'],
            [20, '20'],
            [50, '50'],
            ['endless', 'Unlimited'],
          ],
          config.length,
        )}
      </select></label
    >
  </div>`;
}
