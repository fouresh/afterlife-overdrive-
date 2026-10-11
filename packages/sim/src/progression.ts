import { getContent } from '@ao/content';
import type { Loadout, PlayerStats } from './stats';
import { itemBase } from './items';

export interface Attributes {
  str: number;
  dex: number;
  int: number;
  vit: number;
}

export const ATTRIBUTE_KEYS = ['str', 'dex', 'int', 'vit'] as const;
export const POINTS_PER_LEVEL = 3;
export const MAX_LEVEL = 60;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(40 * level + 12 * level * level);
}

/** Add XP; returns how many levels were gained. Mutates the character-like object. */
export function addXp(c: { level: number; xp: number; unspent: number }, xp: number): number {
  let gained = 0;
  c.xp += Math.max(0, Math.round(xp));
  while (c.level < MAX_LEVEL && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level++;
    c.unspent += POINTS_PER_LEVEL;
    gained++;
  }
  return gained;
}

/** How you died before being reborn (intro choice) — a small permanent bonus. */
export interface Origin {
  id: string;
  bonus: Partial<PlayerStats>;
}

export const ORIGINS: Origin[] = [
  { id: 'truck', bonus: { moveSpeedPct: 4 } },
  { id: 'fire', bonus: { skillPowerPct: 8 } },
  { id: 'shock', bonus: { cooldownPct: 6 } },
  { id: 'sleep', bonus: { hpRegen: 0.5 } },
  { id: 'roof', bonus: { critChance: 4 } },
];

export interface Elixir {
  id: string;
  price: number;
  bonus: Partial<PlayerStats>;
}

/** One-run buffs sold by the alchemist. */
export const ELIXIRS: Elixir[] = [
  { id: 'might', price: 120, bonus: { damagePct: 15 } },
  { id: 'fortitude', price: 100, bonus: { maxHp: 25 } },
  { id: 'fortune', price: 80, bonus: { goldFindPct: 30 } },
];

/** Stat bonus from level, attributes, origin and an active elixir. */
export function characterBonus(
  level: number,
  attrs: Attributes,
  loadout: Loadout,
  origin?: string,
  elixir?: string | null,
): Partial<PlayerStats> {
  const b: Partial<PlayerStats> = {
    maxHp: 4 * (level - 1) + 5 * attrs.vit,
    critChance: 0.4 * attrs.dex,
    skillPowerPct: 3 * attrs.int,
    cooldownPct: 0.4 * attrs.int,
    damagePct: 0,
  };
  const wpn = loadout.weapon ? itemBase(loadout.weapon) : undefined;
  const attr = wpn && wpn.kind === 'weapon' ? wpn.def.attribute : 'str';
  b.damagePct = 3 * attrs[attr];
  const add = (extra: Partial<PlayerStats>) => {
    for (const [k, v] of Object.entries(extra)) {
      const key = k as keyof PlayerStats;
      b[key] = (b[key] ?? 0) + (v ?? 0);
    }
  };
  const o = ORIGINS.find((x) => x.id === origin);
  if (o) add(o.bonus);
  const e = ELIXIRS.find((x) => x.id === elixir);
  if (e) add(e.bonus);
  return b;
}

/** Contract templates for the quest board. */
export interface ContractDef {
  id: string;
  kind: 'kill' | 'depth' | 'boss' | 'chests';
  target?: string;
  count: number;
  reward: { gold: number; dust?: number; essence?: number; shard?: number };
}

export const CONTRACTS: ContractDef[] = [
  {
    id: 'kill-skeleton',
    kind: 'kill',
    target: 'skeleton',
    count: 25,
    reward: { gold: 80, dust: 10 },
  },
  {
    id: 'kill-archer',
    kind: 'kill',
    target: 'skeletonArcher',
    count: 15,
    reward: { gold: 80, dust: 10 },
  },
  { id: 'kill-bat', kind: 'kill', target: 'bat', count: 15, reward: { gold: 60, dust: 8 } },
  { id: 'kill-slime', kind: 'kill', target: 'slime', count: 15, reward: { gold: 60, essence: 3 } },
  {
    id: 'kill-cultist',
    kind: 'kill',
    target: 'cultist',
    count: 10,
    reward: { gold: 100, essence: 4 },
  },
  { id: 'kill-ghost', kind: 'kill', target: 'ghost', count: 10, reward: { gold: 100, essence: 4 } },
  { id: 'depth-2', kind: 'depth', count: 2, reward: { gold: 70, dust: 12 } },
  { id: 'depth-3', kind: 'depth', count: 3, reward: { gold: 150, essence: 6 } },
  { id: 'boss', kind: 'boss', count: 1, reward: { gold: 250, shard: 2 } },
  { id: 'chests', kind: 'chests', count: 3, reward: { gold: 90, essence: 5 } },
];

export function enemyIdByIndex(i: number): string {
  return getContent().enemies[i]?.id ?? '';
}
