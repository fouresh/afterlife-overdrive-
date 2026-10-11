import { TF, Tile } from '@ao/procgen';
import { TILE, deriveSeed } from '@ao/shared';
import { EF, Kind, PickupKind, PropKind } from './entities';
import { Ev } from './events';
import { itemValue, rollItem, rollRarity } from './items';
import { spawnEnemy, spawnPickup, spawnProp } from './spawn';
import { Rng } from '@ao/shared';
import type { World } from './world';

/** Create entities for interactive floor props (chests, stairs, shop pedestals, spikes). */
export function initFloorEntities(w: World): void {
  const f = w.floor;
  for (const p of f.props) {
    switch (p.kind) {
      case 'chest':
        spawnProp(w, PropKind.Chest, p.x, p.y, p.v ?? 1, p.room);
        break;
      case 'stairs':
        spawnProp(w, PropKind.Stairs, p.x, p.y, -1, p.room);
        break;
      case 'station':
        spawnProp(w, PropKind.Station, p.x, p.y, p.v ?? 0, p.room);
        break;
      case 'spikes':
        spawnProp(w, PropKind.Spikes, p.x, p.y, (p.x * 7 + p.y * 3) % 24, p.room);
        break;
      case 'shop': {
        const slot = p.v ?? 0;
        const rng = new Rng(deriveSeed(w.runSeed, 'shop', w.depth, slot));
        if (slot === 0) {
          w.shop.push({ item: null, potion: true, price: 25 + w.depth * 10, sold: false });
        } else {
          const rarity = Math.max(1, rollRarity(rng, w.depth, 0.6));
          const item = rollItem(
            rng.nextU32(),
            1 + w.depth * 2 + 1,
            rarity,
            undefined,
            `s${w.runSeed.toString(36)}-${w.depth}-${slot}`,
          );
          w.shop.push({ item, potion: false, price: itemValue(item) * 4, sold: false });
        }
        spawnProp(w, PropKind.Shop, p.x, p.y, w.shop.length - 1, p.room);
        break;
      }
      default:
        break;
    }
  }
}

function closeDoors(w: World, room: number): void {
  const m = w.map;
  const e = w.e;
  for (const d of w.floor.doors) {
    if (d.room !== room || m.tiles[d.y * m.w + d.x] !== Tile.Door) continue;
    m.dyn[d.y * m.w + d.x] = TF.BlockWalk | TF.BlockShot;
    // Push anyone standing in the doorway into the room.
    for (const p of w.players) {
      if (p.gone) continue;
      const tx = Math.floor(e.x[p.ent]! / TILE);
      const ty = Math.floor(e.y[p.ent]! / TILE);
      const near = Math.abs(tx - d.x) <= 0 && Math.abs(ty - d.y) <= 0;
      if (!near) continue;
      const r = w.floor.rooms[room]!.rect;
      const cx = Math.min(Math.max(d.x, r.x), r.x + r.w - 1);
      const cy = Math.min(Math.max(d.y, r.y), r.y + r.h - 1);
      e.x[p.ent] = (cx + 0.5) * TILE;
      e.y[p.ent] = (cy + 0.5) * TILE;
      e.px[p.ent] = e.x[p.ent]!;
      e.py[p.ent] = e.y[p.ent]!;
    }
  }
}

function openDoors(w: World, room: number): void {
  const m = w.map;
  for (const d of w.floor.doors) if (d.room === room) m.dyn[d.y * m.w + d.x] = 0;
}

function spawnWave(w: World, room: number, wave: number): number {
  let n = 0;
  for (const s of w.floor.spawns) {
    if (s.room !== room || s.wave !== wave) continue;
    const def = w.content.enemyIndex.get(s.enemy);
    if (def === undefined) continue;
    if (spawnEnemy(w, def, (s.x + 0.5) * TILE, (s.y + 0.5) * TILE, room) >= 0) n++;
  }
  return n;
}

function activate(w: World, room: number, by: number): void {
  const rs = w.rooms[room]!;
  rs.state = 1;
  rs.wave = 0;
  closeDoors(w, room);
  // Co-op: teammates elsewhere are pulled into the fight.
  const e = w.e;
  const r = w.floor.rooms[room]!.rect;
  for (const p of w.players) {
    if (p.dead || p.index === by) continue;
    const tx = Math.floor(e.x[p.ent]! / TILE);
    const ty = Math.floor(e.y[p.ent]! / TILE);
    if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) continue;
    const leader = w.players[by]!;
    e.x[p.ent] = e.x[leader.ent]! + 6;
    e.y[p.ent] = e.y[leader.ent]!;
    e.px[p.ent] = e.x[p.ent]!;
    e.py[p.ent] = e.y[p.ent]!;
  }
  w.events.push(Ev.DoorsClose, (r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE, room);
  if (spawnWave(w, room, 0) === 0) clear(w, room);
}

function clear(w: World, room: number): void {
  const rs = w.rooms[room]!;
  rs.state = 2;
  openDoors(w, room);
  const r = w.floor.rooms[room]!.rect;
  const cx = (r.x + r.w / 2) * TILE;
  const cy = (r.y + r.h / 2) * TILE;
  w.events.push(Ev.DoorsOpen, cx, cy, room);
  w.events.push(Ev.RoomCleared, cx, cy, room);
  if (room === w.floor.keyRoom)
    spawnPickup(w, PickupKind.Key, cx, cy, { item: null, amount: 1, owner: -1 });
  if (room === w.floor.lastRoom) {
    if (w.floor.isLast) {
      const ex = Math.floor(cx / TILE);
      const ey = Math.floor(cy / TILE);
      spawnProp(w, PropKind.Portal, ex, ey, -1, room);
    } else {
      w.stairsOpen = true;
    }
    return;
  }
  for (const p of w.players) {
    if (p.dead) continue;
    if (w.rng.chance(0.25))
      spawnPickup(w, PickupKind.Potion, cx, cy, { item: null, amount: 1, owner: p.index });
    if (w.rng.chance(0.08)) {
      // Rare bonus item for clearing a room.
      spawnPickup(w, PickupKind.Gold, cx, cy, {
        item: null,
        amount: 5 + w.depth * 3,
        owner: p.index,
      });
    }
  }
}

export function updateRooms(w: World): void {
  const e = w.e;
  const f = w.floor;
  for (const p of w.players) {
    if (p.dead) continue;
    const tx = Math.floor(e.x[p.ent]! / TILE);
    const ty = Math.floor(e.y[p.ent]! / TILE);
    if (tx < 0 || ty < 0 || tx >= f.w || ty >= f.h) continue;
    const room = f.roomOf[ty * f.w + tx]! - 1;
    if (room < 0) continue;
    const rs = w.rooms[room]!;
    rs.visited = true;
    if (rs.state !== 0) continue;
    const info = f.rooms[room]!;
    if (!info.lockOnEnter) {
      rs.state = 2;
      continue;
    }
    // Activate once the player is at least one tile inside (not in the doorway).
    const r = info.rect;
    const inX = e.x[p.ent]! > (r.x + 0.7) * TILE && e.x[p.ent]! < (r.x + r.w - 0.7) * TILE;
    const inY = e.y[p.ent]! > (r.y + 0.8) * TILE && e.y[p.ent]! < (r.y + r.h - 0.6) * TILE;
    if (inX && inY) activate(w, room, p.index);
  }
  for (let room = 0; room < w.rooms.length; room++) {
    const rs = w.rooms[room]!;
    if (rs.state !== 1 || rs.alive > 0) continue;
    if (rs.waveDelay > 0) {
      if (--rs.waveDelay === 0) {
        if (spawnWave(w, room, rs.wave) === 0) clear(w, room);
      }
      continue;
    }
    const next = rs.wave + 1;
    if (f.spawns.some((s) => s.room === room && s.wave === next)) {
      rs.wave = next;
      rs.waveDelay = 24;
    } else clear(w, room);
  }
}

/** True when an entity counts as a live enemy (for HUD/debug). */
export function isLiveEnemy(w: World, i: number): boolean {
  return !!w.e.alive[i] && w.e.kind[i] === Kind.Enemy && !(w.e.flags[i]! & EF.Dying);
}
