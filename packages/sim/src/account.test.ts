import { describe, expect, it } from 'vitest';
import {
  applyRunResult,
  buyPotion,
  claimContract,
  craft,
  equipFromStash,
  marketBuy,
  marketOffers,
  marketSell,
  runSetup,
  salvage,
  spendPoint,
  syncMarket,
  upgrade,
} from './account';
import { itemValue, rollItem, starterItem } from './items';
import { addXp, xpToNext } from './progression';
import {
  AccountSaveSchema,
  STASH_SIZE,
  createCharacter,
  migrateSave,
  newSave,
  realmOf,
} from './save';

const NOW = 1_800_000_000_000;

function setup(hardcore = false) {
  const save = newSave(123, NOW);
  const c = createCharacter(
    {
      name: 'Арина',
      appearance: {
        gender: 'f',
        skin: 2,
        hairStyle: 'long',
        hairColor: 3,
        eyeColor: 1,
        clothColor: 4,
        pantsColor: 7,
      },
      hardcore,
      origin: 'shock',
      weapon: starterItem('bow.short'),
      artifact: starterItem('art.fireball'),
    },
    'c1',
    NOW,
  );
  save.characters.push(c);
  return { save, c };
}

describe('account operations', () => {
  it('a new save validates against the schema', () => {
    const { save } = setup();
    expect(() => AccountSaveSchema.parse(save)).not.toThrow();
  });

  it('levels up with xp and spends attribute points', () => {
    const { c } = setup();
    const gained = addXp(c, xpToNext(1) + xpToNext(2) + 5);
    expect(gained).toBe(2);
    expect(c.level).toBe(3);
    expect(c.unspent).toBe(6);
    expect(spendPoint(c, 'dex')).toBeNull();
    expect(c.attrs.dex).toBe(1);
  });

  it('successful run keeps loot; death loses run loot but keeps start gear', () => {
    const { save, c } = setup();
    const found = rollItem(77, 3, 2);
    const carry = runSetup(c);
    carry.bag = [found];
    carry.gold = 55;
    carry.xp = 30;
    carry.kills = 9;
    const ok = applyRunResult(
      save,
      c,
      { outcome: 'left', carry, depth: 2, bossKilled: false, seconds: 300 },
      NOW,
    );
    expect(ok.items).toHaveLength(1);
    expect(realmOf(save, c).stash[0]!.uid).toBe(found.uid);
    expect(realmOf(save, c).gold).toBe(55);

    const carry2 = runSetup(c);
    const better = rollItem(99, 5, 3, 'weapon');
    carry2.loadout!.weapon = better;
    carry2.gold = 500;
    const dead = applyRunResult(
      save,
      c,
      { outcome: 'dead', carry: carry2, depth: 1, bossKilled: false, seconds: 60 },
      NOW,
    );
    expect(dead.lost.map((x) => x.uid)).toContain(better.uid);
    expect(c.loadout.weapon!.base).toBe('bow.short');
    expect(realmOf(save, c).gold).toBe(55);
    expect(c.dead).toBe(false);
  });

  it('a full stash never loses stored items: run loot that does not fit is sold', () => {
    const { save, c } = setup();
    const r = realmOf(save, c);
    r.stash = Array.from({ length: STASH_SIZE - 1 }, (_, k) => rollItem(1000 + k, 2, 1));
    const stored = r.stash.map((x) => x.uid);
    const carry = runSetup(c);
    const loot = [rollItem(7, 3, 2), rollItem(8, 3, 2), rollItem(9, 3, 2)];
    carry.bag = loot;
    carry.gold = 10;
    const res = applyRunResult(
      save,
      c,
      { outcome: 'left', carry, depth: 1, bossKilled: false, seconds: 30 },
      NOW,
    );
    expect(r.stash).toHaveLength(STASH_SIZE);
    // Every item that was already stored is still there; the first loot item took the free slot.
    for (const uid of stored) expect(r.stash.some((x) => x.uid === uid)).toBe(true);
    expect(r.stash[0]!.uid).toBe(loot[0]!.uid);
    const sold = itemValue(loot[1]!) + itemValue(loot[2]!);
    expect(res.gold).toBe(10 + sold);
    expect(r.gold).toBe(10 + sold);
  });

  it('hardcore death is permanent and uses a separate realm', () => {
    const { save, c } = setup(true);
    applyRunResult(
      save,
      c,
      {
        outcome: 'dead',
        carry: runSetup(c),
        depth: 2,
        bossKilled: false,
        seconds: 60,
        killedBy: 'skeleton',
      },
      NOW,
    );
    expect(c.dead).toBe(true);
    expect(c.death?.by).toBe('skeleton');
    expect(realmOf(save, c)).toBe(save.realms.hardcore);
  });

  it('forge: salvage, craft, upgrade', () => {
    const { save, c } = setup();
    const r = realmOf(save, c);
    r.stash.push(rollItem(5, 3, 3));
    expect(salvage(save, c, 0)).toBeNull();
    expect(r.materials.dust).toBeGreaterThan(0);
    expect(craft(save, c, 'helmet')).toBe('gold');
    r.gold = 10_000;
    r.materials = { dust: 999, essence: 999, shard: 99 };
    expect(craft(save, c, 'helmet')).toBeNull();
    expect(r.stash[0]!.base.startsWith('helmet.')).toBe(true);
    const lvl = r.stash[0]!.level;
    expect(upgrade(save, c, { stash: 0 })).toBeNull();
    expect(r.stash[0]!.level).toBe(lvl + 1);
    expect(equipFromStash(save, c, 0)).toBeNull();
    expect(c.loadout.helmet).not.toBeNull();
  });

  it('market: deterministic stock, buying and selling with saturation', () => {
    const { save, c } = setup();
    const r = realmOf(save, c);
    syncMarket(r, NOW);
    const offers = marketOffers(save, c);
    expect(offers).toHaveLength(6);
    expect(marketOffers(save, c)[0]!.item.uid).toBe(offers[0]!.item.uid);
    r.gold = 100_000;
    expect(marketBuy(save, c, 0)).toBeNull();
    expect(marketOffers(save, c)[0]!.sold).toBe(true);
    const goldBefore = r.gold;
    expect(marketSell(save, c, 0)).toBeNull();
    expect(r.gold).toBeGreaterThan(goldBefore);
    expect(buyPotion(save, c)).toBeNull();
  });

  it('contracts progress from runs and pay out', () => {
    const { save, c } = setup();
    const r = realmOf(save, c);
    const first = r.contracts[0]!;
    const carry = runSetup(c);
    carry.killsBy = { skeleton: 100, skeletonArcher: 100, bat: 100 };
    applyRunResult(
      save,
      c,
      { outcome: 'left', carry, depth: 3, bossKilled: false, seconds: 10 },
      NOW,
    );
    expect(claimContract(save, c, 0)).toBeNull();
    expect(r.gold).toBeGreaterThan(0);
    expect(r.contracts[0]!.id).not.toBe(first.id);
  });

  it('migrates the M1 profile into a character', () => {
    const v1 = {
      v: 1,
      loadout: {
        weapon: starterItem('sword.rusty'),
        helmet: null,
        chest: null,
        boots: null,
        artifacts: [starterItem('art.meteor'), null],
      },
      stash: [rollItem(1, 2, 1)],
      gold: 42,
      runs: 3,
      deaths: 1,
      victories: 0,
      bestDepth: 2,
    };
    const save = migrateSave(v1, NOW);
    expect(save.characters).toHaveLength(1);
    expect(save.characters[0]!.loadout.artifacts[0]!.base).toBe('art.meteor');
    expect(save.realms.standard.gold).toBe(42);
    expect(save.realms.standard.stash).toHaveLength(1);
  });
});
