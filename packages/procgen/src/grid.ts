import type { Rect } from './types';

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;
}

/** Small binary min-heap keyed by float priority, storing int payloads (no allocations per push). */
export class MinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
  }
  push(key: number, val: number): void {
    if (this.size >= this.keys.length) {
      const k = new Float64Array(this.keys.length * 2);
      k.set(this.keys);
      const v = new Int32Array(this.vals.length * 2);
      v.set(this.vals);
      this.keys = k;
      this.vals = v;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.keys[i] = this.keys[p]!;
      this.vals[i] = this.vals[p]!;
      i = p;
    }
    this.keys[i] = key;
    this.vals[i] = val;
  }
  pop(): number {
    const top = this.vals[0]!;
    const k = this.keys[--this.size]!;
    const v = this.vals[this.size]!;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1]! < this.keys[c]!) c++;
      if (this.keys[c]! >= k) break;
      this.keys[i] = this.keys[c]!;
      this.vals[i] = this.vals[c]!;
      i = c;
    }
    this.keys[i] = k;
    this.vals[i] = v;
    return top;
  }
}

/**
 * A* on a 4-connected grid. `blocked[i]` = 1 forbids a cell. Straight runs are preferred
 * (turn penalty) so corridors look built, not wandering. Returns cell indices start→goal or null.
 */
export function astar(
  w: number,
  h: number,
  blocked: Uint8Array,
  start: number,
  goal: number,
  turnPenalty = 0.6,
): number[] | null {
  const n = w * h;
  const g = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const dir = new Int8Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap(256);
  const gx = goal % w;
  const gy = Math.floor(goal / w);
  const hfn = (i: number) => Math.abs((i % w) - gx) + Math.abs(Math.floor(i / w) - gy);
  g[start] = 0;
  heap.push(hfn(start), start);
  const DX = [1, -1, 0, 0];
  const DY = [0, 0, 1, -1];
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d]!;
      const ny = cy + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (closed[ni] || (blocked[ni] && ni !== goal)) continue;
      const cost = g[cur]! + 1 + (dir[cur] !== -1 && dir[cur] !== d ? turnPenalty : 0);
      if (cost < g[ni]!) {
        g[ni] = cost;
        from[ni] = cur;
        dir[ni] = d;
        heap.push(cost + hfn(ni), ni);
      }
    }
  }
  if (from[goal] === -1 && goal !== start) return null;
  const path: number[] = [];
  for (let c = goal; c !== -1; c = from[c]!) {
    path.push(c);
    if (c === start) break;
  }
  return path.reverse();
}

/** BFS distances over a predicate; -1 = unreachable. */
export function bfs(
  w: number,
  h: number,
  starts: number[],
  passable: (i: number) => boolean,
): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const q = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const s of starts) {
    if (dist[s] === -1) {
      dist[s] = 0;
      q[tail++] = s;
    }
  }
  while (head < tail) {
    const c = q[head++]!;
    const x = c % w;
    const y = (c - x) / w;
    const d = dist[c]! + 1;
    if (x > 0 && dist[c - 1] === -1 && passable(c - 1)) {
      dist[c - 1] = d;
      q[tail++] = c - 1;
    }
    if (x < w - 1 && dist[c + 1] === -1 && passable(c + 1)) {
      dist[c + 1] = d;
      q[tail++] = c + 1;
    }
    if (y > 0 && dist[c - w] === -1 && passable(c - w)) {
      dist[c - w] = d;
      q[tail++] = c - w;
    }
    if (y < h - 1 && dist[c + w] === -1 && passable(c + w)) {
      dist[c + w] = d;
      q[tail++] = c + w;
    }
  }
  return dist;
}
