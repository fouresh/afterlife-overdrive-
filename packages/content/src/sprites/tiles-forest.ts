import { Rng } from '@ao/shared';
import { C } from '../palette';
import { hash01, hd, Pix } from './paint';
import type { SpriteDef } from './types';

/**
 * Whispering Forest tileset, HD (res 2: a 16 px tile is 32×32 texels). Organic textures come
 * from fixed seeds; tiles that repeat (grass, canopy) wrap around their edges seamlessly.
 */

const T = 32;
const PAL: Record<string, string> = {
  k: '#0f2016',
  K: C.black,
  W: C.white,
  // grass / leaves
  '0': C.moss0,
  '1': C.moss1,
  '2': C.green0,
  '3': C.green1,
  '4': C.green2,
  '5': C.green3,
  // wood / dirt
  d: C.wood0,
  D: C.wood1,
  e: C.wood2,
  E: C.wood3,
  // stone
  p: C.stone1,
  P: C.stone2,
  q: C.stone3,
  Q: C.stone4,
  // flowers / mushrooms
  r: C.red1,
  R: C.red2,
  s: C.red3,
  g: C.gold1,
  G: C.gold2,
  H: C.gold3,
  v: C.violet1,
  V: C.violet2,
  u: C.violet3,
  b: C.bone1,
  B: C.bone2,
  c: C.cyan1,
  f: C.cyan2,
  F: C.cyan3,
};

const tile = (id: string, frames: Pix[], opts: { ox?: number; oy?: number } = {}): SpriteDef =>
  hd(id, PAL, frames, { ...opts, outline: false });

/** Paint on a 3×3 canvas, then fold it into one tile (shapes cross the edges seamlessly). */
function wrapped(base: string, paint: (p: Pix, r: Rng) => void, seed: number): Pix {
  const big = new Pix(T * 3, T * 3);
  paint(big, new Rng(seed));
  const p = new Pix(T, T, base);
  for (let y = 0; y < T * 3; y++)
    for (let x = 0; x < T * 3; x++) {
      const c = big.g[y * T * 3 + x]!;
      if (c !== '.') p.set(x % T, y % T, c);
    }
  return p;
}

function grass(seed: number, extra: 'none' | 'blades' | 'dirt' | 'pebbles'): Pix {
  return wrapped(
    '1',
    (p, r) => {
      // Patches of darker and lighter ground.
      for (let k = 0; k < 4; k++)
        p.ball(T + r.int(0, T), T + r.int(0, T), r.range(3, 6), r.range(2, 4), '01', {
          dither: true,
          bias: 0.6,
        });
      for (let k = 0; k < 40; k++) p.set(T + r.int(0, T), T + r.int(0, T), '0');
      if (extra === 'dirt') {
        const cx = T + r.int(8, 24);
        const cy = T + r.int(8, 24);
        p.ellipse(cx, cy, 8, 5.5, 'd');
        p.ellipse(cx - 1, cy - 1, 6, 3.6, 'D');
        for (let k = 0; k < 6; k++) p.set(cx + r.int(-6, 6), cy + r.int(-3, 3), 'e');
      }
      if (extra === 'pebbles') {
        for (let k = 0; k < 4; k++) {
          const x = T + r.int(0, T);
          const y = T + r.int(0, T);
          p.ball(x, y, 1.6, 1.2, 'pPq');
        }
      }
      // Blades: short strokes leaning a little, lighter tips.
      const n = extra === 'blades' ? 46 : 26;
      for (let k = 0; k < n; k++) {
        const x = T + r.int(0, T);
        const y = T + r.int(0, T);
        const lean = r.int(-1, 1);
        const tall = r.chance(0.3) ? 4 : 3;
        p.line(x, y, x + lean, y - tall, r.chance(0.35) ? '4' : '3');
        p.set(x + lean, y - tall, r.chance(0.3) ? '5' : '4');
      }
    },
    seed,
  );
}

export const forestFloor = tile('forest.floor', [
  grass(1, 'none'),
  grass(2, 'blades'),
  grass(3, 'dirt'),
  grass(4, 'pebbles'),
]);

function canopy(seed: number): Pix {
  return wrapped(
    'k',
    (p, r) => {
      // Overlapping leaf clusters, each shaded like a ball.
      for (let k = 0; k < 16; k++) {
        const x = T + r.int(0, T);
        const y = T + r.int(0, T);
        const rad = r.range(5, 8);
        p.ball(x, y, rad, rad * 0.85, '2234', { dither: true });
      }
      for (let k = 0; k < 10; k++) p.set(T + r.int(0, T), T + r.int(0, T), '5');
    },
    seed,
  );
}

export const forestWallTop = tile('forest.wallTop', [canopy(21), canopy(22)]);

/** Wall face: tree trunks in the dark under the canopy, roots at the foot. */
function trunks(seed: number, xs: number[]): Pix {
  const p = new Pix(T, T, 'k');
  const r = new Rng(seed);
  for (const x of xs) {
    p.limb(x, -2, x, 34, 4.2, 4.6, 'dDeE', { bias: -0.6 });
    for (let k = 0; k < 4; k++) {
      const y = r.int(2, 28);
      p.line(x - 2, y, x - 1, y + 3, 'd');
    }
    // Roots spreading at the bottom.
    p.limb(x, 26, x - 6, 31, 1.6, 0.8, 'dD');
    p.limb(x, 27, x + 6, 31, 1.6, 0.8, 'dD');
  }
  // Canopy shadow at the top, moss at the bottom.
  for (let x = 0; x < T; x++) {
    p.set(x, 0, 'k');
    if (hash01(x, 1, seed) < 0.6) p.set(x, 1, 'k');
    if (hash01(x, 2, seed) < 0.5) p.set(x, 31, '2');
  }
  return p;
}

export const forestWallFace = tile('forest.wallFace', [trunks(31, [7, 23]), trunks(32, [14, 29])]);

/** Bramble gate (combat doors): thorny tangled vines with gaps. */
export const forestBrambles = tile('forest.door', [
  (() => {
    const p = new Pix(T, T);
    const r = new Rng(41);
    for (let k = 0; k < 7; k++) {
      const y0 = r.int(0, 31);
      const y1 = r.int(0, 31);
      p.limb(0, y0, 31, y1, 1.3, 1.3, 'd3');
      p.line(0, y0, 31, y1, '3');
    }
    for (let k = 0; k < 18; k++) {
      const x = r.int(1, 30);
      const y = r.int(1, 30);
      if (p.get(x, y) === '.') continue;
      p.set(x, y - 1, 'B');
      p.set(x + 1, y + 1, 'b');
    }
    return p;
  })(),
]);

/** Locked forest gate: woven branches with a gold lock (was the crypt door before). */
export const forestDoorLocked = tile('forest.doorLocked', [
  (() => {
    const p = new Pix(T, T, 'd');
    for (let y = 0; y < T; y += 6) {
      p.limb(-2, y + 2, 34, y + 3, 2.4, 2.4, 'dDe');
    }
    for (const x of [6, 26]) p.limb(x, 0, x, 31, 2.2, 2.2, 'dDeE');
    for (let k = 0; k < 10; k++) p.set(hash01(k, 0, 5) * T, hash01(k, 1, 5) * T, '3');
    p.rect(11, 11, 10, 11, 'g');
    p.rect(12, 12, 8, 9, 'G');
    p.rect(12, 12, 8, 1, 'H');
    p.ball(16, 15.5, 1.5, 1.5, 'K');
    p.rect(15.5, 16, 1, 3, 'K');
    return p;
  })(),
]);

/** A tree standing on a solid tile (the forest's pillar). */
export const forestTree = tile(
  'forest.tree',
  [
    (() => {
      const p = new Pix(T, 64);
      p.ellipse(16, 60, 10, 2.6, 'k');
      p.limb(16, 60, 16, 30, 4.2, 3.4, 'dDeE', { bias: -0.4 });
      p.limb(16, 56, 9, 61, 1.8, 1, 'dD');
      p.limb(16, 56, 23, 61, 1.8, 1, 'dD');
      p.line(14, 40, 15, 52, 'd');
      for (const [x, y, rad] of [
        [10, 22, 8],
        [22, 22, 8],
        [16, 13, 9.5],
        [16, 27, 8],
        [8, 15, 5],
        [24, 14, 5],
      ] as const)
        p.ball(x, y, rad, rad * 0.9, '2345', { dither: true, bias: 0.2 });
      return p;
    })(),
  ],
  { ox: 16, oy: 60 },
);

/** The way down in the forest: a burrow under roots. */
export const forestBurrow = tile('forest.burrow', [
  (() => {
    const p = new Pix(T, T);
    p.ellipse(16, 18, 13, 10, 'D');
    p.ellipse(16, 18, 11, 8, 'd');
    p.ellipse(16, 19, 9, 6.4, 'K');
    p.limb(4, 9, 20, 7, 1.4, 1, 'dDe');
    p.limb(14, 8, 26, 12, 1.2, 0.8, 'dDe');
    p.limb(6, 26, 11, 28, 1, 0.6, 'e');
    for (const [x, y] of [
      [4, 16],
      [27, 21],
      [22, 28],
    ] as const)
      p.ball(x, y, 1.6, 1.2, 'pPq');
    return p;
  })(),
]);

/** Thorn trap: sprouts (safe) and extended thorns. */
export const forestThorns = tile(
  'forest.thorns',
  [false, true].map((out) => {
    const p = new Pix(T, T);
    for (let y = 8; y < 28; y += 8)
      for (let x = 8; x < 28; x += 8) {
        p.ellipse(x, y + 1.5, 2.6, 1.3, 'k');
        if (out) {
          p.poly([x - 2, y + 1.5, x - 0.5, y - 6, x + 2, y + 1.5], '3');
          p.line(x - 0.5, y - 5, x, y, '4');
          p.set(x - 0.5, y - 6, 'B');
        } else {
          p.set(x, y, '3');
          p.set(x - 1, y - 1, '4');
        }
      }
    return p;
  }),
  { ox: 16, oy: 16 },
);

/** Glowing mushrooms (the forest's torches), two pulse frames. */
export const forestGlow = tile(
  'forest.glow',
  [0, 1].map((f) => {
    const p = new Pix(T, T);
    for (const [x, y, s] of [
      [12, 20, 1],
      [20, 17, 1.25],
      [17, 24, 0.8],
    ] as const) {
      p.limb(x, y, x, y + 6 * s, 1, 1, 'bB');
      p.ball(x, y, 4 * s + f * 0.4, 2.6 * s, f ? 'cfFF' : 'cfF', { bias: 0.6 });
      p.set(x - s, y - 1, 'W');
    }
    return p;
  }),
  { ox: 16, oy: 16 },
);

function flowers(seed: number, petal: string, center: string): Pix {
  const p = new Pix(T, T);
  const r = new Rng(seed);
  for (let k = 0; k < 3; k++) {
    const x = r.int(7, 25);
    const y = r.int(10, 24);
    p.line(x, y + 1, x + r.int(-1, 1), y + 6, '3');
    p.set(x + 1, y + 4, '4');
    for (const [dx, dy] of [
      [-1.5, 0],
      [1.5, 0],
      [0, -1.5],
      [0, 1.5],
    ] as const)
      p.ball(x + dx, y + dy, 1.4, 1.4, petal);
    p.set(x, y, center);
  }
  return p;
}

export const decoFlowers = tile('forest.flowers', [
  flowers(51, 'rR', 'G'),
  flowers(52, 'gG', 's'),
  flowers(53, 'vV', 'H'),
  flowers(54, 'bB', 'G'),
]);

export const decoMushroom = tile(
  'forest.mushroom',
  ['rRs', 'vVu'].map((cap, i) => {
    const p = new Pix(T, T);
    p.ellipse(16, 26, 6, 1.4, 'k');
    p.limb(16, 26, 16, 19, 2, 1.6, 'bB');
    p.ball(16, 17, 6.4, 4, cap, { bias: 0.3 });
    p.rect(9, 18, 14, 3, '.', { onlyOver: cap });
    p.ellipse(16, 18, 6, 1.2, cap[0]!, { onlyOver: '.' });
    p.set(14, 15, 'B');
    p.set(18, 16, 'B');
    if (i) p.set(16, 14, 'B');
    return p;
  }),
);

export const decoTuft = tile(
  'forest.tuft',
  [61, 62].map((seed) => {
    const p = new Pix(T, T);
    const r = new Rng(seed);
    const cx = r.int(12, 20);
    for (let k = 0; k < 7; k++) {
      const x = cx + r.int(-5, 5);
      const h = r.int(5, 9);
      p.line(x, 26, x + r.int(-2, 2), 26 - h, k % 2 ? '3' : '4');
    }
    p.ellipse(cx, 26, 5, 1.2, '2');
    return p;
  }),
);

export const decoStone = tile(
  'forest.stone',
  [71, 72].map((seed, i) => {
    const p = new Pix(T, T);
    const r = new Rng(seed);
    p.ellipse(16, 25, 8, 2, 'k');
    p.ball(15, 21, 6.5, 5, 'pPqQ', { bias: 0.2 });
    if (i) p.ball(24, 24, 3, 2.4, 'pPq');
    p.ellipse(13, 18, 3, 1.4, '3', { onlyOver: 'pPqQ' });
    p.set(13 + r.int(0, 3), 22, 'p');
    return p;
  }),
);

export const FOREST_TILES: SpriteDef[] = [
  forestFloor,
  forestWallTop,
  forestWallFace,
  forestBrambles,
  forestDoorLocked,
  forestTree,
  forestBurrow,
  forestThorns,
  forestGlow,
  decoFlowers,
  decoMushroom,
  decoTuft,
  decoStone,
];
