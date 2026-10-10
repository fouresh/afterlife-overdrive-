import {
  RARITY_AFFIXES,
  RARITY_VALUE,
  RARITY_WEIGHTS,
  getContent,
  type AffixDef,
  type ItemBase,
  type Slot,
} from '@ao/content';
import { Rng, deriveSeed } from '@ao/shared';

/**
 * An item instance. Fully determined by (base, rarity, level, seed): the server can regenerate it
 * from the run seed + drop index to verify provenance (needed for the future auction).
 */
export interface ItemInstance {
  uid: string;
  base: string;
  rarity: number;
  level: number;
  affixes: { id: string; v: number }[];
  /** Generation seed (provenance). */
  seed: number;
}

export function itemBase(item: ItemInstance): ItemBase {
  const b = getContent().bases.get(item.base);
  if (!b) throw new Error(`Unknown item base '${item.base}'`);
  return b;
}

export function rollRarity(rng: Rng, depth: number, boost = 0): number {
  const shift = depth * 0.6 + boost;
  const weights = RARITY_WEIGHTS.map((w, i) => w * Math.max(0.05, 1 + (i - 1) * shift * 0.35));
  return rng.weightedIndex(weights);
}

function affixValue(a: AffixDef, rng: Rng, level: number): number {
  const raw = a.min + (a.max - a.min) * rng.next() + a.perLevel * (level - 1);
  return a.integer ? Math.max(1, Math.round(raw)) : Math.round(raw * 10) / 10;
}

/** Roll a random item. `slot` undefined = any slot (weighted). Deterministic for the seed. */
export function rollItem(
  seed: number,
  level: number,
  rarity: number,
  slot?: Slot,
  uid?: string,
): ItemInstance {
  const c = getContent();
  const rng = new Rng(seed);
  const slots: Slot[] = ['weapon', 'helmet', 'chest', 'boots', 'artifact'];
  const s = slot ?? slots[rng.weightedIndex([30, 15, 15, 15, 25])]!;
  const pool = (c.basesBySlot.get(s) ?? []).filter((b) => (b.def.minLevel ?? 1) <= level);
  const base = pool[rng.weightedIndex(pool.map((b) => b.def.weight ?? 1))]!;
  const affixPool = c.affixes.filter((a) => a.slots.includes(s) && a.minLevel <= level);
  const affixes: { id: string; v: number }[] = [];
  const n = Math.min(RARITY_AFFIXES[rarity] ?? 0, affixPool.length);
  const avail = [...affixPool];
  for (let i = 0; i < n; i++) {
    const k = rng.weightedIndex(avail.map((a) => a.weight));
    const a = avail.splice(k, 1)[0]!;
    affixes.push({ id: a.id, v: affixValue(a, rng, level) });
  }
  return { uid: uid ?? `i${seed.toString(36)}`, base: base.def.id, rarity, level, affixes, seed };
}

/** Deterministic drop: the k-th drop of a player in a run. */
export function dropSeed(runSeed: number, player: number, index: number): number {
  return deriveSeed(runSeed, 'drop', player, index);
}

export function starterItem(base: string): ItemInstance {
  return { uid: `starter-${base}`, base, rarity: 0, level: 1, affixes: [], seed: 0 };
}

/** Item sale value in gold (shop buys at 4× this, NPC market in M2 uses it as a base price). */
export function itemValue(item: ItemInstance): number {
  return Math.round((6 + item.level * 4) * (RARITY_VALUE[item.rarity] ?? 1));
}

/** Damage/armor scale with item level. */
export function levelScale(level: number): number {
  return 1 + 0.1 * (level - 1);
}
