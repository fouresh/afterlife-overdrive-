import { generateFloor } from '@ao/procgen';
import { addPlayer, type PlayerSetup } from './player';
import { initFloorEntities } from './rooms';
import { createWorld, type World } from './world';

export const DIFFICULTIES = {
  normal: { hp: 1, dmg: 1, lootBoost: 0, itemLevel: 0, minLevel: 1 },
  hard: { hp: 1.7, dmg: 1.35, lootBoost: 0.7, itemLevel: 3, minLevel: 5 },
  nightmare: { hp: 2.6, dmg: 1.8, lootBoost: 1.4, itemLevel: 6, minLevel: 10 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;

export interface RunConfig {
  seed: number;
  biome: string;
  floors: number;
  difficulty?: Difficulty;
}

/** Build the world for floor `depth` of a run, with players carried over from the last floor. */
export function createFloorWorld(cfg: RunConfig, depth: number, players: PlayerSetup[]): World {
  const floor = generateFloor({ seed: cfg.seed, biome: cfg.biome, depth, floors: cfg.floors });
  const diff = DIFFICULTIES[cfg.difficulty ?? 'normal'];
  const w = createWorld(floor, floor.seed, {
    runSeed: cfg.seed,
    depth,
    floors: cfg.floors,
    playerCount: players.length,
  });
  w.enemyHpMul *= diff.hp;
  w.enemyDmgMul *= diff.dmg;
  w.lootBoost = diff.lootBoost;
  w.itemLevelBonus = diff.itemLevel;
  for (const p of players) addPlayer(w, p);
  // After players: shop stock uses the player's level.
  initFloorEntities(w);
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
    progress: p.progress,
    killsBy: p.killsBy,
    chests: p.chests,
  }));
}
