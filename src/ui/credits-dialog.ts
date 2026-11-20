import { filterCredits, creditsPage, orderCredits } from './credits.ts';
import { recordingIssueUrl } from './recording-report.ts';
import { query, required, escape } from './dom.ts';
import type { LanguageProfile, ExerciseRow } from '../types.ts';
interface Options {
  dialogBody: HTMLElement;
  profile: LanguageProfile;
  loadRows: () => Promise<ExerciseRow[]>;
  openDialog: (html: string, opener?: HTMLElement) => void;
}
export function createCreditsDialog({ dialogBody, profile, loadRows, openDialog }: Options) {
  const safeHref = (value: string | undefined) => {
    try {
      const u = new URL(value ?? '');
      return ['http:', 'https:'].includes(u.protocol) ? escape(u.href) : '#';
    } catch {
      return '#';
    }
  };
  return function showCredits(opener?: HTMLElement) {
    openDialog(
      /* HTML */ `<div class="eyebrow">Sources & licences</div>
        <h2 id="dialog-title">Recording directory</h2>
        <label class="credits-search"
          >Find a recording<input
            id="credit-search"
            type="search"
            placeholder="${profile.challenges.includes('tide') ? 'Written form, ' + profile.romanization + ', creator…' : 'Written form, meaning, voice…'}"
            autocomplete="off"
        /></label>
        <div id="credit-results"></div>`,
      opener,
    );
    const results = required(dialogBody, '#credit-results'),
      search = required(dialogBody, '#credit-search');
    let data: ExerciseRow[] | null = null,
      page = 0,
      query = '',
      debounce: ReturnType<typeof setTimeout>;
    function focusPageButton(
      preferred: '#credits-prev' | '#credits-next',
      fallback: '#credits-prev' | '#credits-next',
    ) {
      const button = required(results, preferred);
      (button.disabled ? required(results, fallback) : button).focus({ preventScroll: true });
    }
    function draw() {
      if (!data || !results.isConnected) return;
      const matches = filterCredits(data, query),
        view = creditsPage(matches, page);
      page = view.page;
      results.innerHTML = /* HTML */ `<div class="credits-pagination">
          <span role="status"
            >${matches.length ? `${page * 20 + 1}–${Math.min(matches.length, (page + 1) * 20)} of ${matches.length} recordings` : 'No matching recordings'}</span
          >
          <div>
            <button
              class="secondary"
              id="credits-prev"
              type="button"
              ${page === 0 ? 'disabled' : ''}
            >
              ←</button
            ><button
              class="secondary"
              id="credits-next"
              type="button"
              ${page >= view.pages - 1 ? 'disabled' : ''}
            >
              →
            </button>
          </div>
        </div>
        <div class="credits-table">
          <table>
            <caption class="sr-only">
              Recording sources and licences
            </caption>
            <thead>
              <tr>
                <th>Recording</th>
                <th>Creator</th>
                <th>Source / licence</th>
              </tr>
            </thead>
            <tbody>
              ${view.rows
                .map(
                  (w) =>
                    /* HTML */ `<tr>
                      <td>
                        ${escape(w.text)}<small
                          >${escape(w.text === profile.format(w.transcription ?? '') ? '' : profile.format(w.transcription ?? ''))}</small
                        >
                      </td>
                      <td>${escape(w.author || 'See original')}</td>
                      <td>
                        ${w.source ? '<a href="' + safeHref(w.source) + '" target="_blank" rel="noopener">Original ↗</a>' : ''}${w.source && w.license ? ' · ' : ''}${w.license ? '<a href="' + safeHref(w.licenseUrl) + '" target="_blank" rel="noopener">' + escape(w.license) + '</a>' : ''}${w.conversion ? /* HTML */ `<small>${escape(w.conversion)}</small>` : ''}<small
                          ><a
                            href="${escape(recordingIssueUrl(w, profile))}"
                            target="_blank"
                            rel="noopener"
                            >Report this recording ↗</a
                          ></small
                        >
                      </td>
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
      required(results, '#credits-prev').onclick = () => {
        page--;
        draw();
        focusPageButton('#credits-prev', '#credits-next');
      };
      required(results, '#credits-next').onclick = () => {
        page++;
        draw();
        focusPageButton('#credits-next', '#credits-prev');
      };
    }
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        query = search.value;
        page = 0;
        draw();
      }, 120);
    });
    async function load() {
      results.innerHTML = '<p role="status">Loading recording credits…</p>';
      try {
        data = orderCredits(await loadRows(), profile);
        draw();
      } catch {
        if (!results.isConnected) return;
        results.innerHTML =
          '<p class="error" role="alert">Couldn’t load the recording credits.</p><button class="secondary" type="button">Try again</button>';
        required(results, 'button').onclick = () => {
          search.focus({ preventScroll: true });
          void load();
        };
      }
    }
    void load();
  };
}
