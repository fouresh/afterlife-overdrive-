/**
 * Deterministic math. Math.sin/cos/atan2/pow are NOT specified bit-exactly by ECMAScript and differ
 * between engines. These implementations use only + - * / and Math.sqrt/floor/round/abs, which are
 * exactly specified (IEEE 754), so sim and procgen give identical results everywhere.
 */

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

/** Wrap angle into [-PI, PI]. */
export function wrapAngle(a: number): number {
  return a - TAU * Math.round(a / TAU);
}

/** sin(x) for |x| <= PI/2, Taylor series to x^15 (abs error < 1e-9). */
function sinCore(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 *
                (-1 / 5040 +
                  x2 *
                    (1 / 362880 +
                      x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))))
  );
}

export function dsin(a: number): number {
  let x = wrapAngle(a);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  return sinCore(x);
}

export function dcos(a: number): number {
  return dsin(a + HALF_PI);
}

/** atan for x in [0, 1]; minimax-like polynomial, abs error ~1e-6 rad. */
function atanUnit(x: number): number {
  // Reduce further: atan(x) = PI/4 + atan((x-1)/(x+1)) for x > tan(PI/8)
  if (x > 0.4142135623730951) {
    return 0.7853981633974483 + atanSmall((x - 1) / (x + 1));
  }
  return atanSmall(x);
}

/** atan for |x| <= tan(PI/8) ~ 0.4142, Taylor to x^17 (error < 2e-8). */
function atanSmall(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 3 +
          x2 *
            (1 / 5 +
              x2 *
                (-1 / 7 +
                  x2 * (1 / 9 + x2 * (-1 / 11 + x2 * (1 / 13 + x2 * (-1 / 15 + x2 * (1 / 17)))))))))
  );
}

export function datan(x: number): number {
  const ax = Math.abs(x);
  const r = ax <= 1 ? atanUnit(ax) : HALF_PI - atanUnit(1 / ax);
  return x < 0 ? -r : r;
}

export function datan2(y: number, x: number): number {
  if (x === 0) {
    if (y > 0) return HALF_PI;
    if (y < 0) return -HALF_PI;
    return 0;
  }
  const a = datan(y / x);
  if (x > 0) return a;
  return y >= 0 ? a + PI : a - PI;
}

/** Integer power (deterministic). */
export function ipow(base: number, exp: number): number {
  let result = 1;
  let b = base;
  let e = Math.floor(Math.abs(exp));
  while (e > 0) {
    if (e & 1) result *= b;
    b *= b;
    e >>= 1;
  }
  return exp < 0 ? 1 / result : result;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Shortest signed difference between two angles. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

/** Quantize an angle to a byte (256 steps per turn). */
export function angleToByte(a: number): number {
  const t = wrapAngle(a) / TAU; // [-0.5, 0.5]
  return (Math.round(t * 256) + 256) & 255;
}

export function byteToAngle(b: number): number {
  const v = b & 255;
  return ((v > 127 ? v - 256 : v) / 256) * TAU;
}
