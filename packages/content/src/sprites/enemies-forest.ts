import { C } from '../palette';
import { outlined, type SpriteDef } from './types';

/** Whispering Forest creatures (side view, facing right; the renderer flips them). */

const wolfFrames = [
  `
  ................
  ................
  ................
  ..........d.d...
  .........dGdGd..
  .........dGGGGd.
  ..d......dGeGGw.
  .dGd.....dGGGd..
  ..dGddddddGGGd..
  ...dGGGGGGGGGd..
  ...dGGGGGGGGGd..
  ...dgGdgggGdgd..
  ...dg.dg..dg.d..
  ...k..k...k..k..
  ................
  ................
  `,
  `
  ................
  ................
  ................
  ..........d.d...
  .........dGdGd..
  .........dGGGGd.
  .d.......dGeGGw.
  ..dd.....dGGGd..
  ..dGddddddGGGd..
  ...dGGGGGGGGGd..
  ...dGGGGGGGGGd..
  ...dgGdgggGdgd..
  ..dg...gd.dg..d.
  ..k.....k.k...k.
  ................
  ................
  `,
];

export const wolf = outlined(
  'en.wolf',
  16,
  16,
  { d: C.stone2, G: C.stone3, g: C.stone1, e: C.red2, w: C.bone2, k: C.ink },
  wolfFrames,
);

/** Scale a pixel map 2× (the pack leader is a giant version of the wolf). */
function scale2(frame: string): string {
  const rows = frame
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const out: string[] = [];
  for (const r of rows) {
    const wide = [...r].map((c) => c + c).join('');
    out.push(wide, wide);
  }
  return out.join('\n');
}

export const alphaWolf = outlined(
  'en.alphaWolf',
  32,
  32,
  { d: C.night, G: C.stone2, g: C.ink, e: C.cyan3, w: C.bone2, k: C.black },
  wolfFrames.map(scale2),
);

const sporePal = {
  r: C.red2,
  R: C.red3,
  w: C.bone2,
  s: C.bone1,
  S: C.bone0,
  k: C.ink,
  g: C.green1,
};

export const sporeling = outlined('en.sporeling', 16, 16, sporePal, [
  `
  ................
  ................
  ................
  .....rrrrrr.....
  ...rrRRwrrrrr...
  ..rRRwwrrrwrrr..
  ..rrrrrrrrrwwr..
  ..rrwwrrrrrrrr..
  ...rrrrrrrrrr...
  .....ssssss.....
  .....skssks.....
  .....ssssss.....
  .....sSssSs.....
  ....gsS..Ssg....
  ................
  ................
  `,
  `
  ................
  ................
  ................
  ................
  .....rrrrrr.....
  ...rrRRwrrrrr...
  ..rRRwwrrrwrrr..
  ..rrrrrrrrrwwr..
  ..rrwwrrrrrrrr..
  ...rrrrrrrrrr...
  .....skssks.....
  .....sSssSs.....
  ....gsS..Ssg....
  ................
  ................
  ................
  `,
]);

const boarPal = {
  b: C.wood1,
  B: C.wood2,
  d: C.wood0,
  n: C.wood3,
  t: C.bone2,
  e: C.red2,
  k: C.ink,
};

const boarBody = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........dddddd.d........',
  '......ddBBBBBBdBd.......',
  '....ddBBbbbbbbBBBdd.....',
  '...dBbbbbbbbbbbbBBBdd...',
  '..dBbbbbbbbbbbbbbbBeBd..',
  '..dbbbbbbbbbbbbbbbBBBnn.',
  '..dbbbbbbbbbbbbbbbbBnnk.',
  '..ddbbbbbbbbbbbbbbbbtt..',
  '...dbbbbbbbbbbbbbbbdt...',
  '...ddbbbbbbbbbbbbbdd....',
  '....ddbdddddddddbdd.....',
];
const boarLegsA = [
  '....db.db.....db.db.....',
  '....db.db.....db.db.....',
  '....kk.kk.....kk.kk.....',
];
const boarLegsB = [
  '....db..db...db..db.....',
  '...db...db..db...db.....',
  '...kk...kk..kk...kk.....',
];
const empty24 = '........................';
const boarFrame = (legs: string[]) =>
  [...boarBody, ...legs, empty24, empty24, empty24, empty24, empty24].join('\n');

export const boar = outlined('en.boar', 24, 24, boarPal, [
  boarFrame(boarLegsA),
  boarFrame(boarLegsB),
]);

export const FOREST_ENEMY_SPRITES: SpriteDef[] = [wolf, alphaWolf, sporeling, boar];
