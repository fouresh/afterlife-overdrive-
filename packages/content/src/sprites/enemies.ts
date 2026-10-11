import { C } from '../palette';
import { cyc, dcos, dsin, hd, joint, Pix } from './paint';
import type { SpriteDef } from './types';

/**
 * Crypt enemies, HD (res 2). Each has a 4-frame movement cycle (frame order = time order);
 * WorldView plays it faster while the enemy moves. Facing right; the view flips for left.
 */

const FRAMES = [0, 1, 2, 3];

/** Shared palette keys: bones, metal, cloth, glows. */
const PAL = {
  // bone ramp
  d: C.bone0,
  b: C.bone1,
  B: C.bone2,
  W: C.white,
  // ink / sockets
  k: C.ink,
  K: C.black,
  // red glow
  r: C.red2,
  R: C.red3,
  // iron ramp
  m: C.stone1,
  n: C.stone2,
  o: C.stone3,
  O: C.stone4,
  // wood / leather
  w: C.wood1,
  x: C.wood2,
  y: C.wood3,
  // green hood ramp
  g: C.green0,
  h: C.green1,
  j: C.green2,
  // violet ramp
  v: C.violet0,
  V: C.violet1,
  u: C.violet2,
  U: C.violet3,
  // cyan ramp
  c: C.cyan0,
  e: C.cyan1,
  f: C.cyan2,
  F: C.cyan3,
  // gold
  G: C.gold1,
  H: C.gold2,
  // slime greens
  s: C.green1,
  S: C.green2,
  t: C.green3,
  // rust
  q: C.gold0,
};

const BONE = 'dbBW';
const IRON = 'mnoO';

/** Walk cycle helper: ankle position of a leg with phase `a`. */
function foot(hip: number, ground: number, stride: number, lift: number, a: number) {
  return [hip + stride * dcos(a), ground - Math.max(0, -dsin(a)) * lift] as const;
}

function boneLeg(
  p: Pix,
  hx: number,
  hy: number,
  ax: number,
  ay: number,
  len: number,
  ramp: string,
  r = 1.1,
) {
  const [kx, ky] = joint(hx, hy, ax, ay, len, len, -1);
  p.limb(hx, hy, kx, ky, r + 0.2, r, ramp);
  p.limb(kx, ky, ax, ay, r, r, ramp);
  p.ball(kx, ky, r + 0.5, r + 0.5, ramp);
  p.limb(ax - 0.5, ay + 0.5, ax + 2.5, ay + 0.5, r, r * 0.8, ramp);
}

function boneArm(p: Pix, sx: number, sy: number, hx: number, hy: number, ramp: string) {
  const [ex, ey] = joint(sx, sy, hx, hy, 3.6, 3.6, 1);
  p.limb(sx, sy, ex, ey, 1.1, 1, ramp);
  p.limb(ex, ey, hx, hy, 1, 0.9, ramp);
  p.ball(hx, hy, 1.4, 1.4, ramp);
}

function skull(p: Pix, cx: number, cy: number, glow = 'r') {
  p.ball(cx, cy, 5.2, 4.7, BONE, { bias: 0.6 });
  // Jaw.
  p.ball(cx + 1.2, cy + 4, 3.6, 1.8, 'dbB');
  for (let x = cx - 1; x <= cx + 3; x += 1.5) p.set(x, cy + 3.6, 'k');
  // Sockets with a glowing pupil.
  p.ellipse(cx + 1, cy + 0.2, 1.4, 1.6, 'K');
  p.ellipse(cx + 4.2, cy + 0.2, 1.1, 1.5, 'K');
  p.set(cx + 1, cy + 0.2, glow);
  p.set(cx + 4.2, cy + 0.2, glow);
  p.set(cx + 5.6, cy + 2, 'd'); // nose
}

function ribcage(p: Pix, cx: number, cy: number) {
  p.ball(cx, cy, 4.6, 3.8, BONE, { bias: 0.3 });
  for (const dy of [-1.5, 0.5, 2.5]) p.line(cx - 3.5, cy + dy, cx + 3.5, cy + dy, 'd');
  p.line(cx, cy - 3.5, cx, cy + 3.5, 'b');
}

// ---------------------------------------------------------------------------------------------

function skeletonFrame(f: number, archer: boolean): Pix {
  const p = new Pix(32, 32);
  const a = cyc(f, 4);
  const bob = -Math.round(Math.abs(dsin(a)));
  const hipY = 21 + bob;
  const swing = 2.6 * dcos(a);
  // Back arm, legs, body, front arm.
  boneArm(p, 13, 13 + bob, 12 + swing, 19.5 + bob, 'dbB');
  const [bx, by] = foot(14.5, 29, 3.4, 2.4, a + Math.PI);
  const [fx, fy] = foot(17.5, 29, 3.4, 2.4, a);
  boneLeg(p, 14.5, hipY, bx, by, 4.4, 'dbB');
  boneLeg(p, 17.5, hipY, fx, fy, 4.4, BONE);
  p.limb(16, hipY, 16.5, 13 + bob, 1, 1, 'bB'); // spine
  p.ball(16, hipY, 3.2, 1.6, BONE); // pelvis
  ribcage(p, 16.5, 15 + bob);
  if (archer) {
    // Tattered green hood and cloak.
    p.shadedPoly([11, 11 + bob, 22, 11 + bob, 21, 21 + bob, 12, 22 + bob], 'ghj');
    p.ball(17.5, 7.5 + bob, 6.4, 5.8, 'ghj', { bias: 0.2 });
    skull(p, 18, 8.5 + bob, 'R');
    p.ellipse(15, 6 + bob, 4.5, 3.4, 'h', { onlyOver: BONE });
    // Bow held in front.
    const hx = 23.5;
    const hy = 17 + bob;
    for (let k = -7; k <= 7; k++) {
      const t = k / 7;
      p.set(hx + 2.2 - 2.2 * t * t, hy + k, k % 3 === 0 ? 'x' : 'y');
    }
    p.line(hx - 0.2, hy - 7, hx - 0.2, hy + 7, 'W');
    boneArm(p, 20, 13 + bob, hx + 1, hy, BONE);
  } else {
    skull(p, 18, 8 + bob);
    // Rusty sword in the front hand.
    const hx = 21 + swing * 0.4;
    const hy = 19 + bob;
    p.limb(hx, hy, hx + 6, hy - 8, 1.2, 0.9, 'qoO');
    p.line(hx - 1.5, hy + 0.5, hx + 1.5, hy - 1.5, 'w');
    boneArm(p, 20, 13 + bob, hx, hy, BONE);
  }
  return p;
}

export const skeleton = hd(
  'en.skeleton',
  PAL,
  FRAMES.map((f) => skeletonFrame(f, false)),
);
export const skeletonArcher = hd(
  'en.skeletonArcher',
  PAL,
  FRAMES.map((f) => skeletonFrame(f, true)),
);

// ---------------------------------------------------------------------------------------------

export const slime = hd(
  'en.slime',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(32, 32);
    // Squash and stretch while wobbling along.
    const s = [1, 1.14, 1, 0.88][f]!;
    const rx = 10.5 * s;
    const ry = 7.6 / s;
    const cy = 30.5 - ry;
    p.ball(16, cy, rx, ry, 'gsSt', { bias: 0.3 });
    // Flat bottom + darker base.
    p.rect(16 - rx + 1, 29, rx * 2 - 2, 2, 'g', { onlyOver: 'gsSt' });
    // Inner bubbles and gloss.
    p.ellipse(11 + s, cy - ry * 0.45, 2.4, 1.4, 'W');
    p.set(14.5, cy - ry * 0.6, 'W');
    p.set(19 - f * 0.5, cy + 2, 't');
    p.set(12 + f, cy + 3.5, 't');
    // Eyes.
    for (const ex of [17.5, 21.5]) {
      p.ellipse(ex, cy - 0.5, 1.4, 1.9, 'K');
      p.set(ex - 0.5, cy - 1.3, 'W');
    }
    return p;
  }),
);

// ---------------------------------------------------------------------------------------------

export const bat = hd(
  'en.bat',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(32, 32);
    const tip = [-9, -2, 6, -2][f]!;
    const mid = [-5, -1, 3, -1][f]!;
    const cy = 16 + [0, 1, 2, 1][f]!;
    for (const side of [-1, 1]) {
      const x0 = 16 + side * 3;
      const pts = [
        x0,
        cy - 2,
        16 + side * 9,
        cy + mid - 2,
        16 + side * 15,
        cy + tip,
        16 + side * 13,
        cy + tip + 4,
        16 + side * 10,
        cy + mid + 3,
        16 + side * 7,
        cy + mid + 5,
        x0,
        cy + 3,
      ];
      p.shadedPoly(pts, side < 0 ? 'vVV' : 'vVu');
      // Finger bones.
      p.line(x0, cy - 1, 16 + side * 15, cy + tip, 'v');
      p.line(16 + side * 9, cy + mid - 2, 16 + side * 10, cy + mid + 3, 'v');
    }
    p.ball(16, cy, 4.4, 4.2, 'vVuU');
    // Ears and face.
    p.poly([13, cy - 3, 13.5, cy - 7, 15.5, cy - 4], 'V');
    p.poly([16.5, cy - 4, 18.5, cy - 7, 19, cy - 3], 'V');
    p.set(14.5, cy - 0.5, 'R');
    p.set(17.5, cy - 0.5, 'R');
    p.set(15.5, cy + 2, 'W');
    p.set(16.5, cy + 2, 'W');
    return p;
  }),
  { oy: 26 },
);

// ---------------------------------------------------------------------------------------------

export const cultist = hd(
  'en.cultist',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(32, 32);
    const a = cyc(f, 4);
    const sway = dsin(a) * 1.2;
    const bob = -Math.round(Math.abs(dsin(a)) * 0.8);
    // Robe with a swaying hem.
    p.shadedPoly(
      [11, 12 + bob, 21, 12 + bob, 24 + sway, 30, 20, 29, 16, 30.5, 12, 29, 8 + sway, 30],
      'vVVu',
      { bias: -0.2 },
    );
    p.line(16, 14 + bob, 16 + sway * 0.6, 29.5, 'v');
    p.rect(11.5, 20 + bob, 9.5, 1.4, 'G', { onlyOver: 'vVu' });
    // Hood with a dark face and two eyes.
    p.ball(16.5, 9 + bob, 6.4, 6.2, 'vVuU', { bias: -0.2 });
    p.ellipse(18.5, 10 + bob, 3.8, 3.6, 'K');
    p.set(18, 10 + bob, 'F');
    p.set(21, 10 + bob, 'F');
    // Hands holding a pulsing orb.
    const glow = f % 2 === 0 ? 'fF' : 'efF';
    p.ball(23, 19 + bob, 2.4 + (f % 2) * 0.4, 2.4 + (f % 2) * 0.4, glow);
    p.ball(21, 20.5 + bob, 1.4, 1.2, 'db');
    p.ball(25, 20.5 + bob, 1.4, 1.2, 'db');
    return p;
  }),
);

// ---------------------------------------------------------------------------------------------

export const ghost = hd(
  'en.ghost',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(32, 32);
    const a = cyc(f, 4);
    const top = 6 + Math.round(dsin(a));
    p.ball(16, top + 8, 8.6, 8.2, 'efFW', { bias: 0.5 });
    p.rect(7.4, top + 8, 17.2, 9, 'f');
    p.ball(10, top + 12, 2.6, 5, 'ef');
    // Wavy, drifting tail.
    for (let x = 7; x < 25; x++) {
      const wave = dsin((x / 17) * Math.PI * 3 + a) * 1.6;
      const len = top + 17 + wave + (x > 20 ? -1 : 0);
      for (let y = top + 15; y < len; y++) p.set(x, y, x < 11 ? 'e' : 'f');
    }
    p.rect(7.4, top + 8, 2, 9, 'e');
    // Face.
    p.ellipse(17, top + 7, 1.6, 2.2, 'c');
    p.ellipse(21.5, top + 7, 1.4, 2.1, 'c');
    p.ellipse(19.5, top + 11.5, 1.3, 1.5 + (f % 2) * 0.4, 'c');
    p.set(10.5, top + 3.5, 'W');
    p.set(11.5, top + 2.5, 'W');
    return p;
  }),
  { oy: 28 },
);

// ---------------------------------------------------------------------------------------------

export const boneKnight = hd(
  'en.boneKnight',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(48, 48);
    const a = cyc(f, 4);
    const bob = -Math.round(Math.abs(dsin(a)) * 1.4);
    const hipY = 31 + bob;
    // Round shield on the back arm.
    p.ball(13, 25 + bob, 7, 7.6, 'wxy', { bias: -0.2 });
    p.ball(13, 25 + bob, 2.4, 2.4, IRON);
    // Armored legs.
    const [bx, by] = foot(20, 45, 4, 3, a + Math.PI);
    const [fx, fy] = foot(26, 45, 4, 3, a);
    for (const [hx, ax, ay, r] of [
      [20, bx, by, 'mno'],
      [26, fx, fy, IRON],
    ] as const) {
      const [kx, ky] = joint(hx, hipY, ax, ay, 7.2, 7.2, -1);
      p.limb(hx, hipY, kx, ky, 2.6, 2.3, r);
      p.limb(kx, ky, ax, ay - 1, 2.3, 2.2, r);
      p.ball(kx, ky, 2.6, 2.4, 'noO');
      p.ball(ax + 1.5, ay, 3.6, 2, r);
    }
    // Tasset + breastplate.
    p.shadedPoly([16, hipY - 3, 31, hipY - 3, 32, hipY + 2, 15, hipY + 2], 'mno');
    p.shadedPoly([14.5, 16 + bob, 32.5, 16 + bob, 31, hipY - 2, 16, hipY - 2], IRON, {
      bias: -0.3,
    });
    p.line(23.5, 18 + bob, 23.5, hipY - 3, 'm');
    for (const dy of [3, 6, 9]) p.line(17, 16 + bob + dy, 21, 16 + bob + dy, 'd');
    // Pauldrons.
    p.ball(16, 17 + bob, 4.4, 3.4, IRON);
    p.ball(31, 17 + bob, 4.4, 3.4, IRON);
    // Horned helm over the skull.
    p.ball(25, 10 + bob, 7, 6.6, IRON, { bias: -0.2 });
    p.rect(24, 9 + bob, 9, 2.4, 'K');
    p.set(27, 10 + bob, 'R');
    p.set(30, 10 + bob, 'R');
    p.limb(19.5, 7 + bob, 15, 1.5 + bob, 1.8, 0.6, 'dbB');
    p.limb(30.5, 6.5 + bob, 34.5, 1.5 + bob, 1.8, 0.6, 'dbB');
    p.rect(26, 13 + bob, 6, 2, 'b');
    // Greatsword in the front hand.
    const hx = 35 + dcos(a) * 1.2;
    const hy = 28 + bob;
    p.limb(hx, hy, hx + 8, hy - 18, 1.8, 1.2, 'noOW');
    p.line(hx, hy, hx + 8, hy - 18, 'W', { onlyOver: 'oO' });
    p.limb(hx - 3, hy + 1.5, hx + 3, hy - 1.5, 1, 1, 'GH');
    p.ball(hx - 0.6, hy + 1.6, 1.4, 1.4, 'GH');
    boneArm(p, 32, 19 + bob, hx, hy, BONE);
    return p;
  }),
);

// ---------------------------------------------------------------------------------------------

export const cryptWarden = hd(
  'en.cryptWarden',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(64, 64);
    const a = cyc(f, 4);
    const hover = Math.round(dsin(a) * 1.5);
    const sway = dcos(a) * 2;
    const top = 22 + hover;
    // Ragged robe.
    const pts = [22, top, 42, top, 50, 40];
    for (let k = 10; k >= 0; k--) {
      // Hem from right to left, ragged and trailing the sway.
      pts.push(10 + k * 4.4 + sway * (1 - k / 10), 60 - (k % 2) * 4 + (k === 5 ? 2 : 0));
    }
    pts.push(14, 40);
    p.shadedPoly(pts, 'vVVu', { bias: -0.2 });
    p.line(32, top + 2, 32 + sway * 0.5, 58, 'v');
    // Bone collar and chest gem.
    for (let k = 0; k < 7; k++) p.ball(23.5 + k * 2.8, top + 2 + (k % 2), 1.6, 1.4, 'dbB');
    p.ball(32, top + 9, 3, 3.4, 'cefF');
    p.set(31, top + 7.5, 'W');
    // Raised skeletal hands with sleeves.
    for (const side of [-1, 1]) {
      const sx = 32 + side * 11;
      const hx = 32 + side * 18;
      const hy = top + 4 - (f % 2) * 2;
      p.limb(sx, top + 4, hx - side * 2, hy + 6, 3.6, 4.6, 'vVu');
      boneArm(p, hx - side * 2, hy + 4, hx, hy - 2, BONE);
      for (const d of [-1.6, 0, 1.6]) p.limb(hx, hy - 2, hx + d * 0.8, hy - 5, 0.6, 0.5, 'bB');
    }
    // Skull with a crown and cyan eyes.
    const cx = 32;
    const cy = 13 + hover;
    p.ball(cx, cy, 8, 7.4, BONE, { bias: 0.5 });
    p.ball(cx + 1, cy + 6, 5.4, 2.6, 'dbB');
    for (let x = cx - 3; x <= cx + 5; x += 2) p.set(x, cy + 5.5, 'k');
    p.ellipse(cx - 2.4, cy + 0.5, 2.2, 2.4, 'K');
    p.ellipse(cx + 3.6, cy + 0.5, 2.2, 2.4, 'K');
    p.set(cx - 2.4, cy + 0.5, 'F');
    p.set(cx + 3.6, cy + 0.5, 'F');
    p.set(cx - 2, cy, 'F');
    p.set(cx + 4, cy, 'F');
    p.rect(cx - 7, cy - 7, 15, 3, 'G');
    for (let k = 0; k < 5; k++) {
      const x = cx - 6 + k * 3.2;
      p.poly([x, cy - 6.5, x + 1.4, cy - 11 - (k === 2 ? 2 : 0), x + 2.8, cy - 6.5], 'H');
    }
    p.set(cx + 0.4, cy - 5.6, 'f');
    p.set(cx - 5, cy - 5.6, 'r');
    p.set(cx + 6, cy - 5.6, 'r');
    return p;
  }),
);

// ---------------------------------------------------------------------------------------------

export const wispAlly = hd(
  'ally.wisp',
  PAL,
  FRAMES.map((f) => {
    const p = new Pix(20, 20);
    const a = cyc(f, 4);
    p.limb(10, 10, 10 - dsin(a) * 1.5, 18, 3.4, 0.6, 'efF');
    p.ball(10, 9, 5 + (f % 2) * 0.4, 5, 'efFW', { bias: 1 });
    p.ellipse(9, 8, 2, 2, 'W');
    return p;
  }),
  { ox: 10, oy: 10 },
);

export const ENEMY_SPRITES: SpriteDef[] = [
  skeleton,
  skeletonArcher,
  slime,
  bat,
  cultist,
  ghost,
  boneKnight,
  cryptWarden,
  wispAlly,
];
