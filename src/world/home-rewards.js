// Permanent home decorations only consume the earned flags supplied by the app.
export function drawHomeRewards(ctx, s, P, layer = 'ornaments') {
  const rewards = s.rewards;
  if (!rewards) return;
  const r = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const reacting = (key) => s.rewardInteraction === key && (s.elapsed || 0) < 1.8;
  function flowers(x, y, box = false) {
    if (box) {
      r(x - 4, y + 1, 33, 8, P.wood);
      r(x - 5, y, 35, 3, P.gold);
      r(x - 2, y + 5, 29, 2, P.brick);
    }
    for (let i = 0; i < 5; i++) {
      const xx = x + i * 6,
        yy = y - (i % 2) * 3;
      r(xx, yy - 5, 1, 7, P.grass);
      r(xx - 2, yy - 1, 2, 2, P.leaf);
      r(xx - 2, yy - 7, 5, 3, i % 2 ? P.red : P.glass);
      r(xx - 1, yy - 8, 3, 5, i % 2 ? P.red : P.glass);
      r(xx, yy - 6, 1, 1, P.gold);
    }
  }
  function cat(x, y, key, sleepy = false) {
    const awake = reacting(key),
      stretch = awake && !s.reduced;
    const fur = sleepy ? P.brick : P.cream;
    r(x - 3, y + 1, 26, 3, P.deep);
    r(x, y - 8, stretch ? 22 : 16, 10, fur);
    r(x + 2, y - 6, 3, 8, P.gold);
    r(x + 10, y - 4, 3, 6, P.gold);
    r(x - 4, y - 16, 12, 11, fur);
    r(x - 4, y - 20, 3, 7, fur);
    r(x + 5, y - 20, 3, 7, fur);
    r(x - 3, y - 18, 1, 3, P.red);
    r(x + 6, y - 18, 1, 3, P.red);
    r(x - 2, y - 12, 2, sleepy && !awake ? 1 : 2, P.deep);
    r(x + 4, y - 12, 2, sleepy && !awake ? 1 : 2, P.deep);
    r(x + 1, y - 9, 2, 1, P.red);
    r(x + 15, y - 5, 9, 3, fur);
    r(x + 21, y - 12, 3, 9, fur);
    if (stretch) {
      r(x + 19, y - 1, 3, 5, fur);
      r(x - 4, y, 6, 3, fur);
    }
    if (awake) {
      r(x + 10, y - 27, 3, 3, P.red);
      r(x + 14, y - 27, 3, 3, P.red);
      r(x + 11, y - 24, 5, 2, P.red);
      r(x + 12, y - 22, 3, 2, P.red);
    }
  }
  function dragon(x, y, key, gold = false) {
    const awake = reacting(key),
      body = gold ? P.gold : P.teal;
    const shade = gold ? P.brick : P.water;
    // A curled body, stepped crest and whiskered face share the world's pixel grid.
    r(x - 17, y - 2, 31, 8, shade);
    r(x - 22, y - 9, 9, 12, body);
    r(x - 20, y - 14, 24, 8, body);
    r(x - 13, y - 11, 13, 5, P.deep);
    r(x - 16, y + 2, 24, 3, body);
    r(x - 19, y - 17, 4, 4, P.gold);
    r(x - 12, y - 18, 4, 4, P.gold);
    r(x - 5, y - 18, 4, 4, P.gold);
    r(x + 2, y - 19, 15, 13, body);
    r(x + 13, y - 13, 11, 7, body);
    r(x + 3, y - 24, 3, 7, P.cream);
    r(x + 11, y - 24, 3, 7, P.cream);
    r(x + 7, y - 16, 4, awake ? 4 : 1, P.deep);
    if (awake) r(x + 8, y - 15, 1, 2, P.cream);
    r(x + 20, y - 12, 2, 2, P.deep);
    r(x + 16, y - 5, 13, 1, P.cream);
    r(x + 22, y - 8, 9, 1, P.cream);
    r(x + 10, y - 3, 4, 6, body);
    r(x + 8, y + 3, 8, 2, P.cream);
    if (awake && !s.reduced) {
      const rise = Math.floor((s.elapsed || 0) * 8);
      r(x + 28, y - 16 - rise, 2, 2, P.gold);
      r(x + 32, y - 21 - rise, 2, 2, P.cream);
    }
  }
  if (layer === 'gardens') {
    if (rewards.tone.easy) {
      flowers(101, 205);
      flowers(164, 205);
    }
    if (rewards.tide.easy) {
      flowers(297, 196, true);
      flowers(357, 196, true);
    }
    return;
  }
  if (rewards.tone.hard) {
    r(192, 67, 2, 62, P.gold);
    r(194, 70, 19, 36, P.red);
    r(197, 73, 13, 26, P.wood);
    for (let row = 0; row < 7; row++) {
      const inset = Math.abs(3 - row);
      r(198 + inset, 78 + row * 2, 11 - inset * 2, 2, P.gold);
    }
    r(202, 82, 3, 6, P.red);
    r(194, 106, 7, 5, P.red);
    r(206, 106, 7, 5, P.red);
  }
  if (rewards.tide.hard) {
    r(322, 143, 27, 27, P.gold);
    r(324, 145, 23, 23, P.wood);
    r(326, 147, 19, 19, P.cream);
    r(334, 150, 2, 9, P.deep);
    r(334, 157, 7, 2, P.deep);
    for (const x of [323, 345]) {
      r(x, 137, 3, 6, P.gold);
      r(x - 2, 134, 7, 3, P.gold);
      r(x, 169, 3, 6, P.gold);
    }
    r(333, 171, 4, 9, P.gold);
    r(330, 178, 10, 3, P.gold);
  }
  if (rewards.tone.normal) cat(168, 97, 'tone-normal');
  if (rewards.tide.normal) cat(306, 147, 'tide-normal', true);
  if (rewards.tone.extreme) dragon(144, 13, 'tone-extreme');
  if (rewards.tide.extreme) dragon(428, 190, 'tide-extreme', true);
}
