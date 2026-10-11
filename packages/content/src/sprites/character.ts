import { C, shade, tint } from '../palette';
import { cyc, dcos, dsin, joint, Pix } from './paint';
import { blitSprite, createImage, outline, type RgbaImage } from './raster';
import { sprite, type SlotColors, type SpriteDef } from './types';

/**
 * HD paper-doll character (res 2: 32×50 texels = 16×25 world px), facing right (left = flip).
 * Every layer is painted for every animation frame with the same pose (legs, arms, body bob),
 * so composing is just blitting layer frame `f` over each other and adding the ink outline.
 *
 * Layer order: back arm → legs → torso → chest armor → head → eyes → hair → helmet →
 * front arm → armor shoulder.
 */

/** Composed frame size and feet pivot, in texels (ART_RES = 2 texels per world pixel). */
export const CHAR_W = 32;
export const CHAR_H = 50;
export const CHAR_OX = 16;
export const CHAR_OY = 46;
/** Kept for compatibility: every layer has the full frame height. */
export const LAYER_H = CHAR_H;

export const CHAR_ANIMS = {
  idle: [0, 1, 2, 3],
  run: [4, 5, 6, 7, 8, 9, 10, 11],
} as const;

/** Playback speed (frames per second) of each animation at normal running speed. */
export const CHAR_ANIM_FPS = { idle: 5, run: 16 } as const;

/** Total composed frames: idle×4, run×8. */
export const CHAR_FRAME_COUNT = 12;

// ---------------------------------------------------------------------------------------------
// Pose per frame

interface Pose {
  /** Vertical offset of the upper body (texels, negative = up). */
  bob: number;
  /** Ankle positions of the back and front leg. */
  back: [number, number];
  front: [number, number];
  /** Hand positions of the back and front arm. */
  backHand: [number, number];
  frontHand: [number, number];
  /** Leaning forward while running (shifts the head by a texel). */
  lean: number;
}

const HIP_Y = 35;
const HIP_BACK = 13;
const HIP_FRONT = 19;
const GROUND = 44; // ankle height when the foot is planted
const SHOULDER_Y = 26;
const SHOULDER_BACK = 10.5;
const SHOULDER_FRONT = 21.5;

function poseOf(f: number): Pose {
  if (f < 4) {
    // Idle: slow breathing — the body sinks a texel, the arms swing a little.
    const b = [0, 0, 1, 1][f]!;
    const sway = [0, 0.4, 0.8, 0.4][f]!;
    return {
      bob: b,
      back: [HIP_BACK - 0.5, GROUND],
      front: [HIP_FRONT + 0.5, GROUND],
      backHand: [SHOULDER_BACK - 0.5 - sway, SHOULDER_Y + 8 + b],
      frontHand: [SHOULDER_FRONT + 0.5 + sway, SHOULDER_Y + 8 + b],
      lean: 0,
    };
  }
  // Run: 8 frames; the front leg is forward at frame 4, the back leg at frame 8.
  const a = cyc(f - 4, 8);
  const stride = 4.6;
  const lift = 3.4;
  const leg = (hip: number, ph: number): [number, number] => [
    hip + stride * dcos(ph),
    GROUND - Math.max(0, -dsin(ph)) * lift,
  ];
  const swing = 4.2 * dcos(a);
  const bob = -Math.round(1.6 * Math.abs(dsin(a)));
  return {
    bob,
    back: leg(HIP_BACK + 1, a + Math.PI),
    front: leg(HIP_FRONT - 1, a),
    backHand: [SHOULDER_BACK + 0.5 + swing, SHOULDER_Y + 7.5 + bob + Math.abs(swing) * -0.25],
    frontHand: [SHOULDER_FRONT - 0.5 - swing, SHOULDER_Y + 7.5 + bob + Math.abs(swing) * -0.25],
    lean: 1,
  };
}

const POSES: Pose[] = Array.from({ length: CHAR_FRAME_COUNT }, (_, f) => poseOf(f));

/**
 * Front hand position per frame, in world pixels from the feet pivot (facing right): the
 * renderer puts the held weapon there, so it swings with the arm while running.
 */
export const CHAR_HANDS: { x: number; y: number }[] = POSES.map((pose) => ({
  x: (pose.frontHand[0] - CHAR_OX) / 2,
  y: (pose.frontHand[1] - CHAR_OY) / 2,
}));

// ---------------------------------------------------------------------------------------------
// Palettes (slot ramps: 0 = darkest … 3 = lightest)

const SKIN = 'abcd';
const HAIR = 'hijl';
const CLOTH = 'pqrs';
const PANTS = 'tuv';
const BOOT = 'xyz';
const MAT = 'MNOP';

const PAL: Record<string, string> = {
  a: '@skin0',
  b: '@skin1',
  c: '@skin2',
  d: '@skin3',
  h: '@hair0',
  i: '@hair1',
  j: '@hair2',
  l: '@hair3',
  p: '@cloth0',
  q: '@cloth1',
  r: '@cloth2',
  s: '@cloth3',
  t: '@pants0',
  u: '@pants1',
  v: '@pants2',
  x: '@boot0',
  y: '@boot1',
  z: '@boot2',
  M: '@m0',
  N: '@m1',
  O: '@m2',
  P: '@m3',
  e: '@eye',
  k: C.ink,
  w: C.white,
  g: C.gold2,
};

function layer(id: string, paint: (p: Pix, pose: Pose, f: number) => void): SpriteDef {
  const frames = POSES.map((pose, f) => {
    const p = new Pix(CHAR_W, CHAR_H);
    paint(p, pose, f);
    return p.rows();
  });
  return sprite(id, CHAR_W, CHAR_H, PAL, frames, { res: 2, ox: CHAR_OX, oy: CHAR_OY });
}

// ---------------------------------------------------------------------------------------------
// Body

function arm(p: Pix, pose: Pose, front: boolean, sleeve: string): void {
  const sx = front ? SHOULDER_FRONT : SHOULDER_BACK;
  const sy = SHOULDER_Y + pose.bob + 1;
  const [hx, hy] = front ? pose.frontHand : pose.backHand;
  const [ex, ey] = joint(sx, sy, hx, hy, 4.6, 4.4, front ? -1 : 1);
  const ramp = front ? sleeve : sleeve.slice(0, 3);
  p.limb(sx, sy, ex, ey, 2.4, 2.1, ramp, { dither: false });
  p.limb(ex, ey, hx, hy, 2.1, 1.8, ramp);
  p.ball(hx, hy + 0.5, 2.1, 2.1, front ? SKIN : SKIN.slice(0, 3));
}

export const backArm = layer('char.arm.back', (p, pose) => arm(p, pose, false, CLOTH));
export const frontArm = layer('char.arm.front', (p, pose) => arm(p, pose, true, CLOTH));

function legShape(p: Pix, hipX: number, ankle: [number, number], back: boolean): void {
  const hy = HIP_Y;
  const [ax, ay] = ankle;
  const [kx, ky] = joint(hipX, hy, ax, ay, 5.2, 5, -1);
  const pants = back ? 'ttu' : PANTS;
  const boot = back ? 'xxy' : BOOT;
  p.limb(hipX, hy, kx, ky, 2.8, 2.5, pants);
  p.limb(kx, ky, ax, ay - 1, 2.5, 2.4, pants);
  // Boot: shaft + a foot that points forward.
  p.limb(ax, ay - 1.5, ax, ay + 0.5, 2.6, 2.6, boot);
  p.ball(ax + 1.4, ay + 1.2, 3.4, 1.9, boot);
  p.rect(ax - 2, ay + 2.2, 7, 1, back ? 'x' : 'x', { keep: '.' });
}

export const legsLayer = layer('char.legs', (p, pose) => {
  legShape(p, HIP_BACK, pose.back, true);
  legShape(p, HIP_FRONT, pose.front, false);
  // Hips / seat of the trousers.
  p.ball(16, HIP_Y - 0.5, 7, 2.6, PANTS);
});

function torsoShape(p: Pix, pose: Pose, female: boolean): void {
  const b = pose.bob;
  const top = 24 + b;
  const waist = 36;
  const sw = female ? 6.6 : 7.6; // half shoulder width
  const ww = female ? 5.4 : 6.4; // half waist width
  const cx = 16;
  p.shadedPoly(
    [
      cx - sw + 1.5,
      top,
      cx + sw - 1.5,
      top,
      cx + sw,
      top + 2.5,
      cx + ww + 0.6,
      waist,
      cx - ww - 0.6,
      waist,
      cx - sw,
      top + 2.5,
    ],
    CLOTH,
    { bias: 0.4 },
  );
  // Collar + neck.
  p.rect(cx - 2, top - 1.5, 5, 2, 'b');
  p.rect(cx - 3, top, 7, 1, 'p');
  // Belt.
  p.rect(cx - ww - 0.5, waist - 2 + (b > 0 ? 1 : 0), ww * 2 + 1.5, 1.6, 'x');
  p.rect(cx + 1, waist - 2 + (b > 0 ? 1 : 0), 2, 1.6, 'g');
  if (female) p.line(cx - 1, top + 5, cx + 4, top + 5, 'q');
}

export const torsoM = layer('char.torso.m', (p, pose) => torsoShape(p, pose, false));
export const torsoF = layer('char.torso.f', (p, pose) => torsoShape(p, pose, true));

const HEAD_CX = 16.5;
const HEAD_CY = 14;
const HEAD_RX = 9.4;
const HEAD_RY = 8.8;

function headY(pose: Pose): number {
  return HEAD_CY + pose.bob;
}
function headX(pose: Pose): number {
  return HEAD_CX + pose.lean * 0.5;
}

export const headLayer = layer('char.head', (p, pose) => {
  const cx = headX(pose);
  const cy = headY(pose);
  p.ball(cx, cy, HEAD_RX, HEAD_RY, SKIN, { bias: 1.3 });
  // The face (front) stays in the light; only the back of the head and the chin get shade.
  p.ellipse(cx + 3.6, cy + 1.5, 5.6, 5.4, 'c', { onlyOver: 'ab' });
  // Ear.
  p.ball(cx - 4.5, cy + 1.5, 1.8, 2.4, 'abc');
  p.set(cx - 4.5, cy + 1.5, 'a');
  // Nose + mouth.
  p.set(cx + 8.4, cy + 2.5, 'b');
  p.line(cx + 4.5, cy + 5.5, cx + 6, cy + 5.5, 'a');
});

function eyes(p: Pix, pose: Pose, female: boolean): void {
  const cx = headX(pose);
  const cy = headY(pose);
  for (const ex of [cx + 1.8, cx + 6.2]) {
    p.rect(ex, cy - 0.5, 2, 3, 'e');
    p.rect(ex, cy - 1, 2, 1, 'k');
    p.set(ex + 1, cy + 0.5, 'w');
    if (female) p.set(ex + 2, cy - 1.5, 'k');
  }
  // Brows.
  p.line(cx + 1.5, cy - 3, cx + 3.5, cy - 3, 'a');
  p.line(cx + 6, cy - 3, cx + 8, cy - 3, 'a');
}

export const eyesLayerM = layer('char.eyes.m', (p, pose) => eyes(p, pose, false));
export const eyesLayerF = layer('char.eyes.f', (p, pose) => eyes(p, pose, true));

// ---------------------------------------------------------------------------------------------
// Hair

export const HAIR_STYLES = ['short', 'spiky', 'long', 'ponytail', 'bob', 'bun', 'bald'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

/** Top of the head + the back of the head down to `backTo`; fringe over the forehead. */
function hairCap(p: Pix, pose: Pose, backTo: number, fringe: number): void {
  const cx = headX(pose);
  const cy = headY(pose);
  const h = new Pix(p.w, p.h);
  // Crown and the back of the head (left side, behind the ear).
  h.ball(cx - 0.5, cy - 3.4, HEAD_RX + 0.9, 6.6, HAIR, { bias: 0.5 });
  h.limb(cx - 6.2, cy - 3, cx - 6.6, cy + backTo, 3.8, 3.1, HAIR, { bias: 0.3 });
  // Keep the face clear: the eyes sit just below the hairline.
  h.ellipse(cx + 4, cy + 2.4, 6.6, 5.6, '.');
  // Fringe: a few short strands over the forehead.
  for (let k = 0; k < 3; k++) {
    const x = cx + 1.2 + k * 2.6;
    const len = fringe - (k === 1 ? 0.8 : 0) - (k === 2 ? 1.2 : 0);
    h.limb(x, cy - 4.8, x + 0.7, cy - 4.8 + len, 1.5, 0.6, 'ijj');
  }
  // Strand lines and a shine on the crown.
  h.line(cx - 7, cy - 4, cx - 3.5, cy - 7.8, 'h', { onlyOver: HAIR });
  h.line(cx - 2, cy - 8.6, cx + 2, cy - 9.2, 'l', { onlyOver: HAIR });
  h.line(cx + 3, cy - 8, cx + 5, cy - 7.4, 'l', { onlyOver: HAIR });
  p.blit(h, 0, 0);
}

const hair = (id: string, paint: (p: Pix, pose: Pose) => void) => layer(`char.hair.${id}`, paint);

export const hairLayers: Record<Exclude<HairStyle, 'bald'>, SpriteDef> = {
  short: hair('short', (p, pose) => hairCap(p, pose, 2.5, 2.2)),
  spiky: hair('spiky', (p, pose) => {
    const cx = headX(pose);
    const cy = headY(pose);
    hairCap(p, pose, 1.5, 2);
    for (const [x, y, tx, ty] of [
      // Tips stay ≥ 1 texel below the frame top even at the highest run bob.
      [-6, -6, -11, -9.5],
      [-2, -8, -4.5, -10.5],
      [2, -8, 2.5, -10.5],
      [6, -6, 10.5, -9.5],
      [8, -3, 12.5, -5],
    ] as const) {
      p.limb(cx + x, cy + y, cx + tx, cy + ty, 2.6, 0.5, HAIR);
    }
  }),
  long: hair('long', (p, pose) => {
    const cx = headX(pose);
    const cy = headY(pose);
    hairCap(p, pose, 6, 2.4);
    // Long hair falls behind the shoulder, swinging a texel when running.
    const sway = pose.lean ? -1 : 0;
    p.limb(cx - 6.5, cy, cx - 7.5 + sway, cy + 15, 4, 3, HAIR, { bias: 0.3 });
    p.line(cx - 7, cy + 3, cx - 8 + sway, cy + 14, 'h');
  }),
  ponytail: hair('ponytail', (p, pose) => {
    const cx = headX(pose);
    const cy = headY(pose);
    hairCap(p, pose, 1, 2);
    const sway = pose.lean ? pose.bob * 0.8 : 0;
    p.limb(cx - 8.5, cy - 4, cx - 12.5, cy + 4 - sway, 2.6, 1.6, HAIR);
    p.limb(cx - 12.5, cy + 4 - sway, cx - 12, cy + 9 - sway, 1.6, 0.8, HAIR);
    p.rect(cx - 10, cy - 5, 2, 2, 'g');
  }),
  bob: hair('bob', (p, pose) => {
    const cx = headX(pose);
    const cy = headY(pose);
    hairCap(p, pose, 6.5, 2.4);
    p.limb(cx - 6, cy, cx - 5, cy + 6.5, 4, 3, HAIR);
    p.limb(cx + 8.4, cy - 3, cx + 8.6, cy + 3, 1.6, 1.2, HAIR);
  }),
  bun: hair('bun', (p, pose) => {
    const cx = headX(pose);
    const cy = headY(pose);
    hairCap(p, pose, 2, 2);
    p.ball(cx - 7.5, cy - 7.5, 4, 3.6, HAIR, { bias: 0.4 });
    p.line(cx - 9.5, cy - 6.5, cx - 5.5, cy - 8.5, 'g');
  }),
};

// ---------------------------------------------------------------------------------------------
// Armor (material ramp @m0…@m3)

export const helmetLayers: Record<string, { def: SpriteDef; hidesHair: boolean }> = {
  cap: {
    hidesHair: false,
    def: layer('char.helm.cap', (p, pose) => {
      const cx = headX(pose);
      const cy = headY(pose);
      p.ball(cx - 0.5, cy - 4.6, HEAD_RX + 0.7, 5.4, 'MNOP', { bias: -0.3 });
      p.ellipse(cx + 4, cy + 2.4, 6.6, 5.6, '.', { onlyOver: MAT });
      // Band and a short brim over the forehead.
      p.rect(cx - 9.5, cy - 4.2, 15, 1.5, 'M', { onlyOver: MAT });
      p.limb(cx + 4, cy - 3.6, cx + 10.5, cy - 3, 1.1, 0.8, 'MN');
      p.line(cx - 5, cy - 8.6, cx, cy - 9.8, 'P');
    }),
  },
  helm: {
    hidesHair: true,
    def: layer('char.helm.helm', (p, pose) => {
      const cx = headX(pose);
      const cy = headY(pose);
      p.ball(cx - 0.5, cy - 2.5, HEAD_RX + 1.3, 7.8, 'MNOP', { bias: -0.6 });
      // Neck guard (back) and cheek plate, leaving the face open.
      p.limb(cx - 6.5, cy - 2, cx - 6.5, cy + 5, 4, 3.4, 'MNO');
      p.ellipse(cx + 5, cy + 1.2, 4.6, 3.6, '.', { onlyOver: MAT });
      p.rect(cx - 10, cy - 1.6, 17, 1.4, 'M', { onlyOver: MAT });
      // Crest rivets.
      p.set(cx - 2, cy - 7, 'P');
      p.set(cx + 2, cy - 7, 'P');
      p.line(cx - 6, cy - 6.5, cx - 1, cy - 9.5, 'P');
    }),
  },
  hood: {
    hidesHair: true,
    def: layer('char.helm.hood', (p, pose) => {
      const cx = headX(pose);
      const cy = headY(pose);
      p.ball(cx - 0.5, cy - 1, HEAD_RX + 1.8, HEAD_RY + 1.2, 'MNOP', { bias: -0.2 });
      // Face opening.
      p.ellipse(cx + 4.6, cy + 1.6, 5.6, 5.8, '.', { onlyOver: MAT });
      p.line(cx - 1.5, cy - 6, cx - 1, cy + 6, 'M', { onlyOver: MAT });
      // Cape over the shoulders.
      p.limb(cx - 7, cy + 4, cx - 8, cy + 12, 4, 3.4, 'MNO');
    }),
  },
};

function chestBody(id: string, paint: (p: Pix, pose: Pose, top: number) => void): SpriteDef {
  return layer(`char.chest.${id}`, (p, pose) => paint(p, pose, 24 + pose.bob));
}

/** Chest armor: `body` goes over the torso, `top` (shoulder pieces) over the front arm. */
export const chestLayers: Record<string, { body: SpriteDef; top?: SpriteDef }> = {
  vest: {
    body: chestBody('vest', (p, pose, top) => {
      p.shadedPoly([8.6, top + 1, 23.4, top + 1, 22.6, 34.5, 9.4, 34.5], 'MNOP', { bias: -0.2 });
      p.rect(15, top + 1, 2, 34.5 - top - 1, '.', { onlyOver: MAT }); // open front
      p.rect(15, top + 1, 2, 34.5 - top - 1, 'q', { onlyOver: '.' });
      for (let y = top + 4; y < 34; y += 3.5) p.set(14, y, 'P');
      void pose;
    }),
  },
  plate: {
    body: chestBody('plate', (p, _pose, top) => {
      p.shadedPoly([8, top + 0.5, 24, top + 0.5, 23, 35, 9, 35], 'MMNNO', { bias: -0.4 });
      p.line(16, top + 2, 16, 34, 'M');
      p.line(10, top + 6, 22, top + 6, 'N');
      p.ball(13, top + 4, 2.4, 1.6, 'NOP');
    }),
    top: chestBody('plate.top', (p, pose, top) => {
      p.ball(SHOULDER_FRONT, top + 2.5, 3.8, 3, 'MNOP', { bias: -0.6 });
      void pose;
    }),
  },
  robe: {
    body: chestBody('robe', (p, pose, top) => {
      const [bx] = pose.back;
      const [fx] = pose.front;
      const l = Math.min(bx, fx) - 2.5;
      const r = Math.max(bx, fx) + 2.5;
      p.shadedPoly([8, top, 24, top, 24.5, 32, r, 41.5, l, 41.5, 7.5, 32], 'MNOP', {
        bias: -0.3,
      });
      p.line(16, top + 1, 16 + (r + l - 32) / 4, 41, 'P');
      p.rect(9, 33.5, 14.5, 1.6, 'g', { onlyOver: MAT });
    }),
  },
};

// ---------------------------------------------------------------------------------------------
// Colors

/** Material ramps for armor (dark, mid, light). */
export const MATERIALS: Record<string, [string, string, string]> = {
  cloth: [C.wood1, C.wood2, C.wood3],
  leather: [C.wood0, C.wood1, C.wood2],
  iron: [C.stone1, C.stone3, C.stone4],
  steel: [C.stone2, C.stone4, C.white],
  gold: [C.gold0, C.gold1, C.gold2],
  bone: [C.bone0, C.bone1, C.bone2],
  arcane: [C.violet0, C.violet1, C.violet2],
  forest: [C.green0, C.green1, C.green2],
  crimson: [C.red0, C.red1, C.red2],
  frost: [C.blue1, C.blue2, C.blue3],
  tech: [C.cyan0, C.cyan1, C.cyan2],
};

export const SKIN_TONES = ['#f7d7c4', '#eebb99', '#d69e74', '#b07850', '#8a5a3b', '#5e3b26'];
export const HAIR_COLORS = [
  '#2b1d16',
  '#5a3824',
  '#9a6234',
  '#d9a45b',
  '#f2e2a0',
  '#b3392f',
  '#e3e1dd',
  '#3d3c52',
  '#3d84d1',
  '#9a4dc4',
  '#4c9e47',
  '#f08bb0',
];
export const EYE_COLORS = ['#3a2a20', '#3d84d1', '#4c9e47', '#8a5a3b', '#9a4dc4', '#cf4440'];
export const CLOTH_COLORS = [
  '#cf4440',
  '#3d84d1',
  '#4c9e47',
  '#9a4dc4',
  '#f2c94c',
  '#36c4b4',
  '#875934',
  '#4f4d66',
  '#ece4c8',
  '#2a2140',
  '#f08b5c',
  '#5a2c80',
];

export interface Appearance {
  gender: 'm' | 'f';
  skin: number;
  hairStyle: HairStyle;
  hairColor: number;
  eyeColor: number;
  clothColor: number;
  pantsColor: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  gender: 'm',
  skin: 1,
  hairStyle: 'short',
  hairColor: 1,
  eyeColor: 1,
  clothColor: 1,
  pantsColor: 7,
};

/** What the equipped armor looks like (from item content). */
export interface EquipLook {
  helmet?: { shape: string; material: string };
  chest?: { shape: string; material: string };
  boots?: { material: string };
}

function pick(list: readonly string[], i: number): string {
  return list[((i % list.length) + list.length) % list.length]!;
}

/** Four-step ramp around a base color: deep shadow, shadow, base, highlight. */
function ramp4(base: string, prefix: string, out: SlotColors): void {
  out[`${prefix}0`] = shade(base, 0.52);
  out[`${prefix}1`] = shade(base, 0.76);
  out[`${prefix}2`] = base;
  out[`${prefix}3`] = tint(base, 0.32);
}

export function appearanceSlots(a: Appearance, look: EquipLook = {}): SlotColors {
  const slots: SlotColors = { eye: pick(EYE_COLORS, a.eyeColor) };
  ramp4(pick(SKIN_TONES, a.skin), 'skin', slots);
  ramp4(pick(HAIR_COLORS, a.hairColor), 'hair', slots);
  ramp4(pick(CLOTH_COLORS, a.clothColor), 'cloth', slots);
  ramp4(pick(CLOTH_COLORS, a.pantsColor), 'pants', slots);
  slots.skin1 = shade(slots.skin2!, 0.84);
  const boots = look.boots ? MATERIALS[look.boots.material] : undefined;
  slots.boot0 = boots ? shade(boots[0], 0.8) : C.wood0;
  slots.boot1 = boots ? boots[0] : C.wood1;
  slots.boot2 = boots ? boots[1] : C.wood2;
  return slots;
}

export function materialSlots(material: string): SlotColors {
  const m = MATERIALS[material] ?? MATERIALS.iron!;
  return { m0: m[0], m1: m[1], m2: m[2], m3: tint(m[2], 0.35) };
}

/**
 * Compose the paper-doll into final frames (outlined RGBA, CHAR_W×CHAR_H texels each).
 * Frame order matches CHAR_ANIMS.
 */
export function composeCharacter(a: Appearance, look: EquipLook = {}): RgbaImage[] {
  const slots = appearanceSlots(a, look);
  const helm = look.helmet ? helmetLayers[look.helmet.shape] : undefined;
  const chest = look.chest ? chestLayers[look.chest.shape] : undefined;
  const helmSlots = look.helmet ? { ...slots, ...materialSlots(look.helmet.material) } : slots;
  const chestSlots = look.chest ? { ...slots, ...materialSlots(look.chest.material) } : slots;
  const hairDef = a.hairStyle === 'bald' ? undefined : hairLayers[a.hairStyle];
  const female = a.gender === 'f';
  const frames: RgbaImage[] = [];
  for (let f = 0; f < CHAR_FRAME_COUNT; f++) {
    const img = createImage(CHAR_W, CHAR_H);
    blitSprite(img, backArm, f, 0, 0, slots);
    blitSprite(img, legsLayer, f, 0, 0, slots);
    blitSprite(img, female ? torsoF : torsoM, f, 0, 0, slots);
    if (chest) blitSprite(img, chest.body, f, 0, 0, chestSlots);
    blitSprite(img, headLayer, f, 0, 0, slots);
    blitSprite(img, female ? eyesLayerF : eyesLayerM, f, 0, 0, slots);
    if (hairDef && !(helm && helm.hidesHair)) blitSprite(img, hairDef, f, 0, 0, slots);
    if (helm) blitSprite(img, helm.def, f, 0, 0, helmSlots);
    blitSprite(img, frontArm, f, 0, 0, slots);
    if (chest?.top) blitSprite(img, chest.top, f, 0, 0, chestSlots);
    frames.push(outline(img, C.ink));
  }
  return frames;
}

export const CHARACTER_LAYERS: SpriteDef[] = [
  backArm,
  frontArm,
  headLayer,
  eyesLayerM,
  eyesLayerF,
  torsoM,
  torsoF,
  legsLayer,
  ...Object.values(hairLayers),
  ...Object.values(helmetLayers).map((h) => h.def),
  ...Object.values(chestLayers).flatMap((c) => (c.top ? [c.body, c.top] : [c.body])),
];
