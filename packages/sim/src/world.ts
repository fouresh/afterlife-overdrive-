import { getContent, type Content } from '@ao/content';
import type { DungeonFloor } from '@ao/procgen';
import { Rng, TILE, deriveSeed, type PlayerInput } from '@ao/shared';
import type { CollisionMap } from './collide';
import { Entities } from './entities';
import { EventBuffer } from './events';
import { FlowField } from './flow';
import type { ItemInstance } from './items';
import { SpatialHash } from './spatial';
import { characterBonus, type Attributes } from './progression';
import { computeStats, type Loadout, type PlayerStats } from './stats';

export interface Buff {
  damagePct: number;
  attackSpeedPct: number;
  moveSpeedPct: number;
  ticks: number;
  color: number;
}

/** Character progression that affects stats (level, attributes, origin, elixir). */
export interface Progress {
  level: number;
  attrs: Attributes;
  origin: string;
  elixir: string | null;
}

export interface SimPlayer {
  index: number;
  ent: number;
  progress: Progress;
  /** Kills per enemy id (contracts) and chests opened during the run. */
  killsBy: Record<string, number>;
  chests: number;
  input: PlayerInput;
  prevButtons: number;
  loadout: Loadout;
  stats: PlayerStats;
  /** Bumped when the loadout changes (renderer rebuilds the paper-doll). */
  lookVersion: number;
  bag: ItemInstance[];
  gold: number;
  potions: number;
  xp: number;
  kills: number;
  /** Drops generated for this player so far (deterministic item seeds). */
  dropCount: number;
  attackCd: number;
  skillCd: [number, number];
  skillCdMax: [number, number];
  buffs: Buff[];
  shield: number;
  shieldT: number;
  dashCharges: number;
  dashRecharge: number;
  dashT: number;
  dashDx: number;
  dashDy: number;
  dashSpeed: number;
  /** Damage dealt to enemies crossed during a skill dash (0 = normal dash). */
  dashDamage: number;
  dashSeq: number;
  moving: boolean;
  aim: number;
  /** Ticks left of the current weapon swing (render). */
  swingT: number;
  swingMax: number;
  /** Nearest interactable entity (or -1) for the UI prompt. */
  interact: number;
  regenAcc: number;
  dead: boolean;
  deathT: number;
  /** Left the run (disconnected for good, surrendered or went home): entity removed. */
  gone: boolean;
  /** Hardcore heroes cannot be revived by allies. */
  hardcore: boolean;
  /** Revive progress while an ally holds Interact next to this (dead) player. */
  revive: number;
  /** Sum of active buff move speed (kept separately so the client can predict movement). */
  buffSpeed: number;
  /** Loot rng stream for this player. */
  lootRng: Rng;
}

export interface RoomState {
  /** 0 idle, 1 fighting, 2 cleared. */
  state: number;
  wave: number;
  alive: number;
  visited: boolean;
  /** Ticks until the next wave spawns (after the previous one died). */
  waveDelay: number;
}

export interface Drop {
  item: ItemInstance | null;
  amount: number;
  /** Player index that owns this drop (-1 = anyone). Loot is personal. */
  owner: number;
}

export interface ShopSlot {
  item: ItemInstance | null;
  potion: boolean;
  price: number;
  sold: boolean;
}

export type Outcome = 'playing' | 'exit' | 'victory' | 'dead';

export interface World {
  tick: number;
  seed: number;
  /** Run seed (loot provenance) and floor index. */
  runSeed: number;
  depth: number;
  floors: number;
  floor: DungeonFloor;
  content: Content;
  map: CollisionMap;
  rng: Rng;
  e: Entities;
  events: EventBuffer;
  players: SimPlayer[];
  spatial: SpatialHash;
  flow: FlowField;
  rooms: RoomState[];
  drops: Drop[];
  shop: ShopSlot[];
  /** Per-entity attack cooldowns (MAX_ATTACKS per entity). */
  atkCd: Int32Array;
  /** Per-entity last "hit stamp" (for dashes/charges that hit each target once). */
  hitStamp: Int32Array;
  stampSeq: number;
  keys: number;
  stairsOpen: boolean;
  bossEnt: number;
  bossKilled: boolean;
  outcome: Outcome;
  /** Difficulty multipliers (depth + player count). */
  enemyHpMul: number;
  enemyDmgMul: number;
  /** Difficulty loot modifiers. */
  lootBoost: number;
  itemLevelBonus: number;
  /** Total seconds spent (for summaries). */
  ticksPlayed: number;
}

export const MAX_ATTACKS = 4;
export const PLAYER_RADIUS = 5;
export const PLAYER_SPEED = 80;
export const DASH_SPEED = 270;
export const DASH_TICKS = 6;
export const DASH_RECHARGE_TICKS = 27;
export const DASH_IFRAMES = 9;
export const HIT_IFRAMES = 18;
export const MAX_POTIONS = 3;
/** Ticks an ally must hold Interact to revive a fallen (non-hardcore) player. */
export const REVIVE_TICKS = 45;
export const BAG_SIZE = 12;

export interface WorldOptions {
  runSeed?: number;
  depth?: number;
  floors?: number;
  playerCount?: number;
}

export function createWorld(
  floor: DungeonFloor,
  seed = floor.seed,
  opts: WorldOptions = {},
): World {
  const n = floor.w * floor.h;
  const map: CollisionMap = {
    w: floor.w,
    h: floor.h,
    tiles: new Uint8Array(floor.tiles),
    dyn: new Uint8Array(n),
  };
  const cap = 1024;
  const depth = opts.depth ?? floor.depth;
  const pc = Math.max(1, opts.playerCount ?? 1);
  return {
    tick: 0,
    seed,
    runSeed: opts.runSeed ?? seed,
    depth,
    floors: opts.floors ?? 1,
    floor,
    content: getContent(),
    map,
    rng: new Rng(deriveSeed(seed, 'sim', depth)),
    e: new Entities(cap),
    events: new EventBuffer(512),
    players: [],
    spatial: new SpatialHash(floor.w * TILE, floor.h * TILE, cap),
    flow: new FlowField(map),
    rooms: floor.rooms.map(() => ({ state: 0, wave: 0, alive: 0, visited: false, waveDelay: 0 })),
    drops: [],
    shop: [],
    atkCd: new Int32Array(cap * MAX_ATTACKS),
    hitStamp: new Int32Array(cap),
    stampSeq: 1,
    keys: 0,
    stairsOpen: false,
    bossEnt: -1,
    bossKilled: false,
    outcome: 'playing',
    enemyHpMul: (1 + 0.3 * depth) * (1 + 0.6 * (pc - 1)),
    enemyDmgMul: (1 + 0.15 * depth) * (1 + 0.1 * (pc - 1)),
    lootBoost: 0,
    itemLevelBonus: 0,
    ticksPlayed: 0,
  };
}

export function tileCenter(t: number): number {
  return t * TILE + TILE / 2;
}

/** Re-derive stats after an equipment change; keeps the HP fraction. */
export function recomputeStats(w: World, p: SimPlayer): void {
  const e = w.e;
  const frac = e.maxHp[p.ent]! > 0 ? e.hp[p.ent]! / e.maxHp[p.ent]! : 1;
  p.stats = statsFor(p.loadout, p.progress);
  e.maxHp[p.ent] = p.stats.maxHp;
  e.hp[p.ent] = Math.max(1, Math.round(p.stats.maxHp * frac));
  p.dashCharges = Math.min(p.dashCharges, p.stats.dashCharges);
  p.lookVersion++;
}

export function statsFor(loadout: Loadout, pr: Progress): PlayerStats {
  return computeStats(loadout, characterBonus(pr.level, pr.attrs, loadout, pr.origin, pr.elixir));
}

export function defaultProgress(): Progress {
  return { level: 1, attrs: { str: 0, dex: 0, int: 0, vit: 0 }, origin: '', elixir: null };
}
