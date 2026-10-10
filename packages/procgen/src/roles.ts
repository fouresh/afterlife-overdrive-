import type { Rng } from '@ao/shared';
import type { Layout } from './layout-bsp';
import { Tile } from './tiles';
import type { RoomType } from './types';

export interface RoomGraph {
  /** Neighbor room sets (via corridor components). */
  adj: Set<number>[];
  /** Corridor component id per tile (-1 = not a corridor floor). */
  corridorOf: Int32Array;
}

/**
 * Build the *actual* room graph from the carved tiles: corridors may merge or cross, so we flood
 * fill corridor components and connect all rooms whose doors touch the same component.
 */
export function buildGraph(l: Layout): RoomGraph {
  const { w, h, tiles } = l;
  const inRoom = new Uint8Array(w * h);
  for (const r of l.rooms) {
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++) {
      for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) inRoom[y * w + x] = 1;
    }
  }
  const comp = new Int32Array(w * h).fill(-1);
  let n = 0;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (tiles[i] !== Tile.Floor || inRoom[i] || comp[i] !== -1) continue;
    comp[i] = n;
    stack.push(i);
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % w;
      for (const nb of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w]) {
        if (nb < 0 || nb >= w * h) continue;
        if (tiles[nb] === Tile.Floor && !inRoom[nb] && comp[nb] === -1) {
          comp[nb] = n;
          stack.push(nb);
        }
      }
    }
    n++;
  }
  const roomsOfComp: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (const d of l.doors) {
    for (const cell of d.cells) {
      const x = cell % w;
      for (const nb of [x > 0 ? cell - 1 : -1, x < w - 1 ? cell + 1 : -1, cell - w, cell + w]) {
        if (nb >= 0 && nb < w * h && comp[nb]! >= 0) roomsOfComp[comp[nb]!]!.add(d.room);
      }
    }
  }
  const adj = l.rooms.map(() => new Set<number>());
  for (const set of roomsOfComp) {
    const list = [...set];
    for (const a of list) for (const b of list) if (a !== b) adj[a]!.add(b);
  }
  return { adj, corridorOf: comp };
}

export function roomDistances(adj: Set<number>[], from: number): number[] {
  const dist = adj.map(() => -1);
  dist[from] = 0;
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const nb of adj[c]!) {
      if (dist[nb] === -1) {
        dist[nb] = dist[c]! + 1;
        q.push(nb);
      }
    }
  }
  return dist;
}

export interface Roles {
  types: RoomType[];
  start: number;
  last: number;
  keyRoom: number;
  treasure: number;
  depth: number[];
}

/**
 * Assign room roles on the real graph:
 * start (a far leaf) → … → last room (farthest: miniboss+stairs, or boss on the final floor),
 * miniboss before the boss, a locked treasure leaf off the main path, a key room reachable
 * without the treasure, an optional shop, everything else = combat.
 */
export function assignRoles(rng: Rng, l: Layout, g: RoomGraph, isLast: boolean): Roles | null {
  const n = l.rooms.length;
  const deg = g.adj.map((s) => s.size);
  if (deg.some((d) => d === 0)) return null;
  const leaves = [...Array(n).keys()].filter((i) => deg[i] === 1);
  const pool = leaves.length >= 2 ? leaves : [...Array(n).keys()];
  // Start: the leaf with the largest eccentricity (makes the floor span the whole map).
  let start = pool[0]!;
  let bestEcc = -1;
  for (const i of rng.shuffle([...pool])) {
    const ecc = Math.max(...roomDistances(g.adj, i));
    if (ecc > bestEcc) {
      bestEcc = ecc;
      start = i;
    }
  }
  const dist = roomDistances(g.adj, start);
  if (dist.some((d) => d < 0)) return null;
  let last = start;
  for (let i = 0; i < n; i++) {
    const a = l.rooms[i]!.rect;
    const b = l.rooms[last]!.rect;
    if (dist[i]! > dist[last]! || (dist[i] === dist[last] && a.w * a.h > b.w * b.h)) last = i;
  }
  if (last === start || dist[last]! < 3) return null;

  // Main path via BFS parents.
  const onPath = new Set<number>();
  {
    const prev = new Map<number, number>();
    const q = [start];
    const seen = new Set([start]);
    while (q.length) {
      const c = q.shift()!;
      for (const nb of g.adj[c]!) {
        if (!seen.has(nb)) {
          seen.add(nb);
          prev.set(nb, c);
          q.push(nb);
        }
      }
    }
    for (let c: number | undefined = last; c !== undefined; c = prev.get(c)) onPath.add(c);
  }

  const types: RoomType[] = Array<RoomType>(n).fill('combat');
  types[start] = 'start';
  let miniboss = -1;
  if (isLast) {
    types[last] = 'boss';
    for (const nb of g.adj[last]!) {
      if (onPath.has(nb) && nb !== start) miniboss = nb;
    }
    if (miniboss >= 0) types[miniboss] = 'miniboss';
  } else {
    types[last] = 'miniboss';
  }

  const free = () => [...Array(n).keys()].filter((i) => types[i] === 'combat');
  const offPathLeaves = free().filter((i) => deg[i] === 1 && !onPath.has(i));

  let treasure = -1;
  if (offPathLeaves.length > 0) {
    treasure = rng.pick(offPathLeaves);
    types[treasure] = 'treasure';
  }
  // Key: prefer a far combat room off the main path (not behind the treasure: treasure is a leaf).
  let keyRoom = -1;
  if (treasure >= 0) {
    const cands = free().filter((i) => !onPath.has(i));
    const pick = (cands.length ? cands : free()).sort((a, b) => dist[b]! - dist[a]! || a - b);
    keyRoom = pick[0] ?? -1;
    if (keyRoom < 0) {
      types[treasure] = 'combat';
      treasure = -1;
    } else types[keyRoom] = 'key';
  }
  // Shop: an off-path leaf if possible, else any off-path room, else a main-path room
  // (never next to the start, so the first fight comes before shopping).
  const offLeaves = free().filter((i) => deg[i] === 1 && !onPath.has(i));
  const offAny = free().filter((i) => !onPath.has(i));
  const onMain = free().filter((i) => onPath.has(i) && !g.adj[start]!.has(i));
  const shopCands = offLeaves.length ? offLeaves : offAny.length ? offAny : onMain;
  if (shopCands.length > 0 && rng.chance(0.8)) types[rng.pick(shopCands)] = 'shop';

  return { types, start, last, keyRoom, treasure, depth: dist };
}
