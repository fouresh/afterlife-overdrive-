/**
 * Palette pixel-art sprites. Each frame is a block of text rows; every char is a palette key.
 * '.' is transparent. Palette values are '#rrggbb' or a customization slot '@name'
 * (resolved at compose time: skin, hair, clothes, equipment material ramps).
 *
 * Any sprite can be replaced by a PNG without code changes: put `<id>.png`
 * (frames laid out horizontally, each w×h) into apps/client/src/assets/sprite-overrides/.
 */
export interface SpriteDef {
  id: string;
  w: number;
  h: number;
  /** Pivot x/y in pixels from the top-left (default: bottom-center = feet). */
  ox?: number;
  oy?: number;
  pal: Record<string, string>;
  frames: string[][];
  /** Add a 1px ink outline around opaque pixels when rasterizing (keep a 1px empty border). */
  outline?: boolean;
}

/** Turn a template literal into rows: trims each line and drops empty lines. */
export function px(src: string): string[] {
  return src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function sprite(
  id: string,
  w: number,
  h: number,
  pal: Record<string, string>,
  frames: string[],
  pivot?: { ox?: number; oy?: number; outline?: boolean },
): SpriteDef {
  return { id, w, h, pal, frames: frames.map(px), ...pivot };
}

/** Same as sprite() but outlined automatically (most characters and items). */
export function outlined(
  id: string,
  w: number,
  h: number,
  pal: Record<string, string>,
  frames: string[],
  pivot?: { ox?: number; oy?: number },
): SpriteDef {
  return sprite(id, w, h, pal, frames, { ...pivot, outline: true });
}

/** Customization slots used by paper-doll layers. */
export type SlotColors = Record<string, string>;

export const TRANSPARENT = '.';
