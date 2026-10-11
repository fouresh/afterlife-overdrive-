import { C } from '../palette';
import { cyc, dcos, dsin, hd, joint, Pix } from './paint';
import type { SpriteDef } from './types';

/** Whispering Forest creatures, HD (res 2), side view facing right; 4-frame movement cycles. */

const FRAMES = [0, 1, 2, 3];

const PAL = {
  k: C.ink,
  K: C.black,
  W: C.white,
  // fur ramp (wolf: grey; overridden per creature)
  a: C.stone1,
  b: C.stone2,
  c: C.stone3,
  d: C.stone4,
  // belly / teeth
  t: C.bone1,
  T: C.bone2,
  // eyes
  e: C.red2,
  E: C.gold2,
  // mushroom cap
  r: C.red1,
  R: C.red2,
  s: C.red3,
  // stem
  m: C.bone0,
  n: C.bone1,
  o: C.bone2,
  // boar
  w: C.wood0,
  x: C.wood1,
  y: C.wood2,
  z: C.wood3,
  // greens
  g: C.green1,
  G: C.green2,
  // cyan glow
  f: C.cyan2,
  F: C.cyan3,
};

/**
 * Wolf drawn at scale `s` (1 = 32×32 frame). Gallop: the front and hind leg pairs swing in
 * opposite phase, the body rocks, the tail trails.
 */
function wolfFrame(f: number, s: number, eye: string): Pix {
  const p = new Pix(32 * s, 32 * s);
  const a = cyc(f, 4);
  const rock = dsin(a) * 1.2;
  const S = (v: number) => v * s;
  const by = 18 + rock * 0.6;
  const ground = 30;
  // Tail.
  p.limb(S(7), S(by - 2), S(2), S(by - 6 + dcos(a) * 2), S(2.2), S(1.2), 'abc');
  // Far legs (darker), then body, then near legs.
  const legs = (hipX: number, ph: number, ramp: string, front: boolean) => {
    const ax = hipX + 3.4 * dcos(ph);
    const ay = ground - Math.max(0, -dsin(ph)) * 2.6;
    const [kx, ky] = joint(hipX, by + 2, ax, ay, 4.6, 4.6, front ? 1 : -1);
    p.limb(S(hipX), S(by + 2), S(kx), S(ky), S(1.9), S(1.4), ramp);
    p.limb(S(kx), S(ky), S(ax), S(ay), S(1.3), S(1.1), ramp);
    p.limb(S(ax), S(ay), S(ax + 1.6), S(ay + 0.4), S(1.1), S(1), ramp);
  };
  legs(10, a + 0.6, 'ab', false);
  legs(21, a + Math.PI + 0.6, 'ab', true);
  p.ball(S(15), S(by), S(9.4), S(5), 'abcd', { bias: 0.2 });
  p.ellipse(S(16), S(by + 3), S(6), S(1.6), 't', { onlyOver: 'abc' });
  // Ruff and head.
  p.ball(S(22), S(by - 2.5), S(4.6), S(4.8), 'abcd', { bias: 0.4 });
  const hx = 25.5;
  const hy = by - 5 - rock * 0.4;
  p.ball(S(hx), S(hy), S(4.2), S(3.8), 'abcd', { bias: 0.4 });
  p.limb(S(hx + 1), S(hy + 1), S(hx + 5.6), S(hy + 2.2), S(2.2), S(1.4), 'bcd');
  p.set(S(hx + 6.2), S(hy + 1.6), 'K');
  if (s > 1) p.set(S(hx + 6.2) + 1, S(hy + 1.6), 'K');
  p.line(S(hx + 2), S(hy + 3.2), S(hx + 5), S(hy + 3.4), 'T');
  // Ears.
  p.poly([S(hx - 2.5), S(hy - 2), S(hx - 1.5), S(hy - 6.5), S(hx), S(hy - 2.5)], 'b');
  p.poly([S(hx - 0.5), S(hy - 2.5), S(hx + 1.2), S(hy - 6.8), S(hx + 2), S(hy - 2.2)], 'c');
  // Eye.
  p.rect(S(hx + 1.2), S(hy - 0.6), Math.max(2, S(1.4)), Math.max(1, S(1)), eye);
  legs(12, a, 'bcd', false);
  legs(23, a + Math.PI, 'bcd', true);
  return p;
}

export const wolf = hd(
  'en.wolf',
  PAL,
  FRAMES.map((f) => wolfFrame(f, 1, 'e')),
);

/** The pack leader: a giant dark wolf with glowing cyan eyes. */
export const alphaWolf = hd(
  'en.alphaWolf',
  { ...PAL, a: C.black, b: C.night, c: C.dusk, d: C.stone2, t: C.stone3 },
  FRAMES.map((f) => wolfFrame(f, 2, 'F')),
);

export const sporeling = hd(
  'en.sporeling',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(32, 32);
    // Hop: squash on landing, stretch in the air.
    const lift = [0, 2, 3, 1][f]!;
    const sq = [1.1, 0.95, 0.92, 1][f]!;
    const base = 30 - lift;
    // Feet.
    p.ball(13, base - 0.5, 2.4, 1.4, 'mn');
    p.ball(19.5, base - 0.5, 2.4, 1.4, 'mn');
    // Stem body with a face.
    p.ball(16, base - 6, 5.6 * sq, 6 / sq, 'mno', { bias: 0.5 });
    for (const ex of [17, 20]) {
      p.rect(ex, base - 8, 1.6, 2.4, 'k');
      p.set(ex, base - 8, 'W');
    }
    p.line(17.5, base - 4.5, 19.5, base - 4.5, 'm');
    // Cap with spots and a spore puff.
    const cy = base - 13;
    p.ball(16, cy, 11 * sq, 6.6 / sq, 'rRRs', { bias: 0.2 });
    p.rect(5.5, cy + 3.5, 21, 2.6, '.', { onlyOver: 'rRs' });
    p.ellipse(16, cy + 3.4, 10.4 * sq, 1.6, 'r', { onlyOver: '.' });
    for (const [x, y, r] of [
      [10, cy - 1, 1.8],
      [16, cy - 3.5, 1.6],
      [21.5, cy - 0.5, 2],
      [13.5, cy + 1.5, 1],
    ] as const) {
      p.ellipse(x, y, r, r * 0.8, 'o');
    }
    if (f === 2) {
      p.set(7, cy - 4, 'G');
      p.set(25, cy - 5, 'G');
    }
    return p;
  }),
);

export const boar = hd(
  'en.boar',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(48, 48);
    const a = cyc(f, 4);
    const bob = Math.round(dsin(a * 2) * 0.8);
    const by = 28 + bob;
    const ground = 45;
    const leg = (hx: number, ph: number, ramp: string) => {
      const ax = hx + 3.2 * dcos(ph);
      const ay = ground - Math.max(0, -dsin(ph)) * 2.6;
      p.limb(hx, by + 4, ax, ay - 1, 2.6, 2, ramp);
      p.ball(ax + 0.6, ay, 2.4, 1.4, 'wk');
    };
    leg(12, a + Math.PI, 'wx');
    leg(29, a, 'wx');
    // Body with a bristly mane along the back.
    p.ball(21, by, 15, 9.4, 'wxyz', { bias: 0.1 });
    for (let k = 0; k < 9; k++) {
      const x = 11 + k * 3;
      p.limb(x, by - 7.5, x - 2, by - 11.5 - (k % 2), 1.6, 0.5, 'wx');
    }
    p.ellipse(22, by + 5, 10, 2.6, 'x', { onlyOver: 'yz' });
    // Tail curl.
    p.line(6, by - 2, 4, by - 4, 'x');
    p.line(4, by - 4, 5, by - 6, 'x');
    // Head, snout and tusks.
    const hx = 36;
    const hy = by + 1;
    p.ball(hx, hy, 7, 6.6, 'wxyz', { bias: 0.3 });
    p.limb(hx + 3, hy + 1.5, hx + 9.5, hy + 2.5, 3.6, 3, 'xyz');
    p.ellipse(hx + 10.3, hy + 2.5, 1.4, 2.4, 'w');
    p.set(hx + 10.5, hy + 1.5, 'K');
    p.set(hx + 10.5, hy + 3.5, 'K');
    p.limb(hx + 6, hy + 4.5, hx + 8.5, hy - 0.5, 1.1, 0.5, 'tT');
    p.poly([hx - 4, hy - 4, hx - 2.5, hy - 9.5, hx, hy - 5], 'x');
    p.rect(hx + 2.4, hy - 2, 2, 2, 'e');
    p.set(hx + 3.4, hy - 2, 'E');
    leg(16, a, 'xyz');
    leg(32, a + Math.PI, 'xyz');
    return p;
  }),
);

export const FOREST_ENEMY_SPRITES: SpriteDef[] = [wolf, alphaWolf, sporeling, boar];
