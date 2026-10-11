import { TF, Tile } from '@ao/procgen';
import { TILE, emptyInput } from '@ao/shared';
import { describe, expect, it } from 'vitest';
import {
  Kind,
  PickupKind,
  createFloorWorld,
  damageEnemy,
  emptyLoadout,
  starterItem,
  step,
  tileFlags,
} from './index';

describe('room activation', () => {
  it('pulls teammates next to the leader without putting them inside a wall', () => {
    const loadout = emptyLoadout();
    loadout.weapon = starterItem('sword.rusty');
    const w = createFloorWorld({ seed: 99, biome: 'crypt', floors: 3 }, 0, [
      { loadout },
      { loadout: emptyLoadout() },
    ]);
    const room = w.floor.rooms.find((r) => r.type === 'combat')!;
    // An open 3×3 patch well inside the room (pillars and pits are common in the middle).
    let cx = -1;
    let cy = -1;
    for (let y = room.rect.y + 2; y < room.rect.y + room.rect.h - 2 && cx < 0; y++) {
      for (let x = room.rect.x + 2; x < room.rect.x + room.rect.w - 2 && cx < 0; x++) {
        let open = true;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (w.map.tiles[(y + dy) * w.map.w + x + dx] !== Tile.Floor) open = false;
        if (open) {
          cx = x;
          cy = y;
        }
      }
    }
    expect(cx).toBeGreaterThan(0);
    // A wall (or tree) right next to the leader: the old "+6 px to the right" spot is inside it.
    w.map.tiles[cy * w.map.w + cx + 1] = Tile.Wall;
    const [leader, mate] = w.players;
    w.e.x[leader!.ent] = (cx + 1) * TILE - 3;
    w.e.y[leader!.ent] = (cy + 0.5) * TILE;
    step(w, [emptyInput(), emptyInput()]);
    expect(w.rooms[w.floor.rooms.indexOf(room)]!.state).toBe(1);
    const mx = w.e.x[mate!.ent]!;
    const my = w.e.y[mate!.ent]!;
    expect(Math.abs(mx - w.e.x[leader!.ent]!)).toBeLessThan(TILE);
    expect(tileFlags(w.map, Math.floor(mx / TILE), Math.floor(my / TILE)) & TF.BlockWalk).toBe(0);
  });

  it('drops the key on reachable floor even when the room centre is a pit', () => {
    const loadout = emptyLoadout();
    loadout.weapon = starterItem('sword.rusty');
    let w = createFloorWorld({ seed: 1, biome: 'crypt', floors: 3 }, 0, [{ loadout }]);
    for (let seed = 1; w.floor.keyRoom < 0 && seed < 80; seed++)
      w = createFloorWorld({ seed, biome: 'crypt', floors: 3 }, 0, [{ loadout }]);
    const ri = w.floor.keyRoom;
    expect(ri).toBeGreaterThanOrEqual(0);
    const room = w.floor.rooms[ri]!.rect;
    const cx = room.x + (room.w >> 1);
    const cy = room.y + (room.h >> 1);
    // A 3×3 pit under the centre: nobody can stand within pickup range of its middle.
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) w.map.tiles[(cy + dy) * w.map.w + cx + dx] = Tile.Pit;
    // Walk in, fight, clear (enemies die the moment they spawn).
    const e = w.e;
    const p = w.players[0]!;
    e.hp[p.ent] = e.maxHp[p.ent] = 1e6;
    let placed = false;
    for (let y = room.y + 1; y < room.y + room.h - 1 && !placed; y++) {
      for (let x = room.x + 1; x < room.x + room.w - 1 && !placed; x++) {
        if (w.map.tiles[y * w.map.w + x] !== Tile.Floor) continue;
        e.x[p.ent] = e.px[p.ent] = (x + 0.5) * TILE;
        e.y[p.ent] = e.py[p.ent] = (y + 0.5) * TILE;
        placed = true;
      }
    }
    expect(placed).toBe(true);
    for (let t = 0; t < 600 && w.rooms[ri]!.state !== 2; t++) {
      step(w, [emptyInput()]);
      for (let i = 0; i < e.hi; i++)
        if (e.alive[i] && e.kind[i] === Kind.Enemy && e.room[i] === ri)
          damageEnemy(w, i, 1e6, e.x[i]!, e.y[i]!, 0, 0);
    }
    expect(w.rooms[ri]!.state).toBe(2);
    for (let t = 0; t < 90; t++) step(w, [emptyInput()]);
    let key = -1;
    for (let i = 0; i < e.hi; i++)
      if (e.alive[i] && e.kind[i] === Kind.Pickup && e.def[i] === PickupKind.Key) key = i;
    expect(key).toBeGreaterThanOrEqual(0);
    const tx = Math.floor(e.x[key]! / TILE);
    const ty = Math.floor(e.y[key]! / TILE);
    expect(tileFlags(w.map, tx, ty) & TF.BlockWalk).toBe(0);
  });
});
