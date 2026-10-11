import { C } from '../palette';
import { hash01, hd, Pix } from './paint';
import type { SpriteDef } from './types';

/**
 * Crypt tileset, HD (res 2: a 16 px tile is 32×32 texels). Keys 0-4 = the stone ramp so the
 * whole set reads as one material; tiles are drawn so their edges meet seamlessly.
 */

const T = 32;
const PAL: Record<string, string> = {
  '0': C.stone0,
  '1': C.stone1,
  '2': C.stone2,
  '3': C.stone3,
  '4': C.stone4,
  k: C.ink,
  K: C.black,
  n: C.night,
  W: C.white,
  m: C.moss1,
  M: C.moss0,
  b: C.bone0,
  B: C.bone1,
  p: C.bone2,
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
};

const tile = (id: string, frames: Pix[], opts: { ox?: number; oy?: number } = {}): SpriteDef =>
  hd(id, PAL, frames, { ...opts, outline: false });

/**
 * One flagstone: worn fill with soft mottling (clumps, not per-texel grain), a broken lit edge
 * on top. Low contrast on purpose: the floor is a backdrop, sprites on top must read first.
 */
function slab(p: Pix, x: number, y: number, w: number, h: number, seed: number): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      // Coarse 4×4 clumps blended with fine grain → mottled stone.
      const coarse = hash01(Math.floor(xx / 4), Math.floor(yy / 4), seed + 3);
      const n = hash01(xx, yy, seed) * 0.35 + coarse * 0.65;
      p.set(xx, yy, n > 0.8 ? '2' : n < 0.12 ? '0' : '1');
    }
  }
  // Worn bevel: the lit top edge is chipped, the bottom edge sinks a little.
  for (let xx = x; xx < x + w; xx++) {
    if (hash01(xx, y, seed + 5) < 0.7) p.set(xx, y, '2');
    if (hash01(xx, y + h, seed + 6) < 0.35) p.set(xx, y + h - 1, '0');
  }
}

/** Grout grid + slabs. `cuts` = slab rectangles inside the tile (grout drawn between). */
function floor(seed: number, cuts: [number, number, number, number][]): Pix {
  const p = new Pix(T, T, '0');
  for (const [x, y, w, h] of cuts) slab(p, x + 1, y + 1, w - 1, h - 1, seed);
  // Grout corners sink deeper.
  for (const [x, y] of cuts) p.set(x, y, 'k');
  return p;
}

function crack(p: Pix, x: number, y: number, steps: [number, number][]): void {
  let cx = x;
  let cy = y;
  for (const [dx, dy] of steps) {
    p.line(cx, cy, cx + dx, cy + dy, 'k');
    cx += dx;
    cy += dy;
  }
}

export const cryptFloor = tile('crypt.floor', [
  // Big flagstones (one per tile) are the most common: calm floor, readable sprites on top.
  floor(1, [[0, 0, 32, 32]]),
  floor(2, [
    [0, 0, 32, 14],
    [0, 14, 32, 18],
  ]),
  floor(3, [
    [0, 0, 18, 32],
    [18, 0, 14, 16],
    [18, 16, 14, 16],
  ]),
  (() => {
    const p = floor(4, [[0, 0, 32, 32]]);
    // A hairline crack and moss in the grout.
    crack(p, 6, 5, [
      [4, 3],
      [3, 1],
      [2, 4],
    ]);
    for (let k = 0; k < 24; k++) {
      const x = Math.floor(hash01(k, 1, 9) * T);
      p.set(x, hash01(k, 2, 9) < 0.5 ? 0 : 1, hash01(k, 3, 9) < 0.5 ? 'm' : 'M', {
        onlyOver: '0k2',
      });
    }
    p.ellipse(25, 26, 3, 2, 'm', { onlyOver: '12' });
    return p;
  })(),
]);

export const cryptWallTop = tile('crypt.wallTop', [
  (() => {
    const p = new Pix(T, T, 'k');
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const n = hash01(x, y, 31);
        if (n < 0.06) p.set(x, y, 'n');
        else if (n > 0.97) p.set(x, y, 'K');
      }
    return p;
  })(),
]);

/** Brick wall face: 4 courses of 8 texels, every other course offset by half a brick. */
function wallFace(seed: number, moss: boolean): Pix {
  const p = new Pix(T, T, '0');
  for (let row = 0; row < 4; row++) {
    const y = row * 8;
    const off = row % 2 ? 8 : 0;
    for (let bx = -16; bx < T; bx += 16) {
      const x = bx + off;
      for (let yy = y + 1; yy < y + 8; yy++) {
        for (let xx = Math.max(0, x + 1); xx < Math.min(T, x + 16); xx++) {
          const n = hash01(xx, yy, seed);
          const base = (Math.floor(x / 16) + row) % 3 === 0 ? '2' : '1';
          p.set(xx, yy, n < 0.07 ? '3' : n > 0.93 ? '0' : base);
        }
      }
      // Lit top edge and shadowed bottom edge of each brick.
      for (let xx = Math.max(0, x + 1); xx < Math.min(T, x + 16); xx++) {
        p.set(xx, y + 1, '3');
        p.set(xx, y + 7, '0');
      }
    }
  }
  // The foot of the wall sits in shadow.
  for (let x = 0; x < T; x++) {
    p.set(x, 30, 'k');
    p.set(x, 31, 'K');
    if (hash01(x, 0, seed) < 0.5) p.set(x, 29, '0');
  }
  if (moss) {
    for (const [x, len] of [
      [5, 9],
      [6, 13],
      [7, 6],
      [20, 7],
      [21, 11],
      [22, 4],
      [27, 6],
    ] as const) {
      for (let y = 0; y < len; y++) p.set(x, y, y > len - 3 ? 'M' : 'm');
    }
  }
  return p;
}

export const cryptWallFace = tile('crypt.wallFace', [wallFace(11, false), wallFace(12, true)]);

export const torch = tile(
  'crypt.torch',
  [0, 1, 2, 3].map((f) => {
    const p = new Pix(T, T);
    // Iron bracket and the wooden handle.
    p.rect(13, 24, 6, 2, '2');
    p.rect(13, 24, 6, 1, '3');
    p.limb(16, 26, 16, 16, 1.6, 1.3, 'wxy');
    p.rect(13.5, 16, 5, 2, '2');
    // Flame: flickers between four shapes.
    const h = [11, 13, 10, 12][f]!;
    const lean = [0, 1, -1, 0.5][f]!;
    p.limb(16, 15, 16 + lean, 15 - h, 3.6, 0.6, 'r');
    p.limb(16, 15, 16 + lean * 0.8, 15 - h + 1.5, 2.8, 0.5, 'R');
    p.limb(16, 14.5, 16 + lean * 0.6, 15 - h + 4, 2, 0.5, 's');
    p.limb(16, 14, 16 + lean * 0.4, 15 - h + 6.5, 1.2, 0.4, 'H');
    if (f % 2) p.set(16 + lean * 2, 15 - h - 2, 's');
    return p;
  }),
  { ox: 16, oy: 16 },
);

export const doorBars = tile('crypt.door', [
  (() => {
    // Portcullis: bars with gaps (the doorway floor shows through).
    const p = new Pix(T, T);
    for (const x of [2, 8, 14, 20, 26]) p.limb(x + 1.5, 0, x + 1.5, 31, 1.4, 1.4, '234');
    for (const y of [4, 18]) {
      p.rect(0, y, T, 3, '2');
      p.rect(0, y, T, 1, '3');
    }
    for (const x of [3.5, 9.5, 15.5, 21.5, 27.5]) p.set(x, 31, '0');
    return p;
  })(),
]);

function lockedDoor(planks: string, band: string): Pix {
  const p = new Pix(T, T);
  for (let x = 0; x < T; x += 8) {
    p.rect(x, 0, 8, T, planks[1]!);
    p.rect(x, 0, 1, T, planks[0]!);
    p.rect(x + 1, 0, 1, T, planks[2]!);
    for (let y = 3; y < T; y += 9) p.set(x + 4, y + (x % 3), planks[0]!);
  }
  for (const y of [5, 24]) {
    p.rect(0, y, T, 3, band[1]!);
    p.rect(0, y, T, 1, band[2]!);
    for (const x of [3, 13, 19, 29]) p.set(x, y + 1, band[0]!);
  }
  // Gold lock plate with a keyhole.
  p.rect(11, 11, 10, 11, 'g');
  p.rect(12, 12, 8, 9, 'G');
  p.rect(12, 12, 8, 1, 'H');
  p.ball(16, 15.5, 1.5, 1.5, 'K');
  p.rect(15.5, 16, 1, 3, 'K');
  return p;
}

export const doorLocked = tile('crypt.doorLocked', [lockedDoor('wxy', '023')]);

export const stairsDown = tile('crypt.stairs', [
  (() => {
    // Steps going down into darkness (top-down): lighter treads near the top.
    const p = new Pix(T, T, 'K');
    const treads = ['3', '2', '1', '0', 'k'];
    for (let s = 0; s < 5; s++) {
      const y = 2 + s * 6;
      p.rect(3 + s, y, T - 6 - s * 2, 4, treads[s]!);
      p.rect(3 + s, y, T - 6 - s * 2, 1, s < 2 ? '4' : '2');
    }
    // Side walls.
    p.rect(0, 0, 3, T, '1');
    p.rect(T - 3, 0, 3, T, '1');
    p.rect(0, 0, T, 2, '2');
    p.rect(0, 0, T, 1, '3');
    return p;
  })(),
]);

export const spikes = tile('crypt.spikes', [
  (() => {
    const p = new Pix(T, T);
    p.rect(3, 3, 26, 26, '1');
    p.rect(3, 3, 26, 1, '2');
    p.rect(3, 28, 26, 1, '0');
    for (let y = 8; y < 28; y += 8) for (let x = 8; x < 28; x += 8) p.ellipse(x, y, 1.6, 1.4, 'K');
    return p;
  })(),
  (() => {
    const p = new Pix(T, T);
    p.rect(3, 3, 26, 26, '1');
    p.rect(3, 3, 26, 1, '2');
    for (let y = 8; y < 28; y += 8) {
      for (let x = 8; x < 28; x += 8) {
        p.ellipse(x, y + 1.5, 2.4, 1.2, 'k');
        p.poly([x - 2, y + 1.5, x, y - 6, x + 2, y + 1.5], '3');
        p.line(x, y - 5, x, y, '4');
        p.set(x, y - 6, 'W');
      }
    }
    return p;
  })(),
]);

export const decoBones = tile('crypt.bones', [
  (() => {
    const p = new Pix(T, T);
    p.limb(6, 22, 20, 14, 1.2, 1.2, 'bBp');
    for (const [x, y] of [
      [5, 22],
      [7, 24],
      [20, 13],
      [21, 15.5],
    ] as const)
      p.ball(x, y, 1.6, 1.6, 'bBp');
    p.limb(19, 24, 25, 25, 0.9, 0.9, 'bB');
    p.set(12, 26, 'B');
    p.set(26, 20, 'b');
    return p;
  })(),
]);

export const decoSkull = tile('crypt.skull', [
  (() => {
    const p = new Pix(T, T);
    p.ellipse(16, 24.5, 6, 1.6, 'k');
    p.ball(16, 18, 5.4, 5, 'bBp', { bias: 0.5 });
    p.rect(13, 22, 7, 2.5, 'B');
    p.ellipse(14, 18, 1.5, 1.7, 'K');
    p.ellipse(18.4, 18, 1.5, 1.7, 'K');
    for (const x of [14, 16, 18]) p.set(x, 23.5, 'k');
    return p;
  })(),
]);

export const decoCobweb = tile('crypt.cobweb', [
  (() => {
    // Corner web (top-left), thin and faint.
    const p = new Pix(T, T);
    for (const [x, y] of [
      [22, 0],
      [16, 12],
      [0, 22],
      [9, 18],
      [20, 6],
    ] as const)
      p.line(0, 0, x, y, '3');
    for (const r of [6, 11, 17]) {
      p.line(r, 0, r * 0.75, r * 0.55, '3');
      p.line(r * 0.75, r * 0.55, r * 0.45, r * 0.85, '3');
      p.line(r * 0.45, r * 0.85, 0, r, '3');
    }
    return p;
  })(),
]);

export const decoCrack = tile('crypt.rubble', [
  (() => {
    const p = new Pix(T, T);
    p.ball(10, 20, 3.4, 2.6, '0123', { bias: 0.3 });
    p.ball(15.5, 22, 2.4, 1.8, '0123', { bias: 0.3 });
    p.ball(22, 18, 1.6, 1.3, '123');
    p.set(19, 24, '2');
    p.set(7, 25, '1');
    crack(p, 18, 8, [
      [3, 3],
      [-1, 3],
      [3, 2],
    ]);
    return p;
  })(),
]);

export const pillar = tile(
  'crypt.pillar',
  [
    (() => {
      const p = new Pix(T, 64);
      // Base, cylindrical shaft, capital.
      p.shadedPoly([5, 52, 27, 52, 28, 60, 4, 60], '0123');
      p.rect(4, 59, 24, 2, 'k');
      p.limb(16, 12, 16, 52, 8.4, 8.4, '01234', { bias: -0.3 });
      for (let y = 16; y < 52; y += 9) p.line(9, y, 23, y, '1', { onlyOver: '234' });
      p.shadedPoly([4, 6, 28, 6, 26, 13, 6, 13], '01234', { bias: 0.2 });
      p.rect(4, 6, 24, 1, '4');
      p.line(11, 20, 13, 27, 'k');
      p.line(13, 27, 12, 33, 'k');
      p.ellipse(8, 52, 3, 2, 'm', { onlyOver: '0123' });
      p.ellipse(24, 54, 2, 1.4, 'M', { onlyOver: '0123' });
      return p;
    })(),
  ],
  { ox: 16, oy: 60 },
);

export const CRYPT_TILES: SpriteDef[] = [
  cryptFloor,
  cryptWallTop,
  cryptWallFace,
  torch,
  doorBars,
  doorLocked,
  stairsDown,
  spikes,
  decoBones,
  decoSkull,
  decoCobweb,
  decoCrack,
  pillar,
];
