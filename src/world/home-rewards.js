// Coordinates share the canvas pixel grid; hit targets use these same positions.
export function homeFriendPositions(s = {}) {
  const time = s.reduced ? 0 : s.homeTime || 0;
  function patrol(left, right, y, offset = 0) {
    const phase = (time + offset) % 24;
    const fraction =
      phase < 7 ? 0 : phase < 12 ? (phase - 7) / 5 : phase < 19 ? 1 : 1 - (phase - 19) / 5;
    return {
      x: left + (right - left) * fraction,
      y,
      direction: phase < 19 ? 1 : -1,
      walking: (phase >= 7 && phase < 12) || phase >= 19,
    };
  }
  return {
    'tone-normal': patrol(116, 168, 97),
    'tide-normal': patrol(302, 360, 140, 4),
    'tide-hard': { x: 414, y: 105 },
    'tone-extreme': { x: 144, y: 13 },
    'tide-extreme': { x: 428, y: 190 },
  };
}

// Permanent home decorations only consume the earned flags supplied by the app.
export function drawHomeRewards(ctx, s, P, layer = 'ornaments') {
  const rewards = s.rewards;
  if (!rewards) return;
  const r = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const friends = homeFriendPositions(s);
  const time = s.reduced ? 0 : s.homeTime || 0;
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
  function butterflies(x, y) {
    for (let k = 0; k < 3; k++) {
      const phase = time * 0.8 + k * 2.1;
      const xx = x + Math.sin(phase) * 24;
      const yy = y + Math.cos(phase * 1.3) * 9;
      const wing = s.reduced ? 3 : 1 + Math.round((Math.sin(time * 9 + k) + 1) * 2);
      r(xx - wing, yy - 2, wing, 5, k % 2 ? P.red : P.teal);
      r(xx + 1, yy - 2, wing, 5, k % 2 ? P.gold : P.glass);
      r(xx, yy - 1, 1, 4, P.deep);
    }
  }
  function cat(key, sleepy = false) {
    const awake = reacting(key),
      stretch = awake && !s.reduced;
    const pose = friends[key];
    ctx.save();
    ctx.translate(Math.round(pose.x), Math.round(pose.y));
    ctx.scale(pose.direction, 1);
    const x = 0,
      y = pose.walking && !s.reduced ? Math.floor(time * 7) % 2 : 0;
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
    ctx.restore();
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
      butterflies(145, 185);
    }
    if (rewards.tide.easy) {
      flowers(297, 196, true);
      flowers(357, 196, true);
      butterflies(337, 178);
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
    const { x, y } = friends['tide-hard'];
    const spread = reacting('tide-hard') ? 13 : 5 + Math.round(Math.sin(time * 1.4) * 2);
    // A moon heron: long legs, a luminous crescent crest and a slow feather fan.
    r(x - 1, y + 6, 2, 17, P.gold);
    r(x + 6, y + 6, 2, 17, P.gold);
    r(x - 4, y + 22, 7, 2, P.gold);
    r(x + 5, y + 22, 7, 2, P.gold);
    r(x - 13, y + 25, 34, 3, P.gold);
    r(x - 9, y + 28, 26, 2, P.teal);
    r(x - 9, y - 3, 23, 14, P.glass);
    r(x - 8 - spread, y, spread + 12, 4, P.teal);
    r(x - 6 - spread, y + 4, spread + 9, 3, P.water);
    r(x + 6, y - 19, 5, 23, P.cream);
    r(x + 4, y - 22, 13, 8, P.glass);
    r(x + 13, y - 19, 2, 2, P.dark);
    r(x + 17, y - 18, 12, 2, P.gold);
    r(x + 3, y - 28, 3, 10, P.gold);
    r(x + 6, y - 30, 7, 3, P.gold);
    r(x + 10, y - 29, 4, 2, P.cream);
    for (let k = 0; k < 3; k++) {
      const yy = y - 9 - ((time * 7 + k * 11) % 30);
      r(x - 13 + k * 8, yy, 2, 2, P.gold);
    }
  }
  if (rewards.tone.normal) cat('tone-normal');
  if (rewards.tide.normal) cat('tide-normal', true);
  if (rewards.tone.extreme) dragon(144, 13, 'tone-extreme');
  if (rewards.tide.extreme) dragon(428, 190, 'tide-extreme', true);
}
