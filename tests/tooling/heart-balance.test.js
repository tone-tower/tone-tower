import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accuracyModel,
  balanceConfig,
  calibratedRate,
  firstReaching,
  mean,
  runOdds,
  scenarios,
} from '../../tools/balance/heart-model.mjs';

test('survival with no recovery matches the negative binomial calculation', () => {
  const p = 0.9;
  const accuracy = Array.from({ length: 5 }, () => [p, p, p]);
  const clear = p ** 20 * (1 + 20 * (1 - p) + 210 * (1 - p) ** 2 + 1540 * (1 - p) ** 3);
  const normal = runOdds(accuracy, { cap: 4 });
  assert.ok(Math.abs(normal.win - clear ** 5) < 1e-12);
  assert.ok(normal.sectionClears.every((rate) => Math.abs(rate - clear) < 1e-12));
  assert.ok(Math.abs(runOdds(accuracy, { cap: 1, lastHeartChance: 1 }).win - p ** 100) < 1e-12);
});

test('the pair model matches the full-set anchors and predicts the reference sensitivity', () => {
  const settings = balanceConfig();
  const models = Object.entries(scenarios).map(([lang, scenario]) => {
    const model = accuracyModel(scenario, settings.fullSetAccuracy[lang]);
    assert.ok(Math.abs(mean(model.at(-1)) - settings.fullSetAccuracy[lang]) < 1e-9);
    assert.deepEqual(model[3], model[4]);
    assert.ok(mean(model[0]) > mean(model[1]));
    return model;
  });
  const normal = {
    cap: settings.heartCaps.normal,
    lastHeartChance: settings.lastHeartDropChance.normal,
  };
  const wins = (accuracy) => runOdds(accuracyModel(scenarios.cmn, accuracy), normal).win;
  for (const [anchor, expected] of [
    [0.85, 0.497666],
    [0.9, 0.823538],
    [0.95, 0.982635],
  ])
    assert.ok(Math.abs(wins(anchor) - expected) < 1e-6);
  assert.ok(Math.abs(firstReaching(wins, 0.5, 0.01) - 0.850333) < 1e-6);
  const fit = calibratedRate(models, normal.cap, settings.failureReduction);
  assert.ok(Math.abs(fit.rate - normal.lastHeartChance) < 0.01);
  assert.equal(calibratedRate(models, 1, settings.failureReduction).rate, null);
});

test('configuration overrides are validated without replacing other defaults', () => {
  const settings = balanceConfig({ fullSetAccuracy: { cmn: 0.85 }, heartCaps: { normal: 5 } });
  assert.equal(settings.fullSetAccuracy.cmn, 0.85);
  assert.equal(settings.fullSetAccuracy.yue, 0.87);
  assert.equal(settings.heartCaps.normal, 5);
  assert.throws(() => balanceConfig({ fullSetAccuracy: { vi: 0 } }), /fullSetAccuracy.vi/);
  assert.throws(() => balanceConfig({ lastHeartDropChance: { normal: '0.5' } }), /normal/);
  assert.throws(() => balanceConfig({ heartCaps: { extra: 1 } }), /Unknown/);
});
