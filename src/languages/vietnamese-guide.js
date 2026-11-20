import { toneSymbolMarkup } from '../ui/tone-presentation.ts';
import { vietnamese } from './profiles.ts';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const vi = (text) => '<b lang="vi">' + escape(text) + '</b>';
export function vietnameseGuide(anchors, definitions) {
  const tones = `<div class="guide-tones guide-tones--marks">${definitions
    .map((tone) => {
      const reference = anchors.find((a) => a.tone === tone.value);
      return `<button class="guide-tone" type="button" data-guide-tone="${escape(tone.value)}" ${reference ? '' : 'disabled'} aria-label="Hear ${escape(reference?.text ?? tone.label)}, ${escape(tone.label)}">${toneSymbolMarkup(vietnamese, tone.value)}<strong lang="vi">${escape(tone.label)}</strong><svg viewBox="0 0 100 36" aria-hidden="true"><path d="${tone.path}"/></svg><span>${escape(tone.description)}</span>${reference ? '<small><mark lang="vi">' + escape(reference.text) + '</mark> · ' + escape(reference.gloss) + '</small>' : '<small>Example coming soon</small>'}</button>`;
    })
    .join(
      '',
    )}</div><p id="guide-status" class="small" role="status">Listen, replay, and compare.</p>`;
  return `<article class="info-page"><a class="back-link" href="./" data-page="home">← Home</a><h1 tabindex="-1">A short guide to Vietnamese tones</h1><p class="lead">Vietnamese is written with Latin letters. Every syllable has one of six tones, and its spelling shows which: one of five tone marks, or no mark at all.</p>
  <section class="info-section"><h2>Six tones, five marks</h2>${tones}<p>Each example is a common word in which both syllables carry the same tone, so you hear that tone twice in a row. Play one after another to compare them. The lines are simplified pitch shapes of northern pronunciation, as spoken in Hanoi. In the south, ${vi('dấu hỏi')} and ${vi('dấu ngã')} sound alike.</p></section>
  <section class="info-section"><h2>Reading the marks</h2><p>A tone mark belongs to the whole syllable and is written on its main vowel. Four marks sit above the vowel; ${vi('dấu nặng')} is a dot below it. A syllable with no tone mark, ${vi('không dấu')}, has the level tone.</p><p>Some vowels carry a mark of their own that is not a tone: the hats on ${vi('â')}, ${vi('ê')} and ${vi('ô')}, the curve on ${vi('ă')}, and the hooks on ${vi('ơ')} and ${vi('ư')}. These change the vowel’s sound. A tone mark is added to them, as in ${vi('ấ')}, ${vi('ề')} and ${vi('ợ')}.</p><p>Syllables that end in ${vi('p')}, ${vi('t')}, ${vi('c')} or ${vi('ch')} only take ${vi('dấu sắc')} or ${vi('dấu nặng')}.</p></section>
  <section class="info-section"><h2>How Tone Tower asks</h2><p>You hear a word of two to four syllables and see it without its tones, with its English meaning beneath: on every syllable, two dust creatures sit where a mark could be, one above the vowel and one below. One syllable is highlighted. Choose the door showing the mark you heard on it, or ${vi('không dấu')} if there is none. The creatures then leave and the full word appears.</p><p>The voice is synthetic. If a clip sounds wrong, use its feedback link to report it.</p></section>
  <section class="info-section"><h2>Continue learning</h2><p><a href="https://en.wikipedia.org/wiki/Vietnamese_phonology#Tone" target="_blank" rel="noopener">Wikipedia: Vietnamese tones and how they differ by region ↗</a></p></section>
  <div class="info-actions"><button class="primary" data-start-world="tone">Try Tone Tower →</button><a class="text-button" href="practice/" data-page="practice">Open practice</a></div></article>`;
}
