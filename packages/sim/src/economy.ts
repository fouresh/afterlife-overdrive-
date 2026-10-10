import { RARITY_VALUE, getContent, type Slot } from '@ao/content';
import { Rng, deriveSeed, ipow } from '@ao/shared';
import { itemBase, itemValue, rollItem, rollRarity, type ItemInstance } from './items';

/**
 * Hub economy rules (forge, alchemist, NPC market). Pure functions over plain data so the same
 * rules can run on the client today and be validated on the server later (auction).
 */
export const MATERIALS = ['dust', 'essence', 'shard'] as const;
export type Material = (typeof MATERIALS)[number];
export type Materials = Record<Material, number>;

export function emptyMaterials(): Materials {
  return { dust: 0, essence: 0, shard: 0 };
}

/** Materials returned by salvaging an item at the forge. */
export function salvageYield(item: ItemInstance): Materials {
  const lv = 1 + Math.floor(item.level / 3);
  const r = item.rarity;
  return {
    dust: (2 + r * 2) * lv,
    essence: r === 0 ? 0 : [0, 1, 3, 6, 10][r]! * lv,
    shard: r >= 3 ? (r === 3 ? 1 : 3) : 0,
  };
}

export interface Cost {
  gold: number;
  dust?: number;
  essence?: number;
  shard?: number;
}

export function craftCost(level: number): Cost {
  return { gold: 40 + level * 15, dust: 15 + level * 3, essence: 3 + Math.floor(level / 2) };
}

export function upgradeCost(item: ItemInstance): Cost {
  return {
    gold: Math.round(20 * item.level * (RARITY_VALUE[item.rarity] ?? 1) ** 0.5),
    dust: 6 + item.level * 2,
    essence: item.rarity >= 2 ? item.rarity + Math.floor(item.level / 3) : 0,
  };
}

export function rerollCost(item: ItemInstance): Cost {
  return {
    gold: 30 + item.level * 10,
    essence: 2 + item.rarity * 3,
    shard: item.rarity >= 3 ? 1 : 0,
  };
}

/** Max item level a character can upgrade to. */
export function maxItemLevel(charLevel: number): number {
  return charLevel + 5;
}

export function canAfford(gold: number, mats: Materials, c: Cost): boolean {
  return (
    gold >= c.gold &&
    mats.dust >= (c.dust ?? 0) &&
    mats.essence >= (c.essence ?? 0) &&
    mats.shard >= (c.shard ?? 0)
  );
}

export function pay(wallet: { gold: number; materials: Materials }, c: Cost): void {
  wallet.gold -= c.gold;
  wallet.materials.dust -= c.dust ?? 0;
  wallet.materials.essence -= c.essence ?? 0;
  wallet.materials.shard -= c.shard ?? 0;
}

/** Forge craft: a random item of the chosen slot. `counter` makes every craft unique. */
export function craftItem(
  realmSeed: number,
  counter: number,
  level: number,
  slot: Slot,
): ItemInstance {
  const seed = deriveSeed(realmSeed, 'craft', counter);
  const rng = new Rng(seed);
  const rarity = Math.max(1, rollRarity(rng, Math.floor(level / 3), 0.8));
  return rollItem(rng.nextU32(), level, rarity, slot, `c${realmSeed.toString(36)}-${counter}`);
}

/** +1 item level: base stats scale with level; affixes grow by their per-level step. */
export function upgradeItem(item: ItemInstance): ItemInstance {
  const affixes = getContent().affixById;
  return {
    ...item,
    level: item.level + 1,
    affixes: item.affixes.map((a) => {
      const def = affixes.get(a.id);
      if (!def || def.perLevel === 0) return a;
      const v = a.v + def.perLevel;
      return { id: a.id, v: def.integer ? Math.round(v + 0.0001) : Math.round(v * 10) / 10 };
    }),
  };
}

/** New affixes, same base/rarity/level. Deterministic from the item seed and a counter. */
export function rerollItem(item: ItemInstance, counter: number): ItemInstance {
  const b = itemBase(item);
  const seed = deriveSeed(item.seed, 'reroll', counter);
  const fresh = rollItem(seed, item.level, item.rarity, b.slot, item.uid);
  return { ...item, affixes: fresh.affixes, seed: fresh.seed };
}

// ---------- NPC market (dynamic prices) ----------

export interface MarketState {
  /** Stock refresh index (changes daily or when refreshed). */
  day: number;
  /** Items bought from today's stock (by stock index). */
  bought: number[];
  /** Sale saturation per slot (0..0.6): selling many items of a slot lowers its price. */
  saturation: Partial<Record<Slot, number>>;
  /** Last saturation decay timestamp (ms). */
  decayAt: number;
}

export function emptyMarket(): MarketState {
  return { day: 0, bought: [], saturation: {}, decayAt: 0 };
}

export const MARKET_STOCK = 6;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's stock for a realm (deterministic: the server can verify purchases). */
export function marketStock(realmSeed: number, day: number, level: number): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (let k = 0; k < MARKET_STOCK; k++) {
    const seed = deriveSeed(realmSeed, 'market', day, k);
    const rng = new Rng(seed);
    const rarity = Math.min(3, Math.max(0, rollRarity(rng, Math.floor(level / 4), 0.3)));
    out.push(
      rollItem(
        rng.nextU32(),
        Math.max(1, level + rng.int(-1, 1)),
        rarity,
        undefined,
        `m${realmSeed.toString(36)}-${day}-${k}`,
      ),
    );
  }
  return out;
}

export function buyPrice(item: ItemInstance): number {
  return Math.round(itemValue(item) * 5);
}

export function sellPrice(item: ItemInstance, m: MarketState): number {
  const sat = m.saturation[itemBase(item).slot] ?? 0;
  return Math.max(1, Math.round(itemValue(item) * (1 - sat)));
}

/** Register a sale: the slot gets saturated (prices drop for further sales). */
export function registerSale(m: MarketState, item: ItemInstance): void {
  const slot = itemBase(item).slot;
  m.saturation[slot] = Math.min(0.6, (m.saturation[slot] ?? 0) + 0.08);
}

/** Saturation halves every real day. `now` comes from the caller (sim has no clock). */
export function decayMarket(m: MarketState, now: number): void {
  if (!m.decayAt) {
    m.decayAt = now;
    return;
  }
  const days = Math.floor((now - m.decayAt) / DAY_MS);
  if (days <= 0) return;
  for (const k of Object.keys(m.saturation) as Slot[])
    m.saturation[k] = (m.saturation[k] ?? 0) / ipow(2, days);
  m.decayAt += days * DAY_MS;
}

export const MATERIAL_PRICES: Record<Material, number> = { dust: 4, essence: 25, shard: 150 };
export const POTION_PRICE = 30;
export const MAX_CARRIED_POTIONS = 3;
