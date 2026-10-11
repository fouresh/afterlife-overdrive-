import { secToTicks } from '@ao/shared';
import { EF, Kind, PickupKind } from './entities';
import { Ev } from './events';
import { dropSeed, rollItem, rollRarity } from './items';
import { ES, spawnPickup } from './spawn';
import { Rng } from '@ao/shared';
import { HIT_IFRAMES, type SimPlayer, type World } from './world';
import { storyEvent } from './story';

/** Apply damage to an enemy. Returns true if it died. */
export function damageEnemy(
  w: World,
  i: number,
  amount: number,
  srcX: number,
  srcY: number,
  knock: number,
  attacker: number,
  crit = false,
): boolean {
  const e = w.e;
  if (!e.alive[i] || e.kind[i] !== Kind.Enemy) return false;
  if (e.flags[i]! & (EF.Dying | EF.Invulnerable)) return false;
  const dmg = Math.max(1, Math.round(amount));
  e.hp[i] = e.hp[i]! - dmg;
  e.hitFlash[i] = 4;
  const def = w.content.enemies[e.def[i]!]!;
  if (knock > 0) {
    let dx = e.x[i]! - srcX;
    let dy = e.y[i]! - srcY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len;
    dy /= len;
    const k = knock * (1 - def.knockbackResist);
    e.kx[i] = e.kx[i]! + dx * k;
    e.ky[i] = e.ky[i]! + dy * k;
  }
  w.events.push(Ev.Hit, e.x[i]!, e.y[i]!, i, dmg, crit ? 1 : 0);
  const p = attacker >= 0 ? w.players[attacker] : undefined;
  if (p && p.stats.lifeSteal > 0 && !p.dead) {
    const pe = p.ent;
    e.hp[pe] = Math.min(e.maxHp[pe]!, e.hp[pe]! + (dmg * p.stats.lifeSteal) / 100);
  }
  if (e.hp[i]! <= 0) {
    killEnemy(w, i, attacker);
    return true;
  }
  return false;
}

export function killEnemy(w: World, i: number, killer: number): void {
  const e = w.e;
  const def = w.content.enemies[e.def[i]!]!;
  e.flags[i] = e.flags[i]! | EF.Dying;
  e.state[i] = ES.Dying;
  e.stateT[i] = 0;
  e.life[i] = 24;
  e.vx[i] = 0;
  e.vy[i] = 0;
  w.events.push(Ev.Death, e.x[i]!, e.y[i]!, i, e.def[i]!);
  const room = e.room[i]!;
  if (room >= 0 && w.rooms[room]) w.rooms[room]!.alive = Math.max(0, w.rooms[room]!.alive - 1);
  const k = killer >= 0 ? w.players[killer] : undefined;
  if (k) k.kills++;
  if (def.rank === 'boss') {
    w.bossKilled = true;
    storyEvent(w, `boss:${def.id}`);
  }
  for (const p of w.players) if (!p.dead) p.killsBy[def.id] = (p.killsBy[def.id] ?? 0) + 1;
  for (const p of w.players) {
    if (p.dead) continue;
    p.xp += def.xp;
    dropLoot(w, p, e.x[i]!, e.y[i]!, def.rank, def.gold);
  }
}

/** Personal loot for one player at a position. */
export function dropLoot(
  w: World,
  p: SimPlayer,
  x: number,
  y: number,
  rank: 'normal' | 'elite' | 'miniboss' | 'boss',
  gold: [number, number],
): void {
  const r = w.rng;
  if (r.chance(rank === 'normal' ? 0.75 : 1)) {
    let amount = Math.round(r.int(gold[0], gold[1]) * (1 + p.stats.goldFindPct / 100));
    const piles = Math.min(6, Math.max(1, Math.ceil(amount / 4)));
    for (let k = 0; k < piles && amount > 0; k++) {
      const a = k === piles - 1 ? amount : Math.ceil(amount / (piles - k));
      amount -= a;
      spawnPickup(w, PickupKind.Gold, x, y, { item: null, amount: a, owner: p.index });
    }
  }
  const items =
    rank === 'boss'
      ? 3
      : rank === 'miniboss'
        ? 1
        : rank === 'elite'
          ? r.chance(0.3)
            ? 1
            : 0
          : r.chance(0.05)
            ? 1
            : 0;
  const boost = rank === 'boss' ? 2 : rank === 'miniboss' ? 1.2 : 0;
  for (let k = 0; k < items; k++) dropItem(w, p, x, y, boost);
  if (rank === 'normal' && r.chance(0.04)) {
    spawnPickup(w, PickupKind.Potion, x, y, { item: null, amount: 1, owner: p.index });
  }
}

export function dropItem(w: World, p: SimPlayer, x: number, y: number, boost: number): void {
  const seed = dropSeed(w.runSeed, p.index, p.dropCount++);
  const rng = new Rng(seed);
  const rarity = rollRarity(rng, w.depth, boost + w.lootBoost);
  // Item level follows the player's level (personal loot) plus floor depth and difficulty.
  const level = Math.max(1, p.progress.level + w.depth + w.itemLevelBonus + rng.int(-1, 1));
  const item = rollItem(
    rng.nextU32(),
    level,
    rarity,
    undefined,
    `r${w.runSeed.toString(36)}-${p.index}-${p.dropCount - 1}`,
  );
  spawnPickup(w, PickupKind.Item, x, y, { item, amount: 1, owner: p.index });
}

/** Damage a player (armor, shield, i-frames). `source` = enemy entity for thorns, or -1. */
export function damagePlayer(
  w: World,
  p: SimPlayer,
  amount: number,
  srcX: number,
  srcY: number,
  knock: number,
  source = -1,
): boolean {
  const e = w.e;
  const i = p.ent;
  if (p.dead || e.iframes[i]! > 0 || p.dashT > 0) return false;
  let dmg = (amount * 100) / (100 + p.stats.armor);
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
  }
  dmg = Math.max(dmg > 0 ? 1 : 0, Math.round(dmg));
  e.hp[i] = e.hp[i]! - dmg;
  e.iframes[i] = HIT_IFRAMES;
  e.hitFlash[i] = 5;
  if (knock > 0) {
    let dx = e.x[i]! - srcX;
    let dy = e.y[i]! - srcY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len;
    dy /= len;
    e.kx[i] = e.kx[i]! + dx * knock;
    e.ky[i] = e.ky[i]! + dy * knock;
  }
  w.events.push(Ev.PlayerHurt, e.x[i]!, e.y[i]!, p.index, dmg);
  if (source >= 0 && p.stats.thorns > 0)
    damageEnemy(w, source, p.stats.thorns, e.x[i]!, e.y[i]!, 0, p.index);
  if (e.hp[i]! <= 0) {
    e.hp[i] = 0;
    p.dead = true;
    p.deathT = 0;
    e.flags[i] = e.flags[i]! | EF.Dying;
    w.events.push(Ev.PlayerDown, e.x[i]!, e.y[i]!, p.index);
  }
  return true;
}

export function healPlayer(w: World, p: SimPlayer, amount: number): void {
  const e = w.e;
  if (p.dead) return;
  const before = e.hp[p.ent]!;
  e.hp[p.ent] = Math.min(e.maxHp[p.ent]!, before + amount);
  w.events.push(Ev.Heal, e.x[p.ent]!, e.y[p.ent]!, p.index, Math.round(e.hp[p.ent]! - before));
}

export const BURN_TICK = secToTicks(0.5);
