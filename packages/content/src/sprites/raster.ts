import { hexToRgb } from '../palette';
import type { SlotColors, SpriteDef } from './types';

/** RGBA pixels for one frame. Pure function: runs in browser, worker and tests. */
export interface RgbaImage {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function createImage(w: number, h: number): RgbaImage {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let v = rgbCache.get(hex);
  if (!v) {
    v = hexToRgb(hex);
    rgbCache.set(hex, v);
  }
  return v;
}

export function resolveColor(value: string, slots: SlotColors | undefined): string | null {
  if (value === '') return null;
  if (value.startsWith('@')) {
    const s = slots?.[value.slice(1)];
    return s ?? '#ff00ff';
  }
  return value;
}

/** Draw a sprite frame onto an image at (dx, dy). Transparent pixels are skipped. */
export function blitSprite(
  dst: RgbaImage,
  def: SpriteDef,
  frame: number,
  dx = 0,
  dy = 0,
  slots?: SlotColors,
  flipX = false,
): void {
  const rows = def.frames[frame % def.frames.length]!;
  for (let y = 0; y < def.h; y++) {
    const row = rows[y]!;
    const ty = y + dy;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < def.w; x++) {
      const ch = row[flipX ? def.w - 1 - x : x]!;
      if (ch === '.') continue;
      const value = def.pal[ch];
      if (value === undefined) continue;
      const hex = resolveColor(value, slots);
      if (!hex) continue;
      const tx = x + dx;
      if (tx < 0 || tx >= dst.w) continue;
      const [r, g, b] = rgb(hex);
      const i = (ty * dst.w + tx) * 4;
      dst.data[i] = r;
      dst.data[i + 1] = g;
      dst.data[i + 2] = b;
      dst.data[i + 3] = 255;
    }
  }
}

export function rasterize(def: SpriteDef, frame: number, slots?: SlotColors): RgbaImage {
  const img = createImage(def.w, def.h);
  blitSprite(img, def, frame, 0, 0, slots);
  return img;
}

/** Copy of an image where every opaque pixel becomes white (hit flash). */
export function silhouette(src: RgbaImage, r = 255, g = 255, b = 255): RgbaImage {
  const out = createImage(src.w, src.h);
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3]! > 0) {
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = src.data[i + 3]!;
    }
  }
  return out;
}

/** Overlay src on dst at offset (alpha 0/255 only). */
export function blitImage(dst: RgbaImage, src: RgbaImage, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= dst.w) continue;
      const si = (y * src.w + x) * 4;
      if (src.data[si + 3] === 0) continue;
      const di = (ty * dst.w + tx) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
}

/** Adds a 1px dark outline around opaque pixels (used for readability of small sprites). */
export function outline(src: RgbaImage, hex: string): RgbaImage {
  const [r, g, b] = rgb(hex);
  const out = createImage(src.w, src.h);
  out.data.set(src.data);
  const op = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < src.w && y < src.h && src.data[(y * src.w + x) * 4 + 3]! > 0;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (op(x, y)) continue;
      if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) {
        const i = (y * src.w + x) * 4;
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
        out.data[i + 3] = 255;
      }
    }
  }
  return out;
}
