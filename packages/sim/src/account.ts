import type { Slot } from '@ao/content';
import {
  MATERIAL_PRICES,
  MAX_CARRIED_POTIONS,
  POTION_PRICE,
  buyPrice,
  canAfford,
  craftCost,
  craftItem,
  decayMarket,
  marketStock,
  maxItemLevel,
  pay,
  registerSale,
  rerollCost,
  rerollItem,
  salvageYield,
  sellPrice,
  upgradeCost,
  upgradeItem,
  DAY_MS,
  type Material,
} from './economy';
import { itemBase, type ItemInstance } from './items';
import { ATTRIBUTE_KEYS, CONTRACTS, ELIXIRS, addXp, type Attributes } from './progression';
import type { PlayerSetup } from './player';
import { STASH_SIZE, realmOf, type AccountSave, type Character, type Realm } from './save';
import type { Loadout } from './stats';

/**
 * Account operations used by the hub (and later validated by the server). Each returns
 * `null` on success or an error code the UI turns into a message. They mutate the save.
 */
export type OpError = 'gold' | 'materials' | 'full' | 'invalid' | 'max' | 'dead';

function wallet(r: Realm) {
  return r;
}

export function spendPoint(c: Character, attr: keyof Attributes): OpError | null {
  if (!ATTRIBUTE_KEYS.includes(attr)) return 'invalid';
  if (c.unspent <= 0) return 'max';
  c.attrs[attr]++;
  c.unspent--;
  return null;
}

export function respec(save: AccountSave, c: Character): OpError | null {
  const r = realmOf(save, c);
  const cost = 50 * c.level;
  if (r.gold < cost) return 'gold';
  r.gold -= cost;
  c.unspent += c.attrs.str + c.attrs.dex + c.attrs.int + c.attrs.vit;
  c.attrs = { str: 0, dex: 0, int: 0, vit: 0 };
  return null;
}

/** Slot key in the loadout for an item (artifacts need an explicit slot index). */
function slotKey(item: ItemInstance): Slot {
  return itemBase(item).slot;
}

/** Equip a stash item; the previously equipped one goes back to the stash. */
export function equipFromStash(
  save: AccountSave,
  c: Character,
  stashIndex: number,
  artifactSlot: 0 | 1 = 0,
): OpError | null {
  const r = realmOf(save, c);
  const item = r.stash[stashIndex];
  if (!item) return 'invalid';
  const l = c.loadout;
  const slot = slotKey(item);
  let old: ItemInstance | null;
  if (slot === 'artifact') {
    old = l.artifacts[artifactSlot];
    l.artifacts[artifactSlot] = item;
  } else {
    old = l[slot];
    l[slot] = item;
  }
  r.stash.splice(stashIndex, 1);
  if (old) r.stash.unshift(old);
  return null;
}

export type LoadoutSlot = 'weapon' | 'helmet' | 'chest' | 'boots' | 'art0' | 'art1';

export function unequip(save: AccountSave, c: Character, slot: LoadoutSlot): OpError | null {
  const r = realmOf(save, c);
  if (r.stash.length >= STASH_SIZE) return 'full';
  const l = c.loadout;
  let item: ItemInstance | null;
  if (slot === 'art0' || slot === 'art1') {
    const k = slot === 'art0' ? 0 : 1;
    item = l.artifacts[k];
    l.artifacts[k] = null;
  } else {
    if (slot === 'weapon') return 'invalid'; // always keep a weapon
    item = l[slot];
    l[slot] = null;
  }
  if (!item) return 'invalid';
  r.stash.unshift(item);
  return null;
}

export function loadoutItem(l: Loadout, slot: LoadoutSlot): ItemInstance | null {
  if (slot === 'art0') return l.artifacts[0];
  if (slot === 'art1') return l.artifacts[1];
  return l[slot];
}

// ---------- Forge ----------

export function salvage(save: AccountSave, c: Character, stashIndex: number): OpError | null {
  const r = realmOf(save, c);
  const item = r.stash[stashIndex];
  if (!item) return 'invalid';
  const y = salvageYield(item);
  r.materials.dust += y.dust;
  r.materials.essence += y.essence;
  r.materials.shard += y.shard;
  r.stash.splice(stashIndex, 1);
  return null;
}

export function craft(save: AccountSave, c: Character, slot: Slot): OpError | null {
  const r = realmOf(save, c);
  if (r.stash.length >= STASH_SIZE) return 'full';
  const cost = craftCost(c.level);
  if (!canAfford(r.gold, r.materials, cost)) return r.gold < cost.gold ? 'gold' : 'materials';
  pay(wallet(r), cost);
  r.stash.unshift(craftItem(r.seed, r.crafts++, c.level, slot));
  return null;
}

/** Upgrade an item either in the stash (`stash:<i>`) or equipped (`slot:<LoadoutSlot>`). */
export function upgrade(save: AccountSave, c: Character, ref: ItemRef): OpError | null {
  const r = realmOf(save, c);
  const item = getRef(save, c, ref);
  if (!item) return 'invalid';
  if (item.level >= maxItemLevel(c.level)) return 'max';
  const cost = upgradeCost(item);
  if (!canAfford(r.gold, r.materials, cost)) return r.gold < cost.gold ? 'gold' : 'materials';
  pay(wallet(r), cost);
  setRef(save, c, ref, upgradeItem(item));
  return null;
}

export function reroll(save: AccountSave, c: Character, ref: ItemRef): OpError | null {
  const r = realmOf(save, c);
  const item = getRef(save, c, ref);
  if (!item || item.rarity === 0) return 'invalid';
  const cost = rerollCost(item);
  if (!canAfford(r.gold, r.materials, cost)) return r.gold < cost.gold ? 'gold' : 'materials';
  pay(wallet(r), cost);
  setRef(save, c, ref, rerollItem(item, r.crafts++));
  return null;
}

export type ItemRef = { stash: number } | { slot: LoadoutSlot };

export function getRef(save: AccountSave, c: Character, ref: ItemRef): ItemInstance | null {
  if ('stash' in ref) return realmOf(save, c).stash[ref.stash] ?? null;
  return loadoutItem(c.loadout, ref.slot);
}

function setRef(save: AccountSave, c: Character, ref: ItemRef, item: ItemInstance): void {
  if ('stash' in ref) {
    realmOf(save, c).stash[ref.stash] = item;
    return;
  }
  const l = c.loadout;
  if (ref.slot === 'art0') l.artifacts[0] = item;
  else if (ref.slot === 'art1') l.artifacts[1] = item;
  else l[ref.slot] = item;
}

// ---------- Alchemist ----------

export function buyPotion(save: AccountSave, c: Character): OpError | null {
  const r = realmOf(save, c);
  if (c.potions >= MAX_CARRIED_POTIONS) return 'max';
  if (r.gold < POTION_PRICE) return 'gold';
  r.gold -= POTION_PRICE;
  c.potions++;
  return null;
}

export function buyElixir(save: AccountSave, c: Character, id: string): OpError | null {
  const r = realmOf(save, c);
  const e = ELIXIRS.find((x) => x.id === id);
  if (!e) return 'invalid';
  if (c.elixir) return 'max';
  if (r.gold < e.price) return 'gold';
  r.gold -= e.price;
  c.elixir = id;
  return null;
}

// ---------- Market ----------

export function marketDay(now: number): number {
  return Math.floor(now / DAY_MS);
}

/** Refresh the stock day / decay saturation. Call before showing the market. */
export function syncMarket(r: Realm, now: number): void {
  const day = marketDay(now);
  if (r.market.day !== day) {
    r.market.day = day;
    r.market.bought = [];
  }
  decayMarket(r.market, now);
}

export function marketOffers(
  save: AccountSave,
  c: Character,
): { item: ItemInstance; price: number; sold: boolean }[] {
  const r = realmOf(save, c);
  return marketStock(r.seed, r.market.day, c.level).map((item, i) => ({
    item,
    price: buyPrice(item),
    sold: r.market.bought.includes(i),
  }));
}

export function marketBuy(save: AccountSave, c: Character, index: number): OpError | null {
  const r = realmOf(save, c);
  const offer = marketOffers(save, c)[index];
  if (!offer || offer.sold) return 'invalid';
  if (r.stash.length >= STASH_SIZE) return 'full';
  if (r.gold < offer.price) return 'gold';
  r.gold -= offer.price;
  r.market.bought.push(index);
  r.stash.unshift(offer.item);
  return null;
}

export function marketSell(save: AccountSave, c: Character, stashIndex: number): OpError | null {
  const r = realmOf(save, c);
  const item = r.stash[stashIndex];
  if (!item) return 'invalid';
  r.gold += sellPrice(item, r.market);
  registerSale(r.market, item);
  r.stash.splice(stashIndex, 1);
  return null;
}

export function buyMaterial(
  save: AccountSave,
  c: Character,
  m: Material,
  amount: number,
): OpError | null {
  const r = realmOf(save, c);
  const price = MATERIAL_PRICES[m] * amount;
  if (amount <= 0) return 'invalid';
  if (r.gold < price) return 'gold';
  r.gold -= price;
  r.materials[m] += amount;
  return null;
}

// ---------- Contracts (quest board) ----------

export function claimContract(save: AccountSave, c: Character, index: number): OpError | null {
  const r = realmOf(save, c);
  const k = r.contracts[index];
  const def = k && CONTRACTS.find((x) => x.id === k.id);
  if (!k || !def || k.progress < def.count) return 'invalid';
  r.gold += def.reward.gold;
  r.materials.dust += def.reward.dust ?? 0;
  r.materials.essence += def.reward.essence ?? 0;
  r.materials.shard += def.reward.shard ?? 0;
  r.contractsDone++;
  // Replace with the next contract not currently active.
  const active = new Set(r.contracts.map((x) => x.id));
  const order = CONTRACTS.map((_, i) => CONTRACTS[(i + r.contractsDone * 3) % CONTRACTS.length]!);
  const next = order.find((x) => !active.has(x.id)) ?? CONTRACTS[0]!;
  r.contracts[index] = { id: next.id, progress: 0 };
  return null;
}

// ---------- Runs ----------

export interface RunResult {
  /** 'lost' = the connection to a co-op room was lost for good: like a death without permadeath. */
  outcome: 'victory' | 'left' | 'dead' | 'lost';
  carry: PlayerSetup;
  /** Deepest floor reached (1-based). */
  depth: number;
  bossKilled: boolean;
  seconds: number;
  /** Who killed us (enemy id) for the hardcore memorial. */
  killedBy?: string;
}

export interface RunReward {
  levels: number;
  xp: number;
  gold: number;
  items: ItemInstance[];
  lost: ItemInstance[];
}

/** The loadout the character takes into a run (consumes potions and the elixir). */
export function runSetup(c: Character): PlayerSetup {
  const setup: PlayerSetup = {
    loadout: JSON.parse(JSON.stringify(c.loadout)) as Loadout,
    potions: c.potions,
    hardcore: c.hardcore,
    progress: { level: c.level, attrs: { ...c.attrs }, origin: c.origin, elixir: c.elixir },
  };
  return setup;
}

/**
 * Apply a finished run to the character and realm:
 * - XP always counts (so even a death makes the character stronger);
 * - death: loot found in the run is lost, the start loadout stays; hardcore: the character dies;
 * - success: equipped gear stays, the bag goes to the stash, gold to the realm.
 */
export function applyRunResult(
  save: AccountSave,
  c: Character,
  res: RunResult,
  now: number,
): RunReward {
  if (c.dead) throw new Error('dead character');
  const r = realmOf(save, c);
  const carry = res.carry;
  const xp = carry.xp ?? 0;
  const levels = addXp(c, xp);
  c.stats.runs++;
  c.stats.kills += carry.kills ?? 0;
  c.stats.bestDepth = Math.max(c.stats.bestDepth, res.depth);
  c.stats.seconds += res.seconds;
  c.elixir = null;
  const startUids = new Set(
    [c.loadout.weapon, c.loadout.helmet, c.loadout.chest, c.loadout.boots, ...c.loadout.artifacts]
      .filter((x): x is ItemInstance => !!x)
      .map((x) => x.uid),
  );
  const found = [
    ...(carry.bag ?? []),
    ...[
      carry.loadout?.weapon,
      carry.loadout?.helmet,
      carry.loadout?.chest,
      carry.loadout?.boots,
      ...(carry.loadout?.artifacts ?? []),
    ].filter((x): x is ItemInstance => !!x && !startUids.has(x.uid)),
  ];
  // Contracts progress counts in every outcome (you did kill them).
  for (const k of r.contracts) {
    const def = CONTRACTS.find((x) => x.id === k.id);
    if (!def) continue;
    let add = 0;
    if (def.kind === 'kill' && def.target) add = carry.killsBy?.[def.target] ?? 0;
    else if (def.kind === 'depth')
      add =
        res.depth >= def.count && (res.outcome === 'victory' || res.outcome === 'left')
          ? def.count
          : 0;
    else if (def.kind === 'boss') add = res.bossKilled ? 1 : 0;
    else if (def.kind === 'chests') add = carry.chests ?? 0;
    k.progress = Math.min(def.count, k.progress + add);
  }
  if (res.outcome === 'lost') {
    c.potions = 0;
    return { levels, xp, gold: 0, items: [], lost: found };
  }
  if (res.outcome === 'dead') {
    c.stats.deaths++;
    c.potions = 0;
    if (c.hardcore) {
      c.dead = true;
      c.death = { at: now, depth: res.depth, by: res.killedBy ?? '' };
    }
    return { levels, xp, gold: 0, items: [], lost: found };
  }
  if (res.outcome === 'victory') c.stats.victories++;
  if (carry.loadout) c.loadout = carry.loadout;
  c.potions = Math.min(MAX_CARRIED_POTIONS, carry.potions ?? 0);
  const gold = carry.gold ?? 0;
  r.gold += gold;
  const toStash = carry.bag ?? [];
  r.stash = [...toStash, ...r.stash].slice(0, STASH_SIZE);
  return { levels, xp, gold, items: found, lost: [] };
}
