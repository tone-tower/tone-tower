import type { LanguageProfile, Tone } from '../types.ts';
import { escape } from './dom.ts';

export function toneDefinition(profile: LanguageProfile, value: Tone) {
  const definition = profile.toneDefinitions.find((tone) => tone.value === value);
  if (!definition) throw Error(`Missing tone definition for ${profile.id}: ${value}`);
  return definition;
}

export function toneSymbolMarkup(profile: LanguageProfile, value: Tone): string {
  const tone = toneDefinition(profile, value);
  if (tone.markPath !== undefined)
    return (
      '<svg class="tone-symbol tone-mark' +
      (tone.markPath ? '' : ' is-blank') +
      '" viewBox="0 0 40 40" aria-hidden="true"><path d="' +
      (tone.markPath ||
        'M30 20h.01M27 27h.01M20 30h.01M13 27h.01M10 20h.01M13 13h.01M20 10h.01M27 13h.01') +
      '"/></svg>'
    );
  return `<span class="tone-symbol ${profile.toneNotation === 'marks' ? 'is-mark' : 'is-number'} ${tone.symbol ? '' : 'is-unmarked'}" aria-hidden="true">${escape(tone.symbol || tone.label)}</span>`;
}

export function toneLabel(profile: LanguageProfile, value: Tone): string {
  const tone = toneDefinition(profile, value);
  return tone.label === tone.name ? tone.label : `${tone.label} · ${tone.name}`;
}
