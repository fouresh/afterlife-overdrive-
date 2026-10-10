import { TF, TILE_FLAGS } from '@ao/procgen';
import { TILE } from '@ao/shared';

export interface CollisionMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  /** Dynamic flags (closed doors) OR-ed with static tile flags. */
  dyn: Uint8Array;
}

export function tileFlags(m: CollisionMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return TF.BlockWalk | TF.BlockShot;
  const i = ty * m.w + tx;
  return (TILE_FLAGS[m.tiles[i]!] ?? 0) | m.dyn[i]!;
}

const EPS = 0.001;

/**
 * Move an axis-aligned box (half-size r) by (dx, dy) against the tile grid, one axis at a time.
 * Returns bit flags: 1 = blocked on X, 2 = blocked on Y. Writes the result into out.
 */
export function moveBox(
  m: CollisionMap,
  x: number,
  y: number,
  r: number,
  dx: number,
  dy: number,
  mask: number,
  out: { x: number; y: number },
): number {
  let hit = 0;
  // X axis
  let nx = x + dx;
  if (dx !== 0) {
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r - EPS) / TILE);
    if (dx > 0) {
      const tx = Math.floor((nx + r - EPS) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (tileFlags(m, tx, ty) & mask) {
          nx = tx * TILE - r;
          hit |= 1;
          break;
        }
      }
    } else {
      const tx = Math.floor((nx - r) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (tileFlags(m, tx, ty) & mask) {
          nx = (tx + 1) * TILE + r;
          hit |= 1;
          break;
        }
      }
    }
  }
  // Y axis
  let ny = y + dy;
  if (dy !== 0) {
    const x0 = Math.floor((nx - r) / TILE);
    const x1 = Math.floor((nx + r - EPS) / TILE);
    if (dy > 0) {
      const ty = Math.floor((ny + r - EPS) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (tileFlags(m, tx, ty) & mask) {
          ny = ty * TILE - r;
          hit |= 2;
          break;
        }
      }
    } else {
      const ty = Math.floor((ny - r) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (tileFlags(m, tx, ty) & mask) {
          ny = (ty + 1) * TILE + r;
          hit |= 2;
          break;
        }
      }
    }
  }
  out.x = nx;
  out.y = ny;
  return hit;
}

/** True if a point is inside a tile with any of the mask flags. */
export function pointBlocked(m: CollisionMap, x: number, y: number, mask: number): boolean {
  return (tileFlags(m, Math.floor(x / TILE), Math.floor(y / TILE)) & mask) !== 0;
}

/** Line of sight between two points (DDA over tiles, checks BlockShot). */
export function lineOfSight(
  m: CollisionMap,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  let tx = Math.floor(ax / TILE);
  let ty = Math.floor(ay / TILE);
  const ex = Math.floor(bx / TILE);
  const ey = Math.floor(by / TILE);
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? (tx + 1) * TILE : tx * TILE) - ax) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((dy > 0 ? (ty + 1) * TILE : ty * TILE) - ay) / dy : Infinity;
  for (let guard = 0; guard < 256; guard++) {
    if (tx === ex && ty === ey) return true;
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if (tileFlags(m, tx, ty) & TF.BlockShot) return false;
  }
  return false;
}
