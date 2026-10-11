import { dcos, dsin } from '@ao/shared';
import { sprite, type SpriteDef } from './types';

/**
 * Tiny raster painter for HD (res 2) sprites: shapes are filled with palette keys, and shaded
 * shapes pick a key from a dark→light ramp by a fixed light direction (top-left, towards the
 * viewer). The result is ordinary SpriteDef rows, so overrides, the atlas and tests work the
 * same as for hand-typed pixel maps. Deterministic: no Math.sin/cos (dsin/dcos instead).
 */

const L = (() => {
  const x = -0.5;
  const y = -0.72;
  const z = 0.48;
  const n = Math.sqrt(x * x + y * y + z * z);
  return { x: x / n, y: y / n, z: z / n };
})();

/** 2×2 Bayer thresholds (-0.375…0.375). */
const BAYER = [-0.375, 0.125, 0.375, -0.125];

export interface ShadeOpts {
  /** Ordered dithering between ramp steps (texture for cloth, stone, fur). */
  dither?: boolean;
  /** Shift towards light (+) or dark (-), in ramp steps. */
  bias?: number;
  /** Only paint over cells that are currently one of these keys. */
  onlyOver?: string;
  /** Do not paint over these keys. */
  keep?: string;
}

/** Ramp index for a lighting intensity in [-1, 1]. */
function rampIndex(i: number, n: number, x: number, y: number, o?: ShadeOpts): number {
  let t = (i + 0.3) / 1.25 + (o?.bias ?? 0) / n;
  if (o?.dither) t += BAYER[(x & 1) + (y & 1) * 2]! / n;
  return Math.max(0, Math.min(n - 1, Math.floor(t * n)));
}

export class Pix {
  readonly g: string[];

  constructor(
    readonly w: number,
    readonly h: number,
    fill = '.',
  ) {
    this.g = new Array<string>(w * h).fill(fill);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): string {
    x = Math.floor(x);
    y = Math.floor(y);
    return this.inside(x, y) ? this.g[y * this.w + x]! : '.';
  }

  set(x: number, y: number, c: string, o?: ShadeOpts): this {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inside(x, y)) return this;
    const i = y * this.w + x;
    const cur = this.g[i]!;
    if (o?.onlyOver !== undefined && !o.onlyOver.includes(cur)) return this;
    if (o?.keep !== undefined && o.keep.includes(cur)) return this;
    this.g[i] = c;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: string, o?: ShadeOpts): this {
    for (let yy = Math.floor(y); yy < Math.floor(y + h); yy++)
      for (let xx = Math.floor(x); xx < Math.floor(x + w); xx++) this.set(xx, yy, c, o);
    return this;
  }

  /** Filled ellipse (cells whose centers fall inside). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string, o?: ShadeOpts): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, o);
      }
    }
    return this;
  }

  /** Shaded ellipsoid. `ramp` = palette keys from dark to light. */
  ball(cx: number, cy: number, rx: number, ry: number, ramp: string, o?: ShadeOpts): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        const i = nx * L.x + ny * L.y + nz * L.z;
        this.set(x, y, ramp[rampIndex(i, ramp.length, x, y, o)]!, o);
      }
    }
    return this;
  }

  /**
   * Thick segment with round ends (an arm, a bone, a sword blade), shaded like a cylinder.
   * `r0`/`r1` = radius at each end.
   */
  limb(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r0: number,
    r1: number,
    ramp: string,
    o?: ShadeOpts,
  ): this {
    const vx = x1 - x0;
    const vy = y1 - y0;
    const len2 = vx * vx + vy * vy || 1e-6;
    const len = Math.sqrt(len2);
    // Unit normal (perpendicular), pointing to the side the light comes from.
    let px = -vy / len;
    let py = vx / len;
    if (px * L.x + py * L.y < 0) {
      px = -px;
      py = -py;
    }
    const rmax = Math.max(r0, r1);
    const minX = Math.floor(Math.min(x0, x1) - rmax);
    const maxX = Math.ceil(Math.max(x0, x1) + rmax);
    const minY = Math.floor(Math.min(y0, y1) - rmax);
    const maxY = Math.ceil(Math.max(y0, y1) + rmax);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cx = x + 0.5 - x0;
        const cy = y + 0.5 - y0;
        const t = Math.max(0, Math.min(1, (cx * vx + cy * vy) / len2));
        const dx = cx - vx * t;
        const dy = cy - vy * t;
        const r = r0 + (r1 - r0) * t;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        if (ramp.length === 1) {
          this.set(x, y, ramp, o);
          continue;
        }
        const s = (dx * px + dy * py) / Math.max(0.5, r); // -1 (shadow side) … 1 (lit side)
        const nz = Math.sqrt(Math.max(0, 1 - s * s));
        const lit = Math.sqrt(L.x * L.x + L.y * L.y);
        const i = s * lit + nz * L.z;
        this.set(x, y, ramp[rampIndex(i, ramp.length, x, y, o)]!, o);
      }
    }
    return this;
  }

  /** 1-texel line (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, c: string, o?: ShadeOpts): this {
    let ax = Math.round(x0);
    let ay = Math.round(y0);
    const bx = Math.round(x1);
    const by = Math.round(y1);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.set(ax, ay, c, o);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ay += sy;
      }
    }
    return this;
  }

  /** Filled polygon, flat list [x0, y0, x1, y1, …] (even-odd, cell centers). */
  poly(pts: number[], c: string, o?: ShadeOpts): this {
    this.polyEach(pts, (x, y) => this.set(x, y, c, o));
    return this;
  }

  /**
   * Polygon shaded like a soft dome over its bounding box (good enough for cloaks, roofs, rocks).
   */
  shadedPoly(pts: number[], ramp: string, o?: ShadeOpts): this {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < pts.length; k += 2) {
      minX = Math.min(minX, pts[k]!);
      maxX = Math.max(maxX, pts[k]!);
      minY = Math.min(minY, pts[k + 1]!);
      maxY = Math.max(maxY, pts[k + 1]!);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = Math.max(1, (maxX - minX) / 2);
    const ry = Math.max(1, (maxY - minY) / 2);
    this.polyEach(pts, (x, y) => {
      const nx = Math.max(-1, Math.min(1, (x + 0.5 - cx) / rx));
      const ny = Math.max(-1, Math.min(1, (y + 0.5 - cy) / ry));
      const d = Math.min(1, nx * nx + ny * ny);
      const nz = Math.sqrt(1 - d);
      const i = nx * 0.8 * L.x + ny * 0.8 * L.y + (0.35 + nz * 0.65) * L.z;
      this.set(x, y, ramp[rampIndex(i, ramp.length, x, y, o)]!, o);
    });
    return this;
  }

  private polyEach(pts: number[], fn: (x: number, y: number) => void): void {
    const n = pts.length / 2;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < n; k++) {
      minY = Math.min(minY, pts[k * 2 + 1]!);
      maxY = Math.max(maxY, pts[k * 2 + 1]!);
    }
    const xs: number[] = [];
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let k = 0; k < n; k++) {
        const ax = pts[k * 2]!;
        const ay = pts[k * 2 + 1]!;
        const bx = pts[((k + 1) % n) * 2]!;
        const by = pts[((k + 1) % n) * 2 + 1]!;
        if (ay <= sy !== by <= sy) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) fn(x, y);
      }
    }
  }

  /** Copy another picture on top (its '.' cells are transparent). */
  blit(src: Pix, dx: number, dy: number, flipX = false): this {
    dx = Math.round(dx);
    dy = Math.round(dy);
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.g[y * src.w + (flipX ? src.w - 1 - x : x)]!;
        if (c !== '.') this.set(x + dx, y + dy, c);
      }
    }
    return this;
  }

  /** Replace keys: `map` = { from: to }. */
  recolor(map: Record<string, string>): this {
    for (let i = 0; i < this.g.length; i++) {
      const to = map[this.g[i]!];
      if (to !== undefined) this.g[i] = to;
    }
    return this;
  }

  /**
   * Colored inner outline ("sel-out"): cells of `keys` that border an empty cell on the
   * shadow side (right/bottom) become `dark`; on the lit side (left/top) optionally `light`.
   */
  rim(keys: string, dark: string, light?: string): this {
    const src = this.g.slice();
    const empty = (x: number, y: number) =>
      !this.inside(x, y) || src[y * this.w + x] === '.' || !keys.includes(src[y * this.w + x]!);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = src[y * this.w + x]!;
        if (c === '.' || !keys.includes(c)) continue;
        if (empty(x + 1, y) || empty(x, y + 1)) this.g[y * this.w + x] = dark;
        else if (light && (empty(x - 1, y) || empty(x, y - 1))) this.g[y * this.w + x] = light;
      }
    }
    return this;
  }

  /** Rotate a point around (cx, cy) by `a` radians (helper for posed parts). */
  static rot(x: number, y: number, cx: number, cy: number, a: number): [number, number] {
    const c = dcos(a);
    const s = dsin(a);
    return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  }

  clone(): Pix {
    const p = new Pix(this.w, this.h);
    for (let i = 0; i < this.g.length; i++) p.g[i] = this.g[i]!;
    return p;
  }

  rows(): string {
    const out: string[] = [];
    for (let y = 0; y < this.h; y++) out.push(this.g.slice(y * this.w, (y + 1) * this.w).join(''));
    return out.join('\n');
  }
}

/** HD sprite (res 2) from painted frames. */
export function hd(
  id: string,
  pal: Record<string, string>,
  frames: Pix[],
  opts: { ox?: number; oy?: number; outline?: boolean } = {},
): SpriteDef {
  const f0 = frames[0]!;
  return sprite(
    id,
    f0.w,
    f0.h,
    pal,
    frames.map((f) => f.rows()),
    { res: 2, outline: opts.outline ?? true, ox: opts.ox, oy: opts.oy },
  );
}

/** Small deterministic hash → [0, 1) (texture noise for tiles and fur). */
export function hash01(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Cycle helper: phase in [0, 1) of frame `f` out of `n`, as an angle. */
export function cyc(f: number, n: number): number {
  return (f / n) * Math.PI * 2;
}

/** Two-bone IK: knee/elbow position for a joint between `a` and `b` bending towards +x·bend. */
export function joint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  l1: number,
  l2: number,
  bend: number,
): [number, number] {
  let dx = bx - ax;
  let dy = by - ay;
  let d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  const maxD = l1 + l2 - 0.01;
  if (d > maxD) {
    dx = (dx / d) * maxD;
    dy = (dy / d) * maxD;
    d = maxD;
  }
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA) * bend;
  const ux = dx / d;
  const uy = dy / d;
  // Rotate the a→b direction by ±A.
  return [ax + (ux * cosA - uy * sinA) * l1, ay + (ux * sinA + uy * cosA) * l1];
}

export { dcos, dsin };
