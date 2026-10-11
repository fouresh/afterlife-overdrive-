import type { Rng } from '@ao/shared';
import { astar, inRect } from './grid';
import { Tile } from './tiles';
import type { Rect } from './types';

/**
 * Crypt/castle layout: BSP partition → one rectangular room per leaf → rooms in adjacent leaves
 * are candidate connections → random spanning tree (+ a few loops) → corridors routed with A*
 * through the space between rooms, 2 tiles wide, entering rooms only through doorways.
 */
export interface LayoutRoom {
  rect: Rect;
  leaf: Rect;
}

export interface LayoutDoor {
  /** The 2 door tiles (index into the tile array). */
  cells: [number, number];
  room: number;
}

export interface Layout {
  w: number;
  h: number;
  tiles: Uint8Array;
  rooms: LayoutRoom[];
  doors: LayoutDoor[];
}

// Leaves (and so rooms) are sized for a ~17×37-tile landscape view: a room should give room to
// dodge, not fit on one screen with space to spare.
const MIN_LEAF_W = 22;
const MIN_LEAF_H = 18;
const MIN_ROOM_W = 12;
const MIN_ROOM_H = 10;
/** Unsplit big leaves would otherwise make empty barns several screens wide. */
const MAX_ROOM_W = 26;
const MAX_ROOM_H = 20;
const MARGIN = 3;

function splitLeaves(rng: Rng, w: number, h: number, target: number): Rect[] {
  const leaves: Rect[] = [{ x: 0, y: 0, w, h }];
  for (let guard = 0; leaves.length < target && guard < 200; guard++) {
    // Split the largest splittable leaf.
    let best = -1;
    let bestArea = 0;
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i]!;
      const can = l.w >= MIN_LEAF_W * 2 || l.h >= MIN_LEAF_H * 2;
      if (can && l.w * l.h > bestArea) {
        bestArea = l.w * l.h;
        best = i;
      }
    }
    if (best === -1) break;
    const l = leaves[best]!;
    const canV = l.w >= MIN_LEAF_W * 2;
    const canH = l.h >= MIN_LEAF_H * 2;
    let vertical: boolean;
    if (canV && !canH) vertical = true;
    else if (canH && !canV) vertical = false;
    else if (l.w / l.h > 1.2) vertical = true;
    else if (l.h / l.w > 1.2) vertical = false;
    else vertical = rng.chance(0.5);
    if (vertical) {
      const cut = rng.int(MIN_LEAF_W, l.w - MIN_LEAF_W);
      leaves.splice(
        best,
        1,
        { x: l.x, y: l.y, w: cut, h: l.h },
        { x: l.x + cut, y: l.y, w: l.w - cut, h: l.h },
      );
    } else {
      const cut = rng.int(MIN_LEAF_H, l.h - MIN_LEAF_H);
      leaves.splice(
        best,
        1,
        { x: l.x, y: l.y, w: l.w, h: cut },
        { x: l.x, y: l.y + cut, w: l.w, h: l.h - cut },
      );
    }
  }
  return leaves;
}

/** Shared border between two leaves: 'h' = side by side (vertical border), 'v' = stacked. */
function adjacency(a: Rect, b: Rect): 'h' | 'v' | null {
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if ((a.x + a.w === b.x || b.x + b.w === a.x) && overlapY >= 4) return 'h';
  if ((a.y + a.h === b.y || b.y + b.h === a.y) && overlapX >= 4) return 'v';
  return null;
}

export function bspLayout(rng: Rng, roomTarget: number): Layout | null {
  const area = roomTarget * 520;
  const w = Math.round(Math.sqrt(area * 1.35));
  const h = Math.round(area / w);
  const leaves = splitLeaves(rng, w, h, roomTarget);
  if (leaves.length < Math.max(5, roomTarget - 2)) return null;

  const tiles = new Uint8Array(w * h).fill(Tile.Wall);
  const rooms: LayoutRoom[] = leaves.map((leaf) => {
    const maxW = Math.min(MAX_ROOM_W, leaf.w - MARGIN * 2);
    const maxH = Math.min(MAX_ROOM_H, leaf.h - MARGIN * 2);
    const rw = Math.max(MIN_ROOM_W, maxW - rng.int(0, Math.min(4, maxW - MIN_ROOM_W)));
    const rh = Math.max(MIN_ROOM_H, maxH - rng.int(0, Math.min(4, maxH - MIN_ROOM_H)));
    const rx = leaf.x + MARGIN + rng.int(0, maxW - rw);
    const ry = leaf.y + MARGIN + rng.int(0, maxH - rh);
    return { leaf, rect: { x: rx, y: ry, w: rw, h: rh } };
  });
  for (const r of rooms) {
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++) {
      for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) tiles[y * w + x] = Tile.Floor;
    }
  }

  // Candidate edges between rooms in adjacent leaves, random spanning tree (Kruskal) + loops.
  const cand: { a: number; b: number; dir: 'h' | 'v'; k: number }[] = [];
  for (let a = 0; a < rooms.length; a++) {
    for (let b = a + 1; b < rooms.length; b++) {
      const dir = adjacency(rooms[a]!.leaf, rooms[b]!.leaf);
      if (dir) cand.push({ a, b, dir, k: rng.next() });
    }
  }
  cand.sort((x, y) => x.k - y.k);
  const parent = rooms.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const tree: typeof cand = [];
  const extra: typeof cand = [];
  for (const c of cand) {
    const ra = find(c.a);
    const rb = find(c.b);
    if (ra !== rb) {
      parent[ra] = rb;
      tree.push(c);
    } else extra.push(c);
  }
  if (tree.length !== rooms.length - 1) return null;
  const loops = extra.filter(() => rng.chance(0.18)).slice(0, 2);

  // Anchors whose 2×2 corridor brush would touch a room or its wall ring are blocked.
  const blocked = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let b = x < 1 || y < 1 || x + 1 >= w - 1 || y + 1 >= h - 1 ? 1 : 0;
      if (!b) {
        for (const r of rooms) {
          if (
            inRect(r.rect, x, y, 1) ||
            inRect(r.rect, x + 1, y, 1) ||
            inRect(r.rect, x, y + 1, 1) ||
            inRect(r.rect, x + 1, y + 1, 1)
          ) {
            b = 1;
            break;
          }
        }
      }
      blocked[y * w + x] = b;
    }
  }

  const doors: LayoutDoor[] = [];
  const carve = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const c = (y + dy) * w + x + dx;
      if (tiles[c] === Tile.Wall) tiles[c] = Tile.Floor;
    }
  };

  /** Door on room `ri`'s side facing direction (sx, sy). Returns stub anchor + door cells. */
  const makeDoor = (ri: number, sx: number, sy: number, along: number) => {
    const r = rooms[ri]!.rect;
    let doorA: number;
    let doorB: number;
    let stub: number;
    if (sx !== 0) {
      const y = Math.min(Math.max(along, r.y + 1), r.y + r.h - 3);
      const x = sx > 0 ? r.x + r.w : r.x - 1;
      doorA = y * w + x;
      doorB = (y + 1) * w + x;
      stub = y * w + (sx > 0 ? x + 1 : x - 2);
    } else {
      const x = Math.min(Math.max(along, r.x + 1), r.x + r.w - 3);
      const y = sy > 0 ? r.y + r.h : r.y - 1;
      doorA = y * w + x;
      doorB = y * w + x + 1;
      stub = (sy > 0 ? y + 1 : y - 2) * w + x;
    }
    return { doorA, doorB, stub };
  };

  const connect = (c: (typeof cand)[number]): boolean => {
    const A = rooms[c.a]!;
    const B = rooms[c.b]!;
    let sa: [number, number];
    let alongA: number;
    let alongB: number;
    if (c.dir === 'h') {
      const aLeft = A.leaf.x < B.leaf.x;
      sa = aLeft ? [1, 0] : [-1, 0];
      const lo = Math.max(A.rect.y, B.rect.y) + 1;
      const hi = Math.min(A.rect.y + A.rect.h, B.rect.y + B.rect.h) - 3;
      const shared = hi >= lo ? rng.int(lo, hi) : -1;
      alongA = shared >= 0 ? shared : rng.int(A.rect.y + 1, A.rect.y + A.rect.h - 3);
      alongB = shared >= 0 ? shared : rng.int(B.rect.y + 1, B.rect.y + B.rect.h - 3);
    } else {
      const aTop = A.leaf.y < B.leaf.y;
      sa = aTop ? [0, 1] : [0, -1];
      const lo = Math.max(A.rect.x, B.rect.x) + 1;
      const hi = Math.min(A.rect.x + A.rect.w, B.rect.x + B.rect.w) - 3;
      const shared = hi >= lo ? rng.int(lo, hi) : -1;
      alongA = shared >= 0 ? shared : rng.int(A.rect.x + 1, A.rect.x + A.rect.w - 3);
      alongB = shared >= 0 ? shared : rng.int(B.rect.x + 1, B.rect.x + B.rect.w - 3);
    }
    const da = makeDoor(c.a, sa[0], sa[1], alongA);
    const db = makeDoor(c.b, -sa[0], -sa[1], alongB);
    const save = [blocked[da.stub]!, blocked[db.stub]!];
    blocked[da.stub] = 0;
    blocked[db.stub] = 0;
    const path = astar(w, h, blocked, da.stub, db.stub);
    blocked[da.stub] = save[0]!;
    blocked[db.stub] = save[1]!;
    if (!path) return false;
    for (const i of path) carve(i);
    tiles[da.doorA] = Tile.Door;
    tiles[da.doorB] = Tile.Door;
    tiles[db.doorA] = Tile.Door;
    tiles[db.doorB] = Tile.Door;
    doors.push(
      { cells: [da.doorA, da.doorB], room: c.a },
      { cells: [db.doorA, db.doorB], room: c.b },
    );
    return true;
  };

  for (const c of tree) if (!connect(c)) return null;
  for (const c of loops) connect(c);
  return { w, h, tiles, rooms, doors };
}
