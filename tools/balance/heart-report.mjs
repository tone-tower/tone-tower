import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import {
  accuracyModel,
  balanceConfig,
  calibratedRate,
  difficulties,
  firstReaching,
  mean,
  runOdds,
  scenarios,
} from './heart-model.mjs';
import { TOWER_LEGACY_HEART_CAPS } from '../../src/game/heart-recovery.ts';

const title = (value) => value[0].toUpperCase() + value.slice(1);
function pct(value, digits = 3) {
  if (value === null) return '—';
  const percent = value * 100;
  return `${percent > 0 && percent < 10 ** -digits ? percent.toExponential(3) : percent.toFixed(digits)}%`;
}
const colors = ['#167451', '#145da0', '#a04315', '#813e9a'];

function table(headers, rows) {
  return `<div class="table-wrap"><table>
    <thead><tr>${headers.map((cell) => `<th scope="col">${cell}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map(
        ([label, ...cells]) =>
          `<tr><th scope="row">${label}</th>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`,
      )
      .join('')}</tbody>
  </table></div>`;
}

function chart(description, series, xTicks, xLabel, yLabel) {
  const min = xTicks[0].value;
  const max = xTicks.at(-1).value;
  const x = (value) => 61 + (590 * (value - min)) / (max - min);
  const y = (value) => 236 - value * 198;
  return `<figure>
    <svg viewBox="0 0 684 290" role="img" aria-label="${description}">
      <text x="61" y="20">${yLabel}</text>
      ${[0, 0.25, 0.5, 0.75, 1]
        .map(
          (value) =>
            `<path class="grid" d="M61 ${y(value)}H651" /><text x="54" y="${y(value) + 4}" text-anchor="end">${pct(value, 0)}</text>`,
        )
        .join('')}
      ${xTicks.map(({ value, label }) => `<text x="${x(value)}" y="254" text-anchor="middle">${label}</text>`).join('')}
      ${series
        .map(
          (points, index) =>
            `<polyline fill="none" stroke="${colors[index]}" stroke-width="2.5" points="${points
              .map(([a, b]) => `${x(a).toFixed(1)},${y(b).toFixed(1)}`)
              .join(' ')}" />`,
        )
        .join('')}
      <text x="356" y="278" text-anchor="middle">${xLabel}</text>
    </svg>
    <figcaption>${difficulties.map((name, i) => `<span><i style="background:${colors[i]}"></i>${title(name)}</span>`).join('')}</figcaption>
  </figure>`;
}

function languageReport(scenario, benchmark, policy) {
  const { name, profile } = scenario;
  const model = accuracyModel(scenario, benchmark);
  const options = difficulties.map((key) => policy[key]);
  const outcomes = options.map((option) => runOdds(model, option));
  const baseline = difficulties.map((key) =>
    runOdds(model, { cap: TOWER_LEGACY_HEART_CAPS[key], midpoint: true }),
  );
  const thresholds = options.map((option) =>
    firstReaching((accuracy) => runOdds(accuracyModel(scenario, accuracy), option).win, 0.5, 0.01),
  );
  const anchors = Array.from({ length: 26 }, (_, index) => (75 + index) / 100);
  const sweep = anchors.map((anchor) => {
    const model = accuracyModel(scenario, anchor);
    return options.map((option) => runOdds(model, option).win);
  });
  const sections = profile.stageChoices.map((count, index) => `${index + 1} (${count} doors)`);
  return `<section>
    <h2>${name}</h2>
    <p>Full-set accuracy benchmark ${pct(benchmark, 1)}. Each section starts with full hearts.</p>
    ${chart(
      `${name} tower win probability by listening accuracy`,
      difficulties.map((_, i) => anchors.map((anchor, j) => [anchor, sweep[j][i]])),
      [0.75, 0.8, 0.85, 0.9, 0.95, 1].map((value) => ({ value, label: pct(value, 0) })),
      'Accuracy with all tones visible',
      'Whole-tower win probability',
    )}
    <details><summary>Win odds at each plotted accuracy</summary>
      ${table(
        ['Full-set accuracy', ...difficulties.map(title)],
        anchors.map((anchor, index) => [pct(anchor, 0), ...sweep[index].map((p) => pct(p, 6))]),
      )}
    </details>
    ${chart(
      `${name} conditional clear probability at the benchmark`,
      outcomes.map(({ sectionClears }) => sectionClears.map((prob, i) => [i + 1, prob])),
      sections.map((label, i) => ({ value: i + 1, label })),
      'Section',
      'Clear probability on entry',
    )}
    ${table(
      ['Difficulty', ...sections, 'Old win rate', 'Win rate', 'Accuracy for 50% wins'],
      outcomes.map(({ sectionClears, win }, i) => [
        title(difficulties[i]),
        ...sectionClears.map((p) => pct(p, 6)),
        pct(baseline[i].win, 6),
        pct(win, 6),
        pct(thresholds[i]),
      ]),
    )}
    <p>Per-prompt accuracy by section ${model.map((row) => pct(mean(row), 2)).join(' · ')}.</p>
  </section>`;
}

async function main() {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, config: { type: 'string' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log(
      'Usage: npm run balance:hearts -- [--out <report.html>] [--config <settings.json>]',
    );
    return;
  }
  const reference = fileURLToPath(new URL('../../docs/heart-balance-report.html', import.meta.url));
  const out = resolve(
    values.out ?? (values.config ? join(tmpdir(), 'tone-tower-heart-balance.html') : reference),
  );
  const settings = balanceConfig(
    values.config ? JSON.parse(await readFile(values.config, 'utf8')) : {},
  );
  const entries = Object.entries(scenarios);
  const models = entries.map(([key, scenario]) =>
    accuracyModel(scenario, settings.fullSetAccuracy[key]),
  );
  const policy = Object.fromEntries(
    difficulties.map((key) => [
      key,
      { cap: settings.heartCaps[key], lastHeartChance: settings.lastHeartDropChance[key] },
    ]),
  );
  const calibration = difficulties.map((key) => {
    const { cap, lastHeartChance } = policy[key];
    const { baseline, target, rate } = calibratedRate(models, cap, settings.failureReduction);
    const achieved = mean(models.map((model) => mean(runOdds(model, policy[key]).sectionClears)));
    return [
      title(key),
      cap,
      pct(lastHeartChance),
      pct(baseline),
      pct(target),
      pct(achieved),
      pct(rate),
    ];
  });
  const html = `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Tone Tower heart balance</title>
    <style>
      :root {color-scheme:light; font: 16px/1.5 system-ui,sans-serif; color:#1d2828; background:#f5f7f4}
      body {max-width:1100px; margin:32px auto; padding:0 20px}
      section {margin:30px 0; padding:18px; background:white; border:1px solid #cad5cd; border-radius:12px}
      h2 {margin-top:0}
      figure {margin:18px 0; max-width:760px}
      svg {width:100%; display:block; font-size:12px; fill:#263936}
      .grid {fill:none; stroke:#d8dfda}
      figcaption {display:flex; gap:12px; flex-wrap:wrap}
      figcaption i {display:inline-block; width:12px; height:3px; margin-right:4px; vertical-align:middle}
      .table-wrap {overflow:auto}
      table {border-collapse:collapse; width:100%; text-align:right; font-variant-numeric:tabular-nums}
      td,th {padding:6px 8px; border-bottom:1px solid #d8dfda}
      th:first-child {text-align:left}
      summary {cursor:pointer}
      details {margin:12px 0 24px}
    </style></head><body>
    <h1>Tone Tower heart balance</h1>
    <p>Modeled probabilities for reference listeners. Section clear rates are conditional on reaching the section. The original win-rate column uses the old four difficulty caps and midpoint heart.</p>
    <section><h2>Recovery settings</h2>
      <p>Target ${pct(settings.failureReduction, 0)} fewer section failures than the midpoint rule at the selected caps. Each language and section has equal weight. A dash marks an unreachable target or a one-heart cap.</p>
      ${table(['Difficulty', 'Hearts', 'Chance at one heart', 'Midpoint clear', 'Target clear', 'Selected clear', 'Fitted chance'], calibration)}
    </section>
    ${entries.map(([key, scenario]) => languageReport(scenario, settings.fullSetAccuracy[key], policy)).join('')}
    </body></html>`;
  const prettierConfig = await resolveConfig(reference);
  await writeFile(out, await format(html, { ...prettierConfig, parser: 'html' }), 'utf8');
  console.log(out);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
