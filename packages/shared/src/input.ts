/**
 * Player input for one tick. Quantized so that the client prediction, the local solo sim and the
 * server all see exactly the same numbers (and so it packs into a few bytes on the wire).
 */
export const Btn = {
  Attack: 1 << 0,
  Skill1: 1 << 1,
  Skill2: 1 << 2,
  Dash: 1 << 3,
  Potion: 1 << 4,
  Interact: 1 << 5,
  /** Aim angle is explicit (mouse). Without it the sim auto-aims at the nearest enemy. */
  ManualAim: 1 << 6,
} as const;

export interface PlayerInput {
  /** Movement, -127..127 per axis (vector length ≤ 127). */
  mx: number;
  my: number;
  /** Aim angle in byte units (0..255 = full turn), used when Btn.ManualAim is set. */
  aim: number;
  buttons: number;
}

export function emptyInput(): PlayerInput {
  return { mx: 0, my: 0, aim: 0, buttons: 0 };
}

export function copyInput(dst: PlayerInput, src: PlayerInput): PlayerInput {
  dst.mx = src.mx;
  dst.my = src.my;
  dst.aim = src.aim;
  dst.buttons = src.buttons;
  return dst;
}

/** Quantize a float stick vector (each axis -1..1) into the int8 representation. */
export function quantizeMove(x: number, y: number, out: PlayerInput): void {
  const len = Math.sqrt(x * x + y * y);
  if (len < 0.15) {
    out.mx = 0;
    out.my = 0;
    return;
  }
  if (len > 1) {
    x /= len;
    y /= len;
  }
  out.mx = Math.round(x * 127);
  out.my = Math.round(y * 127);
}
