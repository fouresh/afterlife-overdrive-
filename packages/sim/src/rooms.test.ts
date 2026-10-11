import { TF, Tile } from '@ao/procgen';
import { TILE, emptyInput } from '@ao/shared';
import { describe, expect, it } from 'vitest';
import { createFloorWorld, emptyLoadout, starterItem, step, tileFlags } from './index';

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
});
