import { generateFloor } from '@ao/procgen';
import { addPlayer, type PlayerSetup } from './player';
import { initFloorEntities } from './rooms';
import { createWorld, type World } from './world';

export interface RunConfig {
  seed: number;
  biome: string;
  floors: number;
}

/** Build the world for floor `depth` of a run, with players carried over from the last floor. */
export function createFloorWorld(cfg: RunConfig, depth: number, players: PlayerSetup[]): World {
  const floor = generateFloor({ seed: cfg.seed, biome: cfg.biome, depth, floors: cfg.floors });
  const w = createWorld(floor, floor.seed, {
    runSeed: cfg.seed,
    depth,
    floors: cfg.floors,
    playerCount: players.length,
  });
  initFloorEntities(w);
  for (const p of players) addPlayer(w, p);
  return w;
}

/** Snapshot what each player carries to the next floor. */
export function carryOut(w: World): PlayerSetup[] {
  return w.players.map((p) => ({
    loadout: p.loadout,
    bag: p.bag,
    gold: p.gold,
    potions: p.potions,
    hp: w.e.hp[p.ent]!,
    dropCount: p.dropCount,
    xp: p.xp,
    kills: p.kills,
  }));
}
