import type { Entities } from './entities';

/**
 * Uniform-grid spatial hash rebuilt every tick for bodies (players, enemies, allies).
 * Linked lists in typed arrays: no allocations.
 */
export class SpatialHash {
  readonly cell = 32;
  readonly cw: number;
  readonly ch: number;
  private head: Int32Array;
  private next: Int32Array;
  /** Shared query result buffer. */
  readonly out: Int32Array;

  constructor(worldW: number, worldH: number, cap: number) {
    this.cw = Math.ceil(worldW / this.cell) + 1;
    this.ch = Math.ceil(worldH / this.cell) + 1;
    this.head = new Int32Array(this.cw * this.ch).fill(-1);
    this.next = new Int32Array(cap).fill(-1);
    this.out = new Int32Array(cap);
  }

  clear(): void {
    this.head.fill(-1);
  }

  insert(e: Entities, i: number): void {
    const cx = Math.min(this.cw - 1, Math.max(0, Math.floor(e.x[i]! / this.cell)));
    const cy = Math.min(this.ch - 1, Math.max(0, Math.floor(e.y[i]! / this.cell)));
    const c = cy * this.cw + cx;
    this.next[i] = this.head[c]!;
    this.head[c] = i;
  }

  /** Entities whose cell overlaps the circle's bounding box. Returns count in `out`. */
  query(x: number, y: number, r: number): number {
    const x0 = Math.max(0, Math.floor((x - r) / this.cell));
    const y0 = Math.max(0, Math.floor((y - r) / this.cell));
    const x1 = Math.min(this.cw - 1, Math.floor((x + r) / this.cell));
    const y1 = Math.min(this.ch - 1, Math.floor((y + r) / this.cell));
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.head[cy * this.cw + cx]!; i !== -1; i = this.next[i]!) {
          if (n < this.out.length) this.out[n++] = i;
        }
      }
    }
    return n;
  }
}
