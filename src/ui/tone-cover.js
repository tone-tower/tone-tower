// The dust creature from behind the wrong doors sits on the tone mark, and a smaller
// one hangs below where a dot would be, until the player has chosen a door.
const dark = '#151e32',
  fur = '#706186',
  coat = '#9690b9',
  light = '#b4b2dc',
  cream = '#ffe3ac',
  red = '#e88d83';
const creature = [
  [1, 9, 21, 13, dark],
  [4, 4, 15, 21, dark],
  [2, 10, 19, 11, fur],
  [5, 5, 13, 18, coat],
  [3, 0, 4, 8, dark],
  [16, 1, 4, 8, dark],
  [4, 1, 2, 7, light],
  [17, 2, 2, 6, light],
  [6, 6, 8, 2, light],
  [5, 10, 5, 5, cream],
  [14, 10, 4, 5, cream],
  [7, 12, 2, 3, dark],
  [14, 12, 2, 3, dark],
  [3, 16, 3, 2, red],
  [17, 16, 3, 2, red],
  [10, 18, 3, 2, dark],
  [4, 23, 4, 3, fur],
  [15, 23, 4, 3, fur],
];
const mote = [
  [1, 1, 11, 7, dark],
  [3, 0, 7, 9, dark],
  [2, 2, 9, 5, fur],
  [4, 1, 5, 7, coat],
  [3, 3, 2, 2, cream],
  [8, 3, 2, 2, cream],
  [4, 4, 1, 1, dark],
  [8, 4, 1, 1, dark],
];
const sprite = (name, width, height, pixels) =>
  '<svg class="tone-cover-' +
  name +
  '" viewBox="0 0 ' +
  width +
  ' ' +
  height +
  '" shape-rendering="crispEdges">' +
  pixels
    .map(
      ([x, y, w, h, fill]) =>
        '<rect x="' +
        x +
        '" y="' +
        y +
        '" width="' +
        w +
        '" height="' +
        h +
        '" fill="' +
        fill +
        '"/>',
    )
    .join('') +
  '</svg>';

export const toneCoverMarkup = (leaving = false) =>
  '<span class="tone-cover' +
  (leaving ? ' is-leaving' : '') +
  '" aria-hidden="true">' +
  sprite('top', 23, 26, creature) +
  sprite('bottom', 13, 9, mote) +
  '</span>';
