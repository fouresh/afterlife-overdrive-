import { Rng } from '@ao/shared';
import { C } from '../palette';
import { sprite, type SpriteDef } from './types';

/**
 * Whispering Forest tileset (16×16). Organic textures are generated from a fixed seed, so they
 * are still plain palette pixel maps (and still replaceable by PNG overrides).
 */
const T = 16;

type Painter = (g: string[][], r: Rng) => void;

/** Build a frame: fill with `base`, let the painter set pixels, return template rows. */
function paint(w: number, h: number, base: string, seed: number, painter: Painter): string {
  const g: string[][] = [];
  for (let y = 0; y < h; y++) g.push(new Array<string>(w).fill(base));
  painter(g, new Rng(seed));
  return g.map((row) => row.join('')).join('\n');
}

/** Set a pixel with wrap-around (seamless tiles). */
function setW(g: string[][], x: number, y: number, c: string): void {
  const h = g.length;
  const w = g[0]!.length;
  g[((y % h) + h) % h]![((x % w) + w) % w] = c;
}

function set(g: string[][], x: number, y: number, c: string): void {
  if (y < 0 || y >= g.length || x < 0 || x >= g[0]!.length) return;
  g[y]![x] = c;
}

const grassPal = {
  '0': C.moss0,
  '1': C.moss1,
  '2': C.green1,
  '3': C.green2,
  d: C.wood0,
  D: C.wood1,
  p: C.stone3,
};

function grass(seed: number, extra: 'none' | 'blades' | 'dirt' | 'pebbles'): string {
  return paint(T, T, '1', seed, (g, r) => {
    for (let k = 0; k < 10; k++) setW(g, r.int(0, 15), r.int(0, 15), '0');
    const blades = extra === 'blades' ? 14 : 7;
    for (let k = 0; k < blades; k++) {
      const x = r.int(0, 15);
      const y = r.int(0, 15);
      const c = r.chance(0.3) ? '3' : '2';
      setW(g, x, y, c);
      setW(g, x, y - 1, c);
      if (r.chance(0.4)) setW(g, x + (r.chance(0.5) ? 1 : -1), y - 2, c);
    }
    if (extra === 'dirt') {
      const cx = r.int(3, 12);
      const cy = r.int(3, 12);
      for (let y = -3; y <= 3; y++)
        for (let x = -4; x <= 4; x++)
          if (x * x * 0.6 + y * y < 7 + r.int(0, 3))
            setW(g, cx + x, cy + y, r.chance(0.2) ? 'D' : 'd');
    }
    if (extra === 'pebbles') for (let k = 0; k < 3; k++) setW(g, r.int(0, 15), r.int(0, 15), 'p');
  });
}

export const forestFloor = sprite('forest.floor', T, T, grassPal, [
  grass(11, 'none'),
  grass(12, 'blades'),
  grass(13, 'dirt'),
  grass(14, 'pebbles'),
]);

/** Tree canopy seen from above (wall tops): leaf clusters with a light top-left. */
const canopyPal = { k: '#0f2016', '0': C.green0, '1': C.green1, '2': C.green2, '3': C.green3 };
function canopy(seed: number): string {
  return paint(T, T, '0', seed, (g, r) => {
    for (let k = 0; k < 7; k++) {
      const cx = r.int(0, 15);
      const cy = r.int(0, 15);
      const rad = r.int(2, 4);
      for (let y = -rad; y <= rad; y++)
        for (let x = -rad; x <= rad; x++) {
          const d = x * x + y * y;
          if (d > rad * rad) continue;
          const light = x + y < -rad * 0.6;
          setW(g, cx + x, cy + y, d > (rad - 1) * (rad - 1) && x + y > 0 ? 'k' : light ? '2' : '1');
        }
      if (r.chance(0.5)) setW(g, cx - 1, cy - rad + 1, '3');
    }
  });
}
export const forestWallTop = sprite('forest.wallTop', T, T, canopyPal, [canopy(21), canopy(22)]);

/** Wall face = tree trunks between the canopy and the ground. */
const trunkPal = {
  k: C.ink,
  '0': C.wood0,
  '1': C.wood1,
  '2': C.wood2,
  g: C.green0,
  G: C.green1,
  m: C.moss1,
};
function trunks(seed: number, xs: number[]): string {
  return paint(T, T, 'k', seed, (g, r) => {
    for (let x = 0; x < T; x++) {
      set(g, x, 0, 'g');
      set(g, x, 1, r.chance(0.6) ? 'g' : 'G');
      if (r.chance(0.4)) set(g, x, 2, 'g');
    }
    for (const tx of xs) {
      const w = 5;
      for (let y = 2; y < T; y++) {
        for (let x = 0; x < w; x++) {
          const c = x === 0 ? '2' : x === w - 1 ? '0' : r.chance(0.15) ? '0' : '1';
          set(g, tx + x, y, c);
        }
      }
      // Roots and moss at the foot.
      set(g, tx - 1, 15, '0');
      set(g, tx + w, 15, '0');
      set(g, tx - 1, 14, '1');
      for (let k = 0; k < 3; k++) set(g, tx + r.int(0, w - 1), r.int(11, 15), 'm');
    }
  });
}
export const forestWallFace = sprite('forest.wallFace', T, T, trunkPal, [
  trunks(31, [1, 9]),
  trunks(32, [5]),
]);

/** Closed passage: thorny brambles (combat glades lock with these). */
export const forestBrambles = sprite(
  'forest.door',
  T,
  T,
  { '0': C.wood0, '1': C.wood1, t: C.bone1, l: C.green1, L: C.green2, r: C.red2 },
  [
    paint(T, T, '.', 41, (g, r) => {
      for (let v = 0; v < 4; v++) {
        let y = r.int(0, 15);
        const dir = r.chance(0.5) ? 1 : -1;
        for (let x = 0; x < T; x++) {
          set(g, x, y, '0');
          set(g, x, y + 1, '1');
          if (r.chance(0.18)) set(g, x, y - 1, 't');
          if (r.chance(0.12)) set(g, x, y + 2, 'l');
          if (r.chance(0.05)) set(g, x, y - 1, 'r');
          if (r.chance(0.35)) y = Math.max(0, Math.min(14, y + dir));
        }
      }
      for (let k = 0; k < 6; k++) set(g, r.int(0, 15), r.int(0, 15), 'L');
    }),
  ],
);

/** A tree standing inside a glade (replaces crypt pillars). */
export const forestTree = sprite(
  'forest.tree',
  T,
  32,
  { ...canopyPal, w: C.wood1, W: C.wood2, d: C.wood0 },
  [
    paint(T, 32, '.', 51, (g, r) => {
      for (let y = 15; y < 30; y++) {
        set(g, 6, y, 'W');
        set(g, 7, y, 'w');
        set(g, 8, y, 'w');
        set(g, 9, y, 'd');
      }
      set(g, 5, 29, 'd');
      set(g, 10, 29, 'd');
      for (let y = 0; y < 18; y++)
        for (let x = 0; x < T; x++) {
          const dx = x - 7.5;
          const dy = y - 8;
          const d = dx * dx + dy * dy * 1.1;
          if (d > 60) continue;
          const c = d > 44 && dx + dy > 0 ? 'k' : dx + dy < -5 ? '2' : r.chance(0.12) ? '0' : '1';
          set(g, x, y, c);
        }
      for (let k = 0; k < 4; k++) set(g, r.int(3, 8), r.int(2, 7), '3');
    }),
  ],
  { ox: 8, oy: 30 },
);

/** Way down (the forest "stairs"): a burrow under roots. */
export const forestBurrow = sprite(
  'forest.burrow',
  T,
  T,
  { k: C.black, '0': C.wood0, '1': C.wood1, '2': C.wood2, d: C.moss0 },
  [
    paint(T, T, '.', 61, (g, r) => {
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const dx = (x - 7.5) / 7;
          const dy = (y - 8) / 5.5;
          const d = dx * dx + dy * dy;
          if (d < 0.55) set(g, x, y, 'k');
          else if (d < 0.85) set(g, x, y, y < 8 ? '0' : 'd');
          else if (d < 1 && r.chance(0.6)) set(g, x, y, '1');
        }
      for (let k = 0; k < 3; k++) {
        const x = r.int(3, 12);
        set(g, x, 4, '2');
        set(g, x, 5, '1');
        set(g, x + 1, 6, '1');
      }
    }),
  ],
);

/** Thorn trap: 0 = hidden, 1 = sharp thorns up. */
export const forestThorns = sprite(
  'forest.thorns',
  T,
  T,
  { '0': C.moss0, '1': C.wood0, t: C.bone1, T: C.bone2 },
  [
    paint(T, T, '.', 71, (g, r) => {
      for (let k = 0; k < 9; k++) set(g, r.int(1, 14), r.int(2, 14), r.chance(0.5) ? '0' : '1');
    }),
    paint(T, T, '.', 71, (g, r) => {
      for (let k = 0; k < 9; k++) {
        const x = r.int(1, 14);
        const y = r.int(3, 14);
        set(g, x, y, '1');
        set(g, x, y - 1, 't');
        set(g, x, y - 2, 'T');
      }
    }),
  ],
  { ox: 8, oy: 8 },
);

/** Glowing mushrooms: the forest's torches. */
export const forestGlow = sprite(
  'forest.glow',
  T,
  T,
  { c: C.cyan2, C: C.cyan3, d: C.cyan1, s: C.bone1, S: C.bone2 },
  [
    `
    ................
    ................
    ................
    ......dccd......
    .....dcCCcd.....
    .....ccccccd....
    ......dssd......
    .......ss...dcd.
    .......ss..dcCcd
    .......ss...dsd.
    ......sssS...s..
    .............s..
    ................
    ................
    ................
    ................
    `,
    `
    ................
    ................
    ................
    ......dccd......
    .....dcccCd.....
    .....cccccd.....
    ......dssd......
    .......ss...dcd.
    .......ss..dccCd
    .......ss...dsd.
    ......sssS...s..
    .............s..
    ................
    ................
    ................
    ................
    `,
  ],
  { ox: 8, oy: 8 },
);

const decoPal = {
  r: C.red2,
  R: C.red3,
  y: C.gold2,
  v: C.violet3,
  V: C.violet2,
  w: C.white,
  g: C.green1,
  G: C.green2,
  s: C.stone2,
  S: C.stone3,
  k: C.stone1,
  b: C.wood1,
  B: C.wood2,
  m: C.bone2,
  o: C.gold1,
};

function flowers(seed: number, petal: string, center: string): string {
  return paint(T, T, '.', seed, (g, r) => {
    for (let k = 0; k < 3; k++) {
      const x = r.int(2, 13);
      const y = r.int(3, 12);
      set(g, x, y + 1, 'g');
      set(g, x, y + 2, 'g');
      set(g, x - 1, y, petal);
      set(g, x + 1, y, petal);
      set(g, x, y - 1, petal);
      set(g, x, y + 1 - 1, center);
    }
  });
}
export const decoFlowers = sprite('forest.flowers', T, T, decoPal, [
  flowers(81, 'r', 'y'),
  flowers(82, 'y', 'o'),
  flowers(83, 'v', 'w'),
  flowers(84, 'w', 'y'),
]);

export const decoMushroom = sprite('forest.mushroom', T, T, decoPal, [
  `
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  .......rRr......
  ......rRwRr.....
  ......rrrrr.....
  ........m.......
  ........m...rr..
  .......mm..rRwr.
  ...........m....
  ................
  `,
  `
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  .....bBBb.......
  ....bBBBBb......
  .......m........
  .......m........
  ......mm........
  ................
  ................
  ................
  `,
]);

export const decoTuft = sprite('forest.tuft', T, T, decoPal, [
  paint(T, T, '.', 91, (g, r) => {
    const cx = r.int(4, 11);
    const cy = r.int(8, 13);
    for (let k = -2; k <= 2; k++) {
      const h = 3 - Math.abs(k) + r.int(0, 1);
      for (let y = 0; y < h; y++) set(g, cx + k, cy - y, y === h - 1 ? 'G' : 'g');
    }
  }),
  paint(T, T, '.', 92, (g, r) => {
    for (let n = 0; n < 2; n++) {
      const cx = r.int(3, 12);
      const cy = r.int(6, 13);
      for (let k = -1; k <= 1; k++) {
        const h = 2 - Math.abs(k) + 1;
        for (let y = 0; y < h; y++) set(g, cx + k, cy - y, y === h - 1 ? 'G' : 'g');
      }
    }
  }),
]);

export const decoStone = sprite('forest.stone', T, T, decoPal, [
  `
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ......SSSS......
  .....SSssss.....
  .....Sssssk.....
  ......kkkk......
  ................
  ................
  ................
  ................
  `,
  `
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ................
  ..........SS....
  ...SS....Sssk...
  ..Sssk....kk....
  ...kk...........
  ................
  ................
  ................
  `,
]);

export const FOREST_TILES: SpriteDef[] = [
  forestFloor,
  forestWallTop,
  forestWallFace,
  forestBrambles,
  forestTree,
  forestBurrow,
  forestThorns,
  forestGlow,
  decoFlowers,
  decoMushroom,
  decoTuft,
  decoStone,
];
