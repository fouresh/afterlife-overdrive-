import { generateFloor } from '@ao/procgen';
import { makeSimPlayer } from '../player';
import { createWorld, type ShopSlot, type World } from '../world';
import type { NetPlayerInfo, RunInfo } from './protocol';

/**
 * Client: an empty World for a networked floor. The map comes from the seed (identical to the
 * server's), entities and dynamic state arrive in snapshots.
 */
export function createMirrorWorld(
  run: RunInfo,
  depth: number,
  players: NetPlayerInfo[],
  shop: ShopSlot[],
): World {
  const floor = generateFloor({ seed: run.seed, biome: run.biome, depth, floors: run.floors });
  const w = createWorld(floor, floor.seed, {
    runSeed: run.seed,
    depth,
    floors: run.floors,
    playerCount: players.length,
  });
  w.shop = shop.map((s) => ({ ...s }));
  for (const info of [...players].sort((a, b) => a.index - b.index)) {
    w.players.push(
      makeSimPlayer(w, info.index, 0, { loadout: info.loadout, hardcore: info.hardcore }),
    );
  }
  return w;
}
