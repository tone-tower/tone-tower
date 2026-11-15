// This function is serialized into the internal review page; it has no application dependencies.
function reviewApp(payload) {
  const $ = (s) => document.querySelector(s);
  const escape = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const storageKey = 'tone-tower-listening-drafts-v1-' + payload.language;
  let drafts = {};
  let page = 0;
  let storageWarning = '';
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [id, draft] of Object.entries(stored)) {
        const d = draft?.decision;
        if (
          d &&
          typeof d === 'object' &&
          ['unreviewed', 'approved', 'uncertain', 'rejected'].includes(d.status) &&
          ['reviewer', 'reason', 'reviewedAt', 'recordingSha256', 'contentSha256'].every(
            (k) => typeof d[k] === 'string',
          ) &&
          typeof draft.previousRevision === 'string' &&
          ['realizedTones', 'toneTargets', 'referenceTargets'].every(
            (k) => d[k] === undefined || (Array.isArray(d[k]) && d[k].every(Number.isInteger)),
          ) &&
          (d.qualityIssues === undefined ||
            (Array.isArray(d.qualityIssues) &&
              d.qualityIssues.every((v) => payload.qualityIssues.includes(v)))) &&
          (d.pronunciationId === undefined || typeof d.pronunciationId === 'string')
        )
          drafts[id] = draft;
      }
    }
  } catch {
    storageWarning = 'Browser draft storage is unavailable. Export before closing.';
  }
  const items = new Map(payload.items.map((item) => [item.recordingId, item]));
  for (const item of payload.items) {
    if (
      drafts[item.recordingId] &&
      JSON.stringify(drafts[item.recordingId].decision) === JSON.stringify(item.decision)
    )
      delete drafts[item.recordingId];
  }
  try {
    $('#reviewer').value = localStorage.getItem(storageKey + '-reviewer') ?? '';
  } catch {
    /* Draft export still works without browser storage. */
  }
  $('#reviewer').addEventListener('input', () => {
    try {
      localStorage.setItem(storageKey + '-reviewer', $('#reviewer').value);
    } catch {
      /* Report storage failure when saving a draft. */
    }
  });
  const freshDraft = (item) => {
    const draft = drafts[item.recordingId];
    return draft &&
      draft.previousRevision === item.previousRevision &&
      draft.decision.recordingSha256 === item.recordingSha256 &&
      draft.decision.contentSha256 === item.contentSha256
      ? draft
      : null;
  };
  const state = (item) => freshDraft(item)?.decision.status ?? item.reviewStatus;
  const current = (item) =>
    freshDraft(item)?.decision ?? (item.reviewStatus !== 'stale' ? item.decision : null);
  const say = (message) => {
    $('#message').textContent = message;
  };
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(drafts));
    } catch {
      storageWarning = 'Browser draft storage is unavailable. Export before closing.';
    }
    $('#draft-status').textContent =
      storageWarning || Object.keys(drafts).length + ' draft decisions saved in this browser.';
  };
  function draw() {
    const query = $('#search').value.trim().toLowerCase();
    const filter = $('#status-filter').value;
    const speaker = $('#speaker-filter').value;
    const rows = payload.items.filter(
      (item) =>
        (!filter || state(item) === filter) &&
        (!speaker || (item.speakerId ?? item.speaker ?? '') === speaker) &&
        (!query ||
          [
            item.recordingId,
            item.text,
            item.speaker,
            ...item.candidates.map(
              (c) => c.syllables.map((s) => s.transcription).join(' ') + ' ' + c.gloss,
            ),
          ]
            .join(' ')
            .toLowerCase()
            .includes(query)),
    );
    page = Math.max(0, Math.min(page, Math.ceil(rows.length / 10) - 1));
    $('#count').textContent =
      rows.length +
      ' recordings · page ' +
      (page + 1) +
      ' / ' +
      Math.max(1, Math.ceil(rows.length / 10));
    $('#items').innerHTML = rows
      .slice(page * 10, page * 10 + 10)
      .map((item) => {
        const d = current(item) ?? {};
        const candidateId = d.pronunciationId ?? item.pronunciationId ?? '';
        const tones = d.realizedTones ?? item.realizedTones ?? [];
        const oldDraft = drafts[item.recordingId] && !freshDraft(item);
        return `<article data-id="${escape(item.recordingId)}"><h2>${escape(item.text)} <small>${escape(item.recordingId)}</small></h2>
      <p>${escape(item.speaker || 'Speaker unknown')} · <strong>${escape(state(item))}</strong> · <a href="${escape(item.source)}" target="_blank" rel="noopener">Original source</a></p>
      ${item.reviewStatus === 'stale' || oldDraft ? '<p class="warning">Previous evidence or saved decision changed. Listen again before saving a new decision.</p>' : ''}
      ${!item.audioAvailable ? '<p class="warning">Audio is missing or does not match the inventory. Repair it before review.</p>' : ''}
      <audio controls preload="none" src="${escape(payload.audioBase + item.audio)}"></audio>
      <label>Decision <select data-field="status">${[
        'unreviewed',
        'approved',
        'uncertain',
        'rejected',
      ]
        .map((s) => `<option value="${s}" ${d.status === s ? 'selected' : ''}>${s}</option>`)
        .join('')}</select></label>
      <label>Pronunciation <select data-field="pronunciationId"><option value="">Choose a reading</option>${item.candidates
        .map(
          (c) =>
            `<option value="${escape(c.pronunciationId)}" ${candidateId === c.pronunciationId ? 'selected' : ''}>${escape(c.syllables.map((s) => s.transcription).join(' ') + ' · ' + c.gloss)}</option>`,
        )
        .join('')}</select></label>
      <label>Heard tones, in order <input data-field="tones" value="${escape(tones.join(' '))}" placeholder="2 3"></label>
      <label>Eligible tone positions (zero based; blank means all on approval) <input data-field="targets" value="${escape((d.toneTargets ?? item.toneTargets ?? []).join(' '))}"></label>
      <label>Teaching reference positions (optional, zero based) <input data-field="references" value="${escape((d.referenceTargets ?? []).join(' '))}"></label>
      <fieldset><legend>Audio issues (optional)</legend>${payload.qualityIssues.map((issue) => `<label class="inline"><input type="checkbox" data-issue="${issue}" ${(d.qualityIssues ?? []).includes(issue) ? 'checked' : ''}>${issue}</label>`).join('')}</fieldset>
      <label>Reason <input data-field="reason" value="${escape(d.reason ?? '')}"></label>
      <button data-action="save" ${!item.audioAvailable ? 'disabled' : ''}>Save draft</button>
      </article>`;
      })
      .join('');
    save();
  }
  $('#items').addEventListener('change', (event) => {
    if (event.target.dataset.field !== 'pronunciationId') return;
    const card = event.target.closest('article');
    const item = items.get(card.dataset.id);
    const candidate = item.candidates.find((c) => c.pronunciationId === event.target.value);
    card.querySelector('[data-field="tones"]').value =
      candidate?.syllables.map((s) => s.tone).join(' ') ?? '';
    card.querySelector('[data-field="targets"]').value =
      candidate?.syllables.map((_, i) => i).join(' ') ?? '';
    card.querySelector('[data-field="references"]').value = '';
  });
  $('#items').addEventListener('click', (event) => {
    if (event.target.dataset.action !== 'save') return;
    const card = event.target.closest('article');
    const item = items.get(card.dataset.id);
    const value = (name) => card.querySelector('[data-field="' + name + '"]').value.trim();
    const numbers = (name) =>
      value(name)
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
    const status = value('status');
    const reviewer = $('#reviewer').value.trim();
    if (!reviewer || !value('reason')) {
      say('Enter a reviewer and a reason before saving.');
      return;
    }
    const decision = {
      status,
      reviewer,
      reviewedAt: new Date().toISOString(),
      reason: value('reason'),
      recordingSha256: item.recordingSha256,
      contentSha256: item.contentSha256,
      qualityIssues: [...card.querySelectorAll('[data-issue]:checked')].map(
        (el) => el.dataset.issue,
      ),
    };
    if (status === 'approved') {
      const candidate = item.candidates.find((c) => c.pronunciationId === value('pronunciationId'));
      const tones = numbers('tones');
      const targets = value('targets') ? numbers('targets') : [];
      const references = numbers('references');
      if (
        !candidate ||
        tones.length !== candidate.syllables.length ||
        !tones.every((t) => Number.isInteger(t) && t >= 1 && t <= payload.maxTone) ||
        ![...targets, ...references].every(
          (i) => Number.isInteger(i) && i >= 0 && i < tones.length,
        ) ||
        new Set(targets).size !== targets.length ||
        new Set(references).size !== references.length ||
        references.some((i) => value('targets') && !targets.includes(i)) ||
        (payload.language === 'cmn' &&
          references.some((i) => (tones[i] === 5 ? tones.length < 2 : tones.length !== 1)))
      ) {
        say('Check the pronunciation, heard tones, eligible positions, and teaching references.');
        return;
      }
      decision.pronunciationId = candidate.pronunciationId;
      decision.realizedTones = tones;
      if (value('targets')) decision.toneTargets = targets;
      decision.referenceTargets = references;
    }
    drafts[item.recordingId] = { decision, previousRevision: item.previousRevision };
    say('Draft saved for ' + item.recordingId + '. Export and import to update the catalog.');
    draw();
  });
  for (const selector of ['#search', '#status-filter', '#speaker-filter'])
    $(selector).addEventListener(selector === '#search' ? 'input' : 'change', () => {
      page = 0;
      draw();
    });
  $('#previous').onclick = () => {
    page--;
    draw();
  };
  $('#next').onclick = () => {
    page++;
    draw();
  };
  $('#export').onclick = () => {
    const recordings = {},
      previous = {};
    for (const item of payload.items) {
      const draft = freshDraft(item);
      if (!draft) continue;
      recordings[item.recordingId] = draft.decision;
      previous[item.recordingId] = draft.previousRevision;
    }
    if (!Object.keys(recordings).length) {
      say('No current draft decisions to export.');
      return;
    }
    const blob = new Blob(
      [JSON.stringify({ version: 1, language: payload.language, recordings, previous }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = payload.language + '-listening-reviews.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(
      'Exported ' +
        Object.keys(recordings).length +
        ' decisions. Import with audio:import-review, then rebuild catalogs.',
    );
  };
  const speakers = new Map(
    payload.items.map((item) => [item.speakerId ?? item.speaker ?? '', item.speaker || 'Unknown']),
  );
  $('#speaker-filter').innerHTML =
    '<option value="">All speakers</option>' +
    [...speakers]
      .filter(([id]) => id)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => `<option value="${escape(id)}">${escape(name)}</option>`)
      .join('');
  draw();
}

export function listeningPage(payload) {
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tone Tower listening review</title>
  <style>body{font:16px system-ui;max-width:960px;margin:2em auto;padding:0 1em;background:#f4f3ef;color:#1b2938}article{padding:1em;margin:1em 0;background:white;border:1px solid #ccc;border-radius:8px}h2{font-size:1.2em}small{font-size:.75em;overflow-wrap:anywhere}label{display:block;margin:.6em 0}.inline{display:inline-block;margin-right:1em}input,select,button{font:inherit;padding:.4em;max-width:100%;box-sizing:border-box}input:not([type=checkbox]){width:100%}audio{width:100%}.warning{color:#884300}nav{display:flex;gap:.5em;flex-wrap:wrap}a{color:#125ca2}#message{min-height:1.5em}</style>
  <h1>Optional listening review · ${payload.language === 'yue' ? 'Cantonese' : 'Mandarin'}</h1>
  <p>Untouched recordings remain playable. Dictionary matching is not human listening review. Uncertain decisions disable tone questions while retaining suitable spelling exercises.</p>
  <p>Save drafts in this browser, export a JSON batch, then run <code>npm run audio:import-review -- --language ${payload.language} --file PATH</code> and <code>npm run catalog</code>. Refresh this page after import. Drafts do not modify source data.</p>
  <label>Reviewer <input id="reviewer" autocomplete="name"></label>
  <label>Find text, transcription, recording ID, meaning, or speaker <input id="search" type="search"></label>
  <nav><label>Status <select id="status-filter"><option value="">All statuses</option>${['unreviewed', 'approved', 'uncertain', 'rejected', 'stale'].map((s) => `<option>${s}</option>`).join('')}</select></label><label>Speaker <select id="speaker-filter"></select></label></nav>
  <nav><button id="previous">Previous</button><span id="count"></span><button id="next">Next</button><button id="export">Export edited reviews</button></nav>
  <p id="draft-status"></p><p id="message" role="status" aria-live="polite"></p><main id="items"></main>
  <script>(${reviewApp.toString()})(${data});</script></html>`;
}
