import { TF } from '@ao/procgen';
import { TILE } from '@ao/shared';
import { tileFlags, type CollisionMap } from './collide';

/**
 * Multi-source BFS distance field from all living players over walkable tiles. Enemies without
 * line of sight walk "downhill" on it, so they path around pillars, pits and corners.
 */
export class FlowField {
  readonly dist: Int32Array;
  private queue: Int32Array;

  constructor(private m: CollisionMap) {
    this.dist = new Int32Array(m.w * m.h).fill(-1);
    this.queue = new Int32Array(m.w * m.h);
  }

  update(sources: readonly number[]): void {
    const { w, h } = this.m;
    const dist = this.dist;
    const q = this.queue;
    dist.fill(-1);
    let head = 0;
    let tail = 0;
    for (const s of sources) {
      if (s >= 0 && dist[s] === -1) {
        dist[s] = 0;
        q[tail++] = s;
      }
    }
    while (head < tail) {
      const c = q[head++]!;
      const x = c % w;
      const y = (c - x) / w;
      const d = dist[c]! + 1;
      for (let k = 0; k < 4; k++) {
        const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
        const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (dist[ni] !== -1 || tileFlags(this.m, nx, ny) & TF.BlockWalk) continue;
        dist[ni] = d;
        q[tail++] = ni;
      }
    }
  }

  /** Direction (unit vector) toward lower distance from a world position, or 0,0 if none. */
  direction(x: number, y: number, out: { x: number; y: number }): void {
    const { w, h } = this.m;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    out.x = 0;
    out.y = 0;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
    const here = this.dist[ty * w + tx]!;
    let best = here < 0 ? 1e9 : here;
    let bx = 0;
    let by = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const d = this.dist[ny * w + nx]!;
        if (d < 0) continue;
        // Diagonals only if both orthogonal neighbours are open (no corner cutting).
        if (dx && dy && (this.dist[ty * w + nx]! < 0 || this.dist[ny * w + tx]! < 0)) continue;
        if (d < best) {
          best = d;
          bx = dx;
          by = dy;
        }
      }
    }
    if (bx === 0 && by === 0) return;
    // Aim at the next tile's center for smooth corners.
    const cx = (tx + bx + 0.5) * TILE - x;
    const cy = (ty + by + 0.5) * TILE - y;
    const len = Math.sqrt(cx * cx + cy * cy) || 1;
    out.x = cx / len;
    out.y = cy / len;
  }
}
