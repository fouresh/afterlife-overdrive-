import { C } from '../palette';
import { cyc, dcos, dsin, hd, Pix } from './paint';
import { sprite, type SpriteDef } from './types';

/**
 * Items, projectiles, icons and dungeon props — HD (res 2: texels = 2 per world px).
 * Held weapons point RIGHT; pivot = grip. They are rendered rotated toward the aim direction.
 */

const PAL: Record<string, string> = {
  k: C.ink,
  K: C.black,
  W: C.white,
  // steel
  a: C.stone1,
  b: C.stone2,
  c: C.stone3,
  d: C.stone4,
  // wood
  w: C.wood0,
  x: C.wood1,
  y: C.wood2,
  z: C.wood3,
  // gold
  g: C.gold0,
  G: C.gold1,
  h: C.gold2,
  H: C.gold3,
  // red
  r: C.red0,
  R: C.red1,
  s: C.red2,
  S: C.red3,
  // cyan
  e: C.cyan0,
  E: C.cyan1,
  f: C.cyan2,
  F: C.cyan3,
  // violet
  v: C.violet0,
  V: C.violet1,
  u: C.violet2,
  U: C.violet3,
  // blue
  i: C.blue0,
  I: C.blue1,
  j: C.blue2,
  J: C.blue3,
  // green
  l: C.green0,
  L: C.green1,
  m: C.green2,
  n: C.green3,
  // bone
  o: C.bone0,
  O: C.bone1,
  p: C.bone2,
  // armor material slots
  M: '@m0',
  N: '@m1',
  P: '@m2',
  Q: '@m3',
};

const STEEL = 'bcdW';
const WOOD = 'wxyz';
const GOLD = 'GhH';

// ---------------------------------------------------------------------------------------------
// Held weapons

function blade(p: Pix, x0: number, x1: number, y: number, half: number, ramp = STEEL): void {
  // Straight blade along +x with a pointed tip and a bright edge on top.
  p.poly(
    [x0, y - half, x1 - half * 2, y - half, x1, y, x1 - half * 2, y + half, x0, y + half],
    'c',
  );
  p.rect(x0, y - half, x1 - half * 2 - x0, 1, ramp[3]!);
  p.line(x0, y + half - 0.5, x1 - half * 2, y + half - 0.5, ramp[0]!);
  p.line(x0 + 1, y, x1 - half * 2 - 1, y, ramp[2]!);
}

export const wpnSword = hd(
  'wpn.sword',
  PAL,
  [
    (() => {
      const p = new Pix(32, 14);
      p.limb(1, 7, 6, 7, 1.4, 1.4, 'wxy');
      p.ball(1, 7, 1.6, 1.6, GOLD);
      blade(p, 8, 31, 7, 2);
      p.limb(7, 2.5, 7, 11.5, 1.1, 1.1, GOLD);
      return p;
    })(),
  ],
  { ox: 4, oy: 7 },
);

export const wpnSwordKnight = hd(
  'wpn.swordKnight',
  PAL,
  [
    (() => {
      const p = new Pix(36, 14);
      p.limb(1, 7, 6, 7, 1.5, 1.5, 'wxy');
      p.ball(1, 7, 1.8, 1.8, GOLD);
      blade(p, 8, 35, 7, 2.4);
      p.line(10, 7, 29, 7, 'b'); // fuller
      p.limb(7, 1.5, 7, 12.5, 1.3, 1.3, GOLD);
      p.ball(7, 7, 1.6, 1.6, 'sS');
      return p;
    })(),
  ],
  { ox: 4, oy: 7 },
);

export const wpnAxe = hd(
  'wpn.axe',
  PAL,
  [
    (() => {
      const p = new Pix(32, 18);
      p.limb(1, 9, 28, 9, 1.3, 1.3, WOOD);
      // Bearded head: a crescent edge on the striking side.
      p.shadedPoly(
        [20, 6.5, 24, 5, 27, 1, 30.5, 2.5, 31.5, 9, 30.5, 15.5, 27, 17, 24, 13, 20, 11.5],
        'abcd',
      );
      p.ellipse(25.5, 9, 2.2, 3.6, 'a', { onlyOver: 'abcd' });
      p.line(31, 3, 31.5, 9, 'W');
      p.line(31.5, 9, 30.8, 15, 'd');
      p.rect(19, 7, 3, 4, 'x');
      return p;
    })(),
  ],
  { ox: 4, oy: 9 },
);

export const wpnDagger = hd(
  'wpn.dagger',
  PAL,
  [
    (() => {
      const p = new Pix(22, 10);
      p.limb(1, 5, 4, 5, 1.2, 1.2, 'wxy');
      blade(p, 6, 21, 5, 1.6);
      p.limb(5, 2, 5, 8, 0.9, 0.9, GOLD);
      return p;
    })(),
  ],
  { ox: 2, oy: 5 },
);

function bow(limb: string): Pix {
  const p = new Pix(18, 32);
  // Recurve limbs (vertical arc bulging forward), string at the back, leather grip.
  for (let y = 1; y <= 30; y++) {
    const t = (y - 15.5) / 14.5;
    const x = 5 + (1 - t * t) * 8 - (Math.abs(t) > 0.85 ? 1 : 0);
    p.limb(x, y, x, y, 1.3, 1.3, limb);
  }
  p.line(4, 2, 4, 29, 'p');
  p.rect(11, 13, 4, 6, 'x');
  p.rect(11, 13, 4, 1, 'y');
  return p;
}

export const wpnBow = hd('wpn.bow', PAL, [bow('xyz')], { ox: 10, oy: 16 });
export const wpnBowHunter = hd('wpn.bowHunter', PAL, [bow('lLm')], { ox: 10, oy: 16 });

export const wpnCrossbow = hd(
  'wpn.crossbow',
  PAL,
  [
    (() => {
      const p = new Pix(32, 18);
      p.limb(1, 10, 26, 9, 2, 1.6, WOOD);
      p.rect(2, 10, 5, 4, 'x');
      // Steel limbs and the string.
      p.limb(24, 9, 21, 1.5, 1.3, 0.9, STEEL);
      p.limb(24, 9, 21, 16.5, 1.3, 0.9, STEEL);
      p.line(20.5, 2, 13, 9, 'p');
      p.line(20.5, 16, 13, 9, 'p');
      p.line(13, 8, 29, 8, 'd'); // loaded bolt
      return p;
    })(),
  ],
  { ox: 6, oy: 9 },
);

function staff(gem: string, glow: string): Pix {
  const p = new Pix(36, 14);
  p.limb(1, 7.5, 28, 7, 1.3, 1.2, WOOD);
  for (const x of [8, 20]) p.rect(x, 5.5, 1.5, 3, 'G');
  // Claw holding the crystal.
  p.limb(27, 7, 31, 3, 0.9, 0.7, 'xy');
  p.limb(27, 7, 31, 11, 0.9, 0.7, 'xy');
  p.ball(31, 7, 3.8, 3.8, gem, { bias: 0.6 });
  p.set(30, 5.5, 'W');
  p.set(33.5, 9, glow);
  return p;
}

export const wpnStaff = hd('wpn.staff', PAL, [staff('EfFW', 'F')], { ox: 6, oy: 7 });
export const wpnStaffEmber = hd('wpn.staffEmber', PAL, [staff('RsSH', 'H')], { ox: 6, oy: 7 });

// ---------------------------------------------------------------------------------------------
// Projectiles (no ink outline: they glow over everything)

function arrow(head: string, fletch: string, shaft: string): Pix {
  const p = new Pix(20, 6);
  p.line(3, 3, 15, 3, shaft[1]!);
  p.line(3, 2, 14, 2, shaft[0]!, { onlyOver: '.' });
  p.poly([14, 0.5, 19.5, 3, 14, 5.5], head[0]!);
  p.line(15, 2, 18, 3, head[1]!);
  p.poly([0, 0.5, 5, 2.5, 5, 3.5, 0, 5.5, 2, 3], fletch);
  return p;
}

const proj = (id: string, frames: Pix[], ox: number, oy: number, outline = false) =>
  hd(id, PAL, frames, { ox, oy, outline });

export const projArrow = proj('proj.arrow', [arrow('cW', 'p', 'xy')], 16, 3);
export const projArrowRed = proj('proj.arrowRed', [arrow('sS', 'R', 'wx')], 16, 3);
export const projBolt = proj('proj.bolt', [arrow('dW', 'c', 'ab')], 16, 3);

function orb(ramp: string): Pix {
  const p = new Pix(16, 16);
  p.ball(8, 8, 6.5, 6.5, ramp[0]!);
  p.ball(8, 8, 5, 5, ramp.slice(1), { bias: 0.8 });
  p.ball(7, 7, 2.2, 2.2, 'W');
  return p;
}

export const projMagic = proj('proj.magic', [orb('EfFW')], 8, 8);
export const projFireball = proj('proj.fireball', [orb('RsSH')], 8, 8);
export const projOrb = proj('proj.orb', [orb('vuUW')], 8, 8);
export const projSpore = proj('proj.spore', [orb('ghHH')], 8, 8);
export const projWisp = proj(
  'proj.wisp',
  [
    (() => {
      const p = new Pix(8, 8);
      p.ball(4, 4, 3.4, 3.4, 'fFW', { bias: 1 });
      return p;
    })(),
  ],
  4,
  4,
);

export const projBlade = proj(
  'proj.blade',
  [
    (() => {
      // Four-pointed spinning blade (spun by the renderer).
      const p = new Pix(20, 20);
      for (let k = 0; k < 4; k++) {
        const a = cyc(k, 4);
        const [tx, ty] = [10 + dcos(a) * 9, 10 + dsin(a) * 9];
        const [lx, ly] = [10 + dcos(a + 0.7) * 3.5, 10 + dsin(a + 0.7) * 3.5];
        p.poly([10, 10, lx, ly, tx, ty], k % 2 ? 'c' : 'd');
      }
      p.ball(10, 10, 2.6, 2.6, 'abc');
      p.set(10, 10, 'k');
      return p;
    })(),
  ],
  10,
  10,
  true,
);

export const projBone = proj(
  'proj.bone',
  [
    (() => {
      const p = new Pix(20, 20);
      p.limb(5, 15, 15, 5, 1.6, 1.6, 'oOp');
      for (const [x, y] of [
        [4, 14],
        [6, 16],
        [14, 4],
        [16, 6],
      ] as const)
        p.ball(x, y, 2, 2, 'oOp');
      return p;
    })(),
  ],
  10,
  10,
  true,
);

export const projSkullFire = proj(
  'proj.skullFire',
  [
    (() => {
      const p = new Pix(20, 20);
      // Flame trail behind (left), skull in front.
      p.ball(7, 10, 6, 5, 'RsS');
      p.limb(1, 10, 6, 10, 1.5, 4, 'sSH');
      p.ball(12, 10, 5.2, 4.8, 'oOp', { bias: 0.6 });
      p.ellipse(12.5, 9.5, 1.3, 1.5, 'K');
      p.ellipse(15.5, 9.5, 1.2, 1.4, 'K');
      p.set(12.5, 9.5, 'H');
      p.set(15.5, 9.5, 'H');
      p.rect(12, 13, 4, 1, 'o');
      return p;
    })(),
  ],
  10,
  10,
  true,
);

// ---------------------------------------------------------------------------------------------
// Armor icons (material ramp @m0…@m3; recolored per item)

const MAT = 'MNPQ';
const icon = (id: string, paint: (p: Pix) => void): SpriteDef => {
  const p = new Pix(32, 32);
  paint(p);
  return hd(id, PAL, [p]);
};

export const iconCap = icon('icon.cap', (p) => {
  p.ball(16, 18, 11, 9, MAT, { bias: 0.2 });
  p.rect(4, 18, 24, 10, '.', { onlyOver: MAT });
  p.limb(5, 19, 30, 21, 1.6, 1.4, 'MN');
  p.rect(6, 16, 20, 2, 'M', { onlyOver: MAT });
  p.line(10, 12, 15, 10, 'Q');
});

export const iconHood = icon('icon.hood', (p) => {
  p.shadedPoly([16, 3, 26, 10, 28, 24, 24, 29, 8, 29, 4, 24, 6, 10], MAT);
  p.ellipse(17, 19, 6.5, 7, 'K');
  p.line(10, 8, 15, 5, 'Q');
});

export const iconHelm = icon('icon.helm', (p) => {
  p.ball(16, 16, 11, 11, MAT, { bias: -0.2 });
  p.rect(5, 18, 22, 3, 'K');
  p.rect(15, 18, 2, 10, 'M');
  p.rect(5, 16.5, 22, 1.5, 'M', { onlyOver: MAT });
  p.line(9, 9, 14, 6, 'Q');
});

export const iconVest = icon('icon.vest', (p) => {
  p.shadedPoly([7, 6, 13, 4, 16, 9, 19, 4, 25, 6, 26, 28, 6, 28], MAT, { bias: 0.1 });
  p.line(16, 9, 16, 27, 'M');
  for (const y of [12, 17, 22]) p.set(14, y, 'h');
  p.rect(6, 22, 20, 2, 'x', { onlyOver: MAT });
});

export const iconRobe = icon('icon.robe', (p) => {
  p.shadedPoly([10, 3, 22, 3, 25, 12, 28, 30, 4, 30, 7, 12], MAT);
  p.line(16, 4, 16, 29, 'Q');
  p.rect(7, 13, 18, 2, 'h', { onlyOver: MAT });
  p.ellipse(16, 4, 3, 2, 'K');
});

export const iconPlate = icon('icon.plate', (p) => {
  p.shadedPoly([8, 7, 24, 7, 25, 26, 16, 29, 7, 26], 'MNNP');
  p.ball(7, 9, 4.6, 3.6, MAT);
  p.ball(25, 9, 4.6, 3.6, MAT);
  p.line(16, 8, 16, 28, 'M');
  p.line(9, 15, 23, 15, 'N');
  p.ball(12, 12, 2, 1.4, 'PQ');
});

export const iconBoots = icon('icon.boots', (p) => {
  for (const [x, dy] of [
    [6, 2],
    [16, 0],
  ] as const) {
    p.shadedPoly(
      [x, 6 + dy, x + 7, 6 + dy, x + 7, 22 + dy, x + 12, 24 + dy, x + 12, 28 + dy, x, 28 + dy],
      MAT,
    );
    p.rect(x, 8 + dy, 7, 2, 'M', { onlyOver: MAT });
    p.line(x + 1, 7 + dy, x + 1, 21 + dy, 'Q');
  }
});

// ---------------------------------------------------------------------------------------------
// Artifact icons: a rune stone with a painted, glowing symbol.

const rune = (id: string, paint: (p: Pix) => void): SpriteDef =>
  icon(id, (p) => {
    p.shadedPoly([8, 3, 24, 3, 28, 9, 28, 25, 24, 29, 8, 29, 4, 25, 4, 9], 'abcd', { bias: -0.3 });
    p.line(7, 28, 25, 28, 'a');
    p.line(8, 4, 23, 4, 'd');
    paint(p);
  });

export const artIcons = [
  rune('icon.art.fireball', (p) => {
    p.ball(16, 18, 6.5, 6, 'RsSH', { bias: 0.5 });
    p.poly([11, 15, 13, 7, 16, 12, 19, 6, 21, 15], 's');
    p.poly([14, 15, 16, 10, 18, 15], 'S');
    p.ball(15, 19, 2.4, 2.2, 'H');
  }),
  rune('icon.art.frost', (p) => {
    for (let k = 0; k < 3; k++) {
      const a = cyc(k, 6);
      const dx = dcos(a) * 10;
      const dy = dsin(a) * 10;
      p.limb(16 - dx, 16 - dy, 16 + dx, 16 + dy, 1.2, 1.2, 'IjJ');
      for (const s of [-1, 1]) {
        const mx = 16 + dx * 0.6 * s;
        const my = 16 + dy * 0.6 * s;
        p.line(mx, my, mx + dcos(a + 0.9 * s) * 3, my + dsin(a + 0.9 * s) * 3, 'J');
        p.line(mx, my, mx + dcos(a - 0.9 * s) * 3 * -1, my + dsin(a - 0.9 * s) * 3 * -1, 'J');
      }
    }
    p.ball(16, 16, 2, 2, 'JW');
  }),
  rune('icon.art.dash', (p) => {
    for (const x of [8, 15]) {
      p.limb(x, 9, x + 7, 16, 1.6, 1.6, x === 15 ? 'uUW' : 'Vu');
      p.limb(x + 7, 16, x, 23, 1.6, 1.6, x === 15 ? 'uUW' : 'Vu');
    }
  }),
  rune('icon.art.blood', (p) => {
    p.ball(16, 19, 6, 6, 'RsS', { bias: 0.3 });
    p.poly([10.5, 18, 16, 6, 21.5, 18], 's');
    p.ellipse(13.5, 18, 1.4, 2.2, 'S');
  }),
  rune('icon.art.holy', (p) => {
    for (let k = 0; k < 8; k++) {
      const a = cyc(k, 8);
      const r = k % 2 ? 7.5 : 11;
      p.limb(16, 16, 16 + dcos(a) * r, 16 + dsin(a) * r, 1.4, 0.5, 'hH');
    }
    p.ball(16, 16, 4.6, 4.6, 'GhHW', { bias: 0.5 });
  }),
  rune('icon.art.shield', (p) => {
    p.shadedPoly([8, 8, 24, 8, 24, 16, 16, 26, 8, 16], 'oOp', { bias: 0.2 });
    p.line(16, 9, 16, 24, 'o');
    p.line(9, 13, 23, 13, 'o');
  }),
  rune('icon.art.wisp', (p) => {
    p.limb(15, 17, 10, 25, 3, 0.6, 'EfF');
    p.ball(17, 13, 5.5, 5.5, 'fFW', { bias: 1 });
    p.set(22, 22, 'F');
    p.set(9, 9, 'F');
    p.set(24, 8, 'W');
  }),
  rune('icon.art.blades', (p) => {
    p.limb(8, 24, 23, 9, 1.4, 0.6, STEEL);
    p.limb(24, 24, 9, 9, 1.4, 0.6, STEEL);
    p.limb(7, 21, 11, 25, 1, 1, GOLD);
    p.limb(25, 21, 21, 25, 1, 1, GOLD);
  }),
  rune('icon.art.meteor', (p) => {
    p.limb(25, 6, 15, 17, 0.6, 3.6, 'sSH');
    p.ball(13, 19, 5.4, 5.2, 'rRs', { bias: 0.1 });
    p.ball(11.5, 17.5, 1.6, 1.4, 'H');
    p.set(15, 21, 'r');
  }),
];

// ---------------------------------------------------------------------------------------------
// World props

export const chest = hd(
  'prop.chest',
  PAL,
  [false, true].map((open) => {
    const p = new Pix(32, 32);
    // Body.
    p.shadedPoly([4, 15, 28, 15, 28, 29, 4, 29], 'wxyz', { bias: 0.2 });
    for (const x of [4, 26]) p.rect(x, 15, 2, 14, 'G');
    p.rect(4, 22, 24, 1.5, 'G');
    if (open) {
      // Open lid tilted back, gold inside.
      p.shadedPoly([5, 15, 27, 15, 26, 6, 6, 6], 'wxy', { bias: -0.6 });
      p.rect(6, 12, 20, 4, 'h');
      for (const x of [8, 12, 17, 21]) p.ball(x, 13.5, 2, 1.6, GOLD, { bias: 0.6 });
      p.set(14, 12, 'W');
    } else {
      p.shadedPoly([6, 8, 26, 8, 28, 10.5, 28, 15, 4, 15, 4, 10.5], 'wxyz', { bias: 0.5 });
      p.line(6, 8.5, 26, 8.5, 'z');
      p.rect(4, 14, 24, 2, 'G');
      for (const x of [4, 26]) p.rect(x, 9, 2, 6, 'G');
      p.rect(14, 15, 4, 5, 'h');
      p.rect(15, 17, 2, 2, 'K');
    }
    return p;
  }),
);

export const keyItem = hd(
  'prop.key',
  PAL,
  [
    (() => {
      const p = new Pix(24, 24);
      p.ball(7, 10, 5, 5, GOLD, { bias: 0.4 });
      p.ellipse(7, 10, 2, 2, '.');
      p.limb(11, 10, 21, 10, 1.4, 1.4, GOLD);
      p.rect(17, 11, 2, 4, 'G');
      p.rect(20, 11, 2, 3, 'G');
      p.set(5, 7, 'W');
      return p;
    })(),
  ],
  { ox: 12, oy: 16 },
);

export const coin = hd(
  'prop.coin',
  PAL,
  // Spinning: full face, three-quarter, edge, three-quarter.
  [6, 4.2, 1.5, 4.2].map((rx, f) => {
    const p = new Pix(16, 16);
    p.ball(8, 8, rx, 6, rx < 2 ? 'gG' : 'gGhH', { bias: 0.4 });
    if (rx > 3) {
      p.ellipse(8, 8, rx - 2, 4, 'G', { onlyOver: 'hH' });
      p.line(8, 6, 8, 10, 'h');
    }
    if (f === 0) p.set(6, 4, 'W');
    return p;
  }),
  { ox: 8, oy: 12 },
);

export const potion = hd(
  'prop.potion',
  PAL,
  [
    (() => {
      const p = new Pix(24, 28);
      p.rect(10, 3, 4, 5, 'c');
      p.rect(9, 1.5, 6, 2.5, 'y');
      p.ball(12, 17, 8, 8, 'cdW', { bias: 0.5 });
      p.ball(12, 18, 6.8, 6.6, 'RsS', { bias: 0.2 });
      p.rect(4, 11, 16, 4, 'd', { onlyOver: 'RsS' });
      p.ellipse(9, 15, 1.6, 2.6, 'W');
      p.set(14, 21, 'S');
      return p;
    })(),
  ],
  { ox: 12, oy: 24 },
);

export const pedestal = hd('prop.pedestal', PAL, [
  (() => {
    const p = new Pix(32, 32);
    p.shadedPoly([6, 26, 26, 26, 28, 30, 4, 30], 'abc');
    p.shadedPoly([9, 14, 23, 14, 22, 26, 10, 26], 'abcd', { bias: 0.2 });
    p.shadedPoly([5, 11, 27, 11, 26, 15, 6, 15], 'bcdW', { bias: 0.3 });
    p.line(12, 17, 12, 25, 'b');
    p.line(20, 17, 20, 25, 'b');
    p.rect(9, 12, 14, 1, 'R');
    return p;
  })(),
]);

export const portal = hd(
  'prop.portal',
  PAL,
  [
    (() => {
      // Swirl (spun by the renderer): rings of cyan with spiral arms.
      const p = new Pix(48, 48);
      p.ellipse(24, 24, 22, 22, 'e');
      p.ellipse(24, 24, 19, 19, 'E');
      p.ellipse(24, 24, 15, 15, 'v');
      p.ellipse(24, 24, 10, 10, 'V');
      for (let k = 0; k < 3; k++) {
        for (let t = 0; t < 40; t++) {
          const a = cyc(k, 3) + t * 0.11;
          const r = 3 + t * 0.48;
          p.limb(
            24 + dcos(a) * r,
            24 + dsin(a) * r,
            24 + dcos(a) * r,
            24 + dsin(a) * r,
            1.4,
            1.4,
            t > 26 ? 'f' : 'F',
          );
        }
      }
      p.ball(24, 24, 4, 4, 'FW', { bias: 1 });
      return p;
    })(),
  ],
  { ox: 24, oy: 24, outline: false },
);

/** 3×5 pixel digits for damage numbers, drawn with 2-texel strokes (frame 10 = '+'). */
const DIG = [
  ['www', 'w.w', 'w.w', 'w.w', 'www'],
  ['.w.', 'ww.', '.w.', '.w.', 'www'],
  ['www', '..w', 'www', 'w..', 'www'],
  ['www', '..w', 'www', '..w', 'www'],
  ['w.w', 'w.w', 'www', '..w', '..w'],
  ['www', 'w..', 'www', '..w', 'www'],
  ['www', 'w..', 'www', 'w.w', 'www'],
  ['www', '..w', '.w.', '.w.', '.w.'],
  ['www', 'w.w', 'www', 'w.w', 'www'],
  ['www', 'w.w', 'www', '..w', 'www'],
  ['...', '.w.', 'www', '.w.', '...'],
];
export const digits = sprite(
  'fx.digits',
  10,
  14,
  { w: C.white },
  DIG.map((g) => {
    const rows = ['.....', ...g.map((r) => '.' + r + '.'), '.....'];
    const wide = rows.map((r) => [...r].map((ch) => ch + ch).join(''));
    return wide.flatMap((r) => [r, r]).join('\n');
  }),
  { ox: 5, oy: 7, outline: true, res: 2 },
);

export const ITEM_SPRITES: SpriteDef[] = [
  projSpore,
  wpnSword,
  wpnSwordKnight,
  wpnAxe,
  wpnDagger,
  wpnBow,
  wpnBowHunter,
  wpnCrossbow,
  wpnStaff,
  wpnStaffEmber,
  projArrow,
  projArrowRed,
  projBolt,
  projMagic,
  projFireball,
  projOrb,
  projWisp,
  projBlade,
  projBone,
  projSkullFire,
  iconCap,
  iconHood,
  iconHelm,
  iconVest,
  iconRobe,
  iconPlate,
  iconBoots,
  ...artIcons,
  chest,
  keyItem,
  coin,
  potion,
  pedestal,
  portal,
  digits,
];
