import { getContent, type BiomeDef, type RoomTemplate } from '@ao/content';
import type { Rng } from '@ao/shared';
import { bfs } from './grid';
import type { Layout } from './layout-bsp';
import type { Roles } from './roles';
import { Tile } from './tiles';
import type { PropInfo, RoomType, SpawnInfo } from './types';

interface Stamp {
  spawnHints: number[];
  features: number[];
  template: string;
}

/** Walkable for connectivity purposes (spikes are props on floor, so floor stays floor). */
const walk = (t: number) => t === Tile.Floor || t === Tile.Door;

/**
 * Stamp an interior template into a room if it fits and keeps every walkable interior cell
 * connected to the room's doors. Returns the template's hint cells.
 */
function stampRoom(
  rng: Rng,
  l: Layout,
  ri: number,
  type: RoomType,
  props: PropInfo[],
  blockedProp: Uint8Array,
): Stamp {
  const { w, tiles } = l;
  const r = l.rooms[ri]!.rect;
  const cands = getContent().rooms.filter(
    (t) => t.types.includes(type) && t.rows[0]!.length <= r.w - 2 && t.rows.length <= r.h - 2,
  );
  const order: RoomTemplate[] = [];
  const pool = [...cands];
  while (pool.length) {
    const i = rng.weightedIndex(pool.map((t) => t.weight));
    order.push(pool.splice(i, 1)[0]!);
  }
  for (const tpl of order) {
    const th = tpl.rows.length;
    const tw = tpl.rows[0]!.length;
    const ox = r.x + Math.floor((r.w - tw) / 2);
    const oy = r.y + Math.floor((r.h - th) / 2);
    const saved = tiles.slice();
    const newProps: PropInfo[] = [];
    const hints: number[] = [];
    const features: number[] = [];
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const ch = tpl.rows[y]![x]!;
        const i = (oy + y) * w + ox + x;
        switch (ch) {
          case '#':
            tiles[i] = Tile.Wall;
            break;
          case 'P':
            tiles[i] = Tile.Wall;
            newProps.push({ kind: 'pillar', x: ox + x, y: oy + y, room: ri });
            break;
          case 'O':
            tiles[i] = Tile.Pit;
            break;
          case 'S':
            newProps.push({ kind: 'spikes', x: ox + x, y: oy + y, room: ri });
            break;
          case 'b':
            newProps.push({ kind: 'bones', x: ox + x, y: oy + y, room: ri });
            break;
          case 'e':
            hints.push(i);
            break;
          case 'c':
            features.push(i);
            break;
          default:
            break;
        }
      }
    }
    if (roomConnected(l, ri)) {
      for (const p of newProps) {
        props.push(p);
        if (p.kind === 'spikes') blockedProp[p.y * w + p.x] = 1;
      }
      return { spawnHints: hints, features, template: tpl.id };
    }
    tiles.set(saved);
  }
  return { spawnHints: [], features: [], template: 'empty' };
}

/** All walkable interior cells reachable from the first door of the room. */
function roomConnected(l: Layout, ri: number): boolean {
  const { w, h, tiles } = l;
  const r = l.rooms[ri]!.rect;
  const doorCells = l.doors.filter((d) => d.room === ri).flatMap((d) => d.cells);
  if (doorCells.length === 0) return false;
  const inside = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  };
  const dist = bfs(
    w,
    h,
    [doorCells[0]!],
    (i) => walk(tiles[i]!) && (inside(i) || doorCells.includes(i)),
  );
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = y * w + x;
      if (walk(tiles[i]!) && dist[i] === -1) return false;
    }
  }
  for (const d of doorCells) if (dist[d] === -1) return false;
  return true;
}

export interface Populated {
  props: PropInfo[];
  spawns: SpawnInfo[];
  templates: string[];
}

export function populate(
  rng: Rng,
  l: Layout,
  roles: Roles,
  biome: BiomeDef,
  depth: number,
): Populated {
  const { w, tiles } = l;
  const props: PropInfo[] = [];
  const spawns: SpawnInfo[] = [];
  const templates: string[] = [];
  const blockedProp = new Uint8Array(w * l.h);

  l.rooms.forEach((room, ri) => {
    const type = roles.types[ri]!;
    const r = room.rect;
    const stamp = stampRoom(rng, l, ri, type, props, blockedProp);
    templates.push(stamp.template);
    const doorCells = l.doors.filter((d) => d.room === ri).flatMap((d) => d.cells);
    const nearDoor = (i: number, d: number) => {
      const x = i % w;
      const y = (i - x) / w;
      return doorCells.some(
        (c) => Math.abs((c % w) - x) <= d && Math.abs(Math.floor(c / w) - y) <= d,
      );
    };
    const center = (r.y + (r.h >> 1)) * w + r.x + (r.w >> 1);
    const freeCells: number[] = [];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * w + x;
        if (tiles[i] === Tile.Floor && !blockedProp[i]) freeCells.push(i);
      }
    }
    const takeCell = (pref: number[], minDoorDist: number): number => {
      for (const i of pref) {
        if (tiles[i] === Tile.Floor && !blockedProp[i] && !nearDoor(i, minDoorDist)) {
          blockedProp[i] = 1;
          return i;
        }
      }
      const opts = freeCells.filter((i) => !blockedProp[i] && !nearDoor(i, minDoorDist));
      const list = opts.length ? opts : freeCells.filter((i) => !blockedProp[i]);
      if (!list.length) return -1;
      const i = rng.pick(list);
      blockedProp[i] = 1;
      return i;
    };
    const feature = () => {
      const c = stamp.features.length ? stamp.features : [center];
      return takeCell(c, 1);
    };

    // Random spike cluster in some combat rooms (2×2, away from doors).
    if (
      (type === 'combat' || type === 'key') &&
      stamp.template === 'empty' &&
      rng.chance(biome.spikeChance)
    ) {
      const opts = freeCells.filter((i) => !nearDoor(i, 3));
      if (opts.length) {
        const c = rng.pick(opts);
        for (const d of [0, 1, w, w + 1]) {
          const i = c + d;
          if (tiles[i] === Tile.Floor && !blockedProp[i]) {
            props.push({ kind: 'spikes', x: i % w, y: Math.floor(i / w), room: ri });
            blockedProp[i] = 1;
          }
        }
      }
    }

    const pickEnemy = () => {
      const pool = biome.enemies.filter((e) => (e.minDepth ?? 0) <= depth);
      return pool[rng.weightedIndex(pool.map((e) => e.weight))]!.id;
    };
    const addSpawn = (enemy: string, wave: number, pref: number[]) => {
      const i = takeCell(pref, 3);
      if (i >= 0) spawns.push({ room: ri, wave, enemy, x: i % w, y: Math.floor(i / w) });
    };

    switch (type) {
      case 'combat':
      case 'key': {
        const waves = depth === 0 ? rng.int(1, 2) : depth === 1 ? 2 : rng.int(2, 3);
        const count = Math.max(3, Math.min(8, Math.round((r.w * r.h) / 30) + depth));
        for (let wv = 0; wv < waves; wv++) {
          for (let k = 0; k < count - (wv === 0 ? 0 : 1); k++)
            addSpawn(pickEnemy(), wv, stamp.spawnHints);
          // Free the cells for the next wave (enemies of wave 0 will have moved).
          for (const s of spawns)
            if (s.room === ri && s.wave === wv) blockedProp[s.y * w + s.x] = 0;
        }
        break;
      }
      case 'miniboss': {
        const mb = rng.pick(biome.minibosses);
        addSpawn(mb, 0, stamp.features.length ? stamp.features : [center]);
        addSpawn(pickEnemy(), 0, stamp.spawnHints);
        addSpawn(pickEnemy(), 0, stamp.spawnHints);
        if (roles.last === ri) {
          const i = feature();
          if (i >= 0) props.push({ kind: 'stairs', x: i % w, y: Math.floor(i / w), room: ri });
        }
        break;
      }
      case 'boss': {
        addSpawn(rng.pick(biome.bosses), 0, stamp.features.length ? stamp.features : [center]);
        break;
      }
      case 'treasure': {
        const i = feature();
        if (i >= 0) props.push({ kind: 'chest', x: i % w, y: Math.floor(i / w), room: ri, v: 2 });
        break;
      }
      case 'shop': {
        const spots = stamp.features.length >= 3 ? stamp.features.slice(0, 3) : [];
        for (let s = 0; s < 3; s++) {
          const i = spots[s] !== undefined ? takeCell([spots[s]!], 1) : takeCell([], 1);
          if (i >= 0) props.push({ kind: 'shop', x: i % w, y: Math.floor(i / w), room: ri, v: s });
        }
        break;
      }
      default:
        break;
    }

    // Decor (cosmetic only): torches on the top wall, cobwebs in corners, scattered bones.
    if (biome.torchSpacing > 0) {
      const off = rng.int(1, biome.torchSpacing);
      for (let x = r.x + off; x < r.x + r.w - 1; x += biome.torchSpacing) {
        const wy = r.y - 1;
        const i = wy * w + x;
        if (tiles[i] === Tile.Wall && tiles[i + w] === Tile.Floor)
          props.push({ kind: 'torch', x, y: wy, room: ri });
      }
    }
    const cob = biome.decor.cobweb ?? 0;
    if (rng.chance(cob) && tiles[r.y * w + r.x] === Tile.Floor)
      props.push({ kind: 'cobweb', x: r.x, y: r.y, room: ri });
    for (const kind of ['bones', 'skull', 'rubble'] as const) {
      const p = biome.decor[kind] ?? 0;
      for (const i of freeCells) {
        if (!blockedProp[i] && rng.chance(p))
          props.push({ kind, x: i % w, y: Math.floor(i / w), room: ri });
      }
    }
  });
  return { props, spawns, templates };
}
