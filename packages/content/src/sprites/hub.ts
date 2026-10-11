import { C } from '../palette';
import { hd, Pix } from './paint';
import type { SpriteDef } from './types';

/** Hub station objects and the captive cage, HD (res 2). */

const PAL: Record<string, string> = {
  k: C.ink,
  K: C.black,
  W: C.white,
  a: C.stone1,
  b: C.stone2,
  c: C.stone3,
  d: C.stone4,
  w: C.wood0,
  x: C.wood1,
  y: C.wood2,
  z: C.wood3,
  r: C.red1,
  R: C.red2,
  s: C.red3,
  g: C.gold1,
  G: C.gold2,
  H: C.gold3,
  e: C.cyan1,
  f: C.cyan2,
  F: C.cyan3,
  l: C.green1,
  L: C.green2,
  n: C.green3,
  m: C.moss1,
  M: C.moss0,
  p: C.bone1,
  P: C.bone2,
  v: C.violet1,
  V: C.violet2,
  i: C.blue2,
};

export const anvil = hd('hub.anvil', PAL, [
  (() => {
    const p = new Pix(32, 32);
    // Stump, then the iron anvil with a horn to the right.
    p.shadedPoly([9, 20, 23, 20, 24, 30, 8, 30], 'wxyz', { bias: 0.2 });
    p.line(11, 22, 11, 29, 'w');
    p.line(19, 21, 19, 29, 'w');
    p.shadedPoly([12, 15, 21, 15, 22, 20, 11, 20], 'abc');
    p.shadedPoly([4, 9, 24, 9, 30, 11, 24, 15, 7, 15, 4, 12], 'abcd', { bias: 0.3 });
    p.line(5, 9.5, 24, 9.5, 'W');
    // A hammer resting on top.
    p.limb(9, 7, 17, 4, 0.9, 0.9, 'xy');
    p.ball(8, 7.5, 2.2, 1.6, 'bcd');
    return p;
  })(),
]);

export const cauldron = hd(
  'hub.cauldron',
  PAL,
  [0, 1].map((f) => {
    const p = new Pix(32, 32);
    // Fire underneath.
    for (const [x, h] of [
      [11, 4 + f],
      [16, 6 - f],
      [21, 4 + f],
    ] as const) {
      p.limb(x, 30, x + (f ? 1 : -1), 30 - h, 2.4, 0.5, 'rRs');
    }
    p.ball(16, 18, 11, 9.5, 'Kabc', { bias: -0.3 });
    p.rect(4, 8, 24, 6, '.', { onlyOver: 'Kabc' });
    p.ellipse(16, 13, 11, 3, 'a');
    p.ellipse(16, 13, 9.5, 2.2, 'l');
    p.ellipse(16, 12.6, 9, 1.6, 'L');
    // Bubbles.
    p.ball(11 + f * 3, 12 - f, 1.6, 1.6, 'Ln');
    p.ball(19 - f * 2, 11.5 + f, 1.2, 1.2, 'Ln');
    p.set(14, 8 - f * 2, 'n');
    p.set(20, 6 + f, 'n');
    for (const x of [6, 26]) p.ball(x, 15, 1.4, 1.4, 'bc');
    return p;
  }),
);

export const stall = hd(
  'hub.stall',
  PAL,
  [
    (() => {
      const p = new Pix(48, 40);
      // Posts, counter with goods, striped awning.
      for (const x of [6, 41]) p.limb(x, 8, x, 34, 1.3, 1.3, 'xy');
      p.shadedPoly([3, 22, 45, 22, 45, 34, 3, 34], 'wxyz', { bias: 0.2 });
      p.line(3, 23, 45, 23, 'z');
      for (let x = 6; x < 44; x += 6) p.line(x, 25, x, 33, 'w');
      // Goods on the counter.
      p.ball(11, 20, 3, 2.6, 'rRs');
      p.ball(17, 20.5, 2.4, 2.2, 'gGH');
      p.ball(24, 19.5, 3, 3, 'lLn');
      p.rect(29, 16, 5, 6, 'e');
      p.rect(29, 16, 5, 1.5, 'F');
      p.ball(38, 20, 2.6, 2.4, 'vV');
      // Awning with scalloped edge.
      for (let x = 1; x < 47; x++) {
        const stripe = Math.floor((x - 1) / 6) % 2 === 0;
        const hem = 13 + ((x - 1) % 6 < 3 ? 1 : 0) + ((x - 1) % 6 === 2 ? 1 : 0);
        for (let y = 3; y < hem; y++) p.set(x, y, stripe ? (y < 5 ? 's' : 'R') : y < 5 ? 'W' : 'P');
      }
      p.line(1, 3, 46, 3, 'W');
      return p;
    })(),
  ],
  { ox: 24, oy: 30 },
);

export const board = hd(
  'hub.board',
  PAL,
  [
    (() => {
      const p = new Pix(32, 40);
      for (const x of [6, 25]) p.limb(x, 6, x, 37, 1.4, 1.4, 'wxy');
      p.shadedPoly([3, 4, 29, 4, 29, 26, 3, 26], 'xyz', { bias: -0.2 });
      p.rect(3, 4, 26, 1.5, 'z');
      // Pinned notes.
      for (const [x, y, w, h, c] of [
        [6, 7, 8, 7, 'P'],
        [17, 8, 9, 6, 'p'],
        [8, 16, 7, 8, 'p'],
        [18, 16, 8, 7, 'P'],
      ] as const) {
        p.rect(x, y, w, h, c);
        p.line(x + 1, y + 2.5, x + w - 2, y + 2.5, 'c');
        p.line(x + 1, y + 4.5, x + w - 3, y + 4.5, 'c');
        p.set(x + w / 2, y, 'R');
      }
      return p;
    })(),
  ],
  { ox: 16, oy: 32 },
);

export const statue = hd(
  'hub.statue',
  PAL,
  [
    (() => {
      const p = new Pix(32, 64);
      // Pedestal.
      p.shadedPoly([5, 46, 27, 46, 28, 56, 4, 56], 'abcd', { bias: 0.2 });
      p.shadedPoly([3, 42, 29, 42, 29, 46, 3, 46], 'bcd');
      p.rect(12, 49, 8, 3, 'e');
      p.rect(13, 50, 6, 1, 'F');
      // A stone guardian holding a sword pointing down, with a glowing core.
      p.shadedPoly([10, 20, 22, 20, 24, 42, 8, 42], 'abcd', { bias: 0.1 });
      p.ball(16, 14, 5.6, 5.8, 'abcd', { bias: 0.4 });
      p.ball(10, 21, 3.4, 2.8, 'bcd');
      p.ball(22, 21, 3.4, 2.8, 'bcd');
      p.limb(16, 30, 16, 47, 1.4, 1, 'bcdW');
      p.limb(12, 29, 20, 29, 1, 1, 'bcd');
      p.ball(16, 25, 2.2, 2.2, 'efF', { bias: 0.8 });
      p.rect(13, 13, 2, 1.4, 'f');
      p.rect(18, 13, 2, 1.4, 'f');
      p.line(9, 30, 11, 41, 'a');
      return p;
    })(),
  ],
  { ox: 16, oy: 54 },
);

export const grave = hd('hub.grave', PAL, [
  (() => {
    const p = new Pix(32, 32);
    p.ellipse(16, 28.5, 12, 2.6, 'M');
    p.shadedPoly([8, 10, 11, 5, 21, 5, 24, 10, 24, 28, 8, 28], 'abcd', { bias: 0.2 });
    p.line(16, 9, 16, 20, 'a');
    p.line(12.5, 13, 19.5, 13, 'a');
    p.ellipse(10, 25, 3, 2.4, 'm', { onlyOver: 'abcd' });
    p.ellipse(21, 27, 2.6, 1.6, 'm', { onlyOver: 'abcd' });
    p.set(25, 28, 'L');
    p.set(6, 28, 'L');
    return p;
  })(),
]);

/** Cage for story captives (drawn over the NPC). Frame 0 = locked, 1 = broken open. */
export const cage = hd(
  'prop.cage',
  PAL,
  [false, true].map((open) => {
    const p = new Pix(32, 48);
    // Roof, floor, bars.
    p.shadedPoly([2, 6, 30, 6, 30, 9.5, 2, 9.5], 'abcd');
    p.line(3, 6, 29, 6, 'd');
    p.ball(16, 4.5, 3, 2, 'bc');
    p.shadedPoly([2, 43, 30, 43, 30, 46, 2, 46], 'wxy');
    for (const x of [3, 9, 23, 29, 14, 18]) {
      if (open && (x === 14 || x === 18)) continue;
      const broken = open && (x === 9 || x === 23);
      p.limb(x, 9.5, x, broken ? 24 : 43, 0.9, 0.9, 'bcd');
      if (broken) p.limb(x + (x < 16 ? -3 : 3), 38, x + (x < 16 ? -5 : 5), 43, 0.9, 0.9, 'bc');
    }
    if (!open) {
      p.ball(16, 26, 3, 2.6, 'gGH');
      p.rect(15, 26, 2, 2, 'K');
    }
    return p;
  }),
  { ox: 16, oy: 44 },
);

export const HUB_SPRITES: SpriteDef[] = [anvil, cauldron, stall, board, statue, grave, cage];
