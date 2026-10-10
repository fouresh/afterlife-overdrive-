import { TF } from '@ao/procgen';
import {
  Btn,
  PI,
  Rng,
  TICK_DT,
  angleDiff,
  byteToAngle,
  datan2,
  dcos,
  deriveSeed,
  dsin,
  emptyInput,
  secToTicks,
} from '@ao/shared';
import { lineOfSight, moveBox } from './collide';
import { damageEnemy, dropItem, healPlayer } from './damage';
import { EF, Kind, PickupKind, PropKind, Team } from './entities';
import { Ev } from './events';
import { itemBase, levelScale, type ItemInstance } from './items';
import { spawnAlly, spawnArea, spawnPickup, spawnProjectile } from './spawn';
import { emptyLoadout, type Loadout } from './stats';
import {
  BAG_SIZE,
  DASH_IFRAMES,
  DASH_RECHARGE_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  MAX_POTIONS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  defaultProgress,
  recomputeStats,
  statsFor,
  tileCenter,
  type Progress,
  type SimPlayer,
  type World,
} from './world';

export interface PlayerSetup {
  loadout?: Loadout;
  bag?: ItemInstance[];
  gold?: number;
  potions?: number;
  /** HP carried over from the previous floor (undefined = full). */
  hp?: number;
  dropCount?: number;
  xp?: number;
  kills?: number;
  progress?: Progress;
  killsBy?: Record<string, number>;
  chests?: number;
}

export function addPlayer(w: World, setup: PlayerSetup = {}): SimPlayer {
  const index = w.players.length;
  const x = tileCenter(w.floor.start.x) + (index % 2) * 10 - 5 * Math.min(1, index);
  const y = tileCenter(w.floor.start.y) + (index >> 1) * 10;
  const ent = w.e.spawn(Kind.Player, x, y);
  const loadout = setup.loadout ?? emptyLoadout();
  const progress = setup.progress ?? defaultProgress();
  const stats = statsFor(loadout, progress);
  w.e.team[ent] = Team.Players;
  w.e.r[ent] = PLAYER_RADIUS;
  w.e.maxHp[ent] = stats.maxHp;
  w.e.hp[ent] = Math.min(stats.maxHp, setup.hp ?? stats.maxHp);
  w.e.flags[ent] = EF.Body;
  w.e.ref[ent] = index;
  const p: SimPlayer = {
    index,
    ent,
    progress,
    killsBy: setup.killsBy ?? {},
    chests: setup.chests ?? 0,
    input: emptyInput(),
    prevButtons: 0,
    loadout,
    stats,
    lookVersion: 0,
    bag: setup.bag ?? [],
    gold: setup.gold ?? 0,
    potions: setup.potions ?? 1,
    xp: setup.xp ?? 0,
    kills: setup.kills ?? 0,
    dropCount: setup.dropCount ?? 0,
    attackCd: 0,
    skillCd: [0, 0],
    skillCdMax: [1, 1],
    buffs: [],
    shield: 0,
    shieldT: 0,
    dashCharges: stats.dashCharges,
    dashRecharge: 0,
    dashT: 0,
    dashDx: 0,
    dashDy: 0,
    dashSpeed: DASH_SPEED,
    dashDamage: 0,
    dashSeq: 0,
    moving: false,
    aim: 0,
    swingT: 0,
    swingMax: 1,
    interact: -1,
    regenAcc: 0,
    dead: false,
    deathT: 0,
    lootRng: new Rng(deriveSeed(w.runSeed, 'loot', index, w.depth)),
  };
  w.players.push(p);
  return p;
}

const tmp = { x: 0, y: 0 };
const AUTO_AIM_RANGE = 170;

/** Nearest living enemy within range and line of sight, or -1. */
export function nearestEnemy(
  w: World,
  x: number,
  y: number,
  range: number,
  needLos = true,
): number {
  const e = w.e;
  let best = -1;
  let bestD = range * range;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Enemy || e.flags[i]! & EF.Dying) continue;
    const dx = e.x[i]! - x;
    const dy = e.y[i]! - y;
    const d = dx * dx + dy * dy;
    if (d < bestD && (!needLos || lineOfSight(w.map, x, y, e.x[i]!, e.y[i]!))) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function buffSum(p: SimPlayer, key: 'damagePct' | 'attackSpeedPct' | 'moveSpeedPct'): number {
  let s = 0;
  for (const b of p.buffs) s += b[key];
  return s;
}

export function updatePlayer(w: World, p: SimPlayer): void {
  const e = w.e;
  const i = p.ent;
  if (!e.alive[i]) return;
  if (p.dead) {
    p.deathT++;
    e.vx[i] = 0;
    e.vy[i] = 0;
    return;
  }
  const inp = p.input;
  const pressed = inp.buttons & ~p.prevButtons;
  p.prevButtons = inp.buttons;

  const len = Math.sqrt(inp.mx * inp.mx + inp.my * inp.my);
  const mag = len > 127 ? 1 : len / 127;
  const dirX = len > 0 ? inp.mx / len : 0;
  const dirY = len > 0 ? inp.my / len : 0;
  p.moving = mag > 0;

  // Timers
  if (p.attackCd > 0) p.attackCd--;
  if (p.skillCd[0] > 0) p.skillCd[0]--;
  if (p.skillCd[1] > 0) p.skillCd[1]--;
  if (p.swingT > 0) p.swingT--;
  for (let k = p.buffs.length - 1; k >= 0; k--) if (--p.buffs[k]!.ticks <= 0) p.buffs.splice(k, 1);
  if (p.shieldT > 0 && --p.shieldT === 0) p.shield = 0;
  if (p.stats.hpRegen > 0 && e.hp[i]! < e.maxHp[i]!) {
    p.regenAcc += p.stats.hpRegen * TICK_DT;
    if (p.regenAcc >= 1) {
      e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + Math.floor(p.regenAcc));
      p.regenAcc -= Math.floor(p.regenAcc);
    }
  }

  // Aim: mouse → explicit; otherwise auto-aim at the nearest enemy, else the movement direction.
  const target = nearestEnemy(w, e.x[i]!, e.y[i]!, AUTO_AIM_RANGE);
  if (inp.buttons & Btn.ManualAim) p.aim = byteToAngle(inp.aim);
  else if (target >= 0) p.aim = datan2(e.y[target]! - e.y[i]!, e.x[target]! - e.x[i]!);
  else if (mag > 0) p.aim = datan2(dirY, dirX);
  e.face[i] = p.aim;

  // Dash charges
  if (p.dashCharges < p.stats.dashCharges) {
    if (++p.dashRecharge >= DASH_RECHARGE_TICKS) {
      p.dashRecharge = 0;
      p.dashCharges++;
    }
  }
  if (pressed & Btn.Dash && p.dashCharges > 0 && p.dashT === 0) {
    p.dashCharges--;
    startDash(
      w,
      p,
      mag > 0 ? dirX : dcos(p.aim),
      mag > 0 ? dirY : dsin(p.aim),
      DASH_TICKS,
      DASH_SPEED,
      0,
    );
    e.iframes[i] = Math.max(e.iframes[i]!, DASH_IFRAMES);
  }

  if (inp.buttons & Btn.Attack && p.attackCd === 0) attack(w, p, target);
  if (pressed & Btn.Skill1) useSkill(w, p, 0, target);
  if (pressed & Btn.Skill2) useSkill(w, p, 1, target);
  if (pressed & Btn.Potion && p.potions > 0 && e.hp[i]! < e.maxHp[i]!) {
    p.potions--;
    healPlayer(w, p, Math.round(e.maxHp[i]! * 0.4));
  }
  updateInteract(w, p);
  if (pressed & Btn.Interact && p.interact >= 0) interact(w, p, p.interact);

  // Movement
  if (p.dashT > 0) {
    p.dashT--;
    e.vx[i] = p.dashDx * p.dashSpeed;
    e.vy[i] = p.dashDy * p.dashSpeed;
    if (p.dashDamage > 0) dashHits(w, p);
  } else {
    const slow = e.slowT[i]! > 0 ? 0.55 : 1;
    const speed =
      PLAYER_SPEED * (1 + (p.stats.moveSpeedPct + buffSum(p, 'moveSpeedPct')) / 100) * slow;
    const tvx = dirX * mag * speed;
    const tvy = dirY * mag * speed;
    e.vx[i] = e.vx[i]! + (tvx - e.vx[i]!) * 0.6;
    e.vy[i] = e.vy[i]! + (tvy - e.vy[i]!) * 0.6;
  }
  const dx = (e.vx[i]! + e.kx[i]!) * TICK_DT;
  const dy = (e.vy[i]! + e.ky[i]!) * TICK_DT;
  moveBox(w.map, e.x[i]!, e.y[i]!, e.r[i]!, dx, dy, TF.BlockWalk, tmp);
  e.x[i] = tmp.x;
  e.y[i] = tmp.y;
}

function startDash(
  w: World,
  p: SimPlayer,
  dx: number,
  dy: number,
  ticks: number,
  speed: number,
  damage: number,
) {
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  p.dashDx = dx / len;
  p.dashDy = dy / len;
  p.dashT = ticks;
  p.dashSpeed = speed;
  p.dashDamage = damage;
  p.dashSeq = w.stampSeq++;
  w.events.push(Ev.Dash, w.e.x[p.ent]!, w.e.y[p.ent]!, p.index, damage > 0 ? 1 : 0);
}

function dashHits(w: World, p: SimPlayer): void {
  const e = w.e;
  const px = e.x[p.ent]!;
  const py = e.y[p.ent]!;
  const n = w.spatial.query(px, py, 20);
  for (let k = 0; k < n; k++) {
    const j = w.spatial.out[k]!;
    if (e.kind[j] !== Kind.Enemy || w.hitStamp[j] === p.dashSeq) continue;
    const dx = e.x[j]! - px;
    const dy = e.y[j]! - py;
    const rr = e.r[j]! + 8;
    if (dx * dx + dy * dy <= rr * rr) {
      w.hitStamp[j] = p.dashSeq;
      damageEnemy(w, j, p.dashDamage, px, py, 120, p.index);
    }
  }
}

/** Damage multiplier for weapon attacks including crit roll. */
function rollDamage(
  w: World,
  p: SimPlayer,
  base: number,
  level: number,
): { dmg: number; crit: boolean } {
  const mul = levelScale(level) * (1 + (p.stats.damagePct + buffSum(p, 'damagePct')) / 100);
  const crit = w.rng.next() * 100 < p.stats.critChance;
  return { dmg: base * mul * (crit ? 1.5 + p.stats.critDamage / 100 - 0.5 : 1), crit };
}

function attack(w: World, p: SimPlayer, target: number): void {
  const wpn = p.loadout.weapon;
  if (!wpn) return;
  const b = itemBase(wpn);
  if (b.kind !== 'weapon') return;
  const atk = b.def.attack;
  const e = w.e;
  const x = e.x[p.ent]!;
  const y = e.y[p.ent]! - 4;
  const speedMul = 1 + (p.stats.attackSpeedPct + buffSum(p, 'attackSpeedPct')) / 100;
  p.attackCd = Math.max(3, secToTicks(atk.cooldown / speedMul));
  if (atk.kind === 'melee_arc') {
    meleeArc(w, p, x, y, atk.range, atk.arc, atk.damage, wpn.level, atk.knockback, atk.deflect);
  } else if (atk.kind === 'thrust') {
    thrust(w, p, x, y, atk.range, atk.width, atk.damage, wpn.level, atk.knockback);
    if (atk.lunge > 0) {
      e.kx[p.ent] = e.kx[p.ent]! + dcos(p.aim) * atk.lunge * 12;
      e.ky[p.ent] = e.ky[p.ent]! + dsin(p.aim) * atk.lunge * 12;
    }
  } else {
    if (atk.melee && target >= 0) {
      const dx = e.x[target]! - x;
      const dy = e.y[target]! - y;
      const rr = atk.melee.range + e.r[target]!;
      if (dx * dx + dy * dy <= rr * rr) {
        meleeArc(
          w,
          p,
          x,
          y,
          atk.melee.range,
          atk.melee.arc,
          atk.melee.damage,
          wpn.level,
          120,
          true,
        );
        return;
      }
    }
    const proj = w.content.projectileIndex.get(atk.projectile) ?? 0;
    const count = atk.count + p.stats.extraProjectiles;
    const spread = ((atk.spread + (count > atk.count ? 8 : 0)) * PI) / 180;
    for (let k = 0; k < count; k++) {
      const off = count > 1 ? -spread / 2 + (spread * k) / (count - 1) : 0;
      const { dmg, crit } = rollDamage(w, p, atk.damage, wpn.level);
      const pi = spawnProjectile(
        w,
        proj,
        x + dcos(p.aim) * 6,
        y + dsin(p.aim) * 6,
        p.aim + off,
        Team.Players,
        p.ent,
        dmg,
        p.stats.pierce,
      );
      if (pi >= 0 && crit) w.e.aux1[pi] = 1;
    }
    p.swingT = 4;
    p.swingMax = 4;
    w.events.push(Ev.Shoot, x, y, p.index, proj, p.aim);
  }
}

function meleeArc(
  w: World,
  p: SimPlayer,
  x: number,
  y: number,
  range: number,
  arcDeg: number,
  base: number,
  level: number,
  knock: number,
  deflect: boolean,
): void {
  const e = w.e;
  const half = (arcDeg * PI) / 360;
  p.swingT = 7;
  p.swingMax = 7;
  w.events.push(Ev.Swing, x, y, p.index, range, p.aim);
  const n = w.spatial.query(x, y, range + 16);
  for (let k = 0; k < n; k++) {
    const j = w.spatial.out[k]!;
    if (e.kind[j] !== Kind.Enemy) continue;
    const dx = e.x[j]! - x;
    const dy = e.y[j]! - y;
    const rr = range + e.r[j]!;
    if (dx * dx + dy * dy > rr * rr) continue;
    if (Math.abs(angleDiff(p.aim, datan2(dy, dx))) > half && dx * dx + dy * dy > 64) continue;
    const { dmg, crit } = rollDamage(w, p, base, level);
    damageEnemy(w, j, dmg, x, y, knock, p.index, crit);
  }
  if (deflect) {
    for (let j = 0; j < e.hi; j++) {
      if (!e.alive[j] || e.kind[j] !== Kind.Projectile || e.team[j] !== Team.Enemies) continue;
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - y;
      if (dx * dx + dy * dy > (range + 4) * (range + 4)) continue;
      if (Math.abs(angleDiff(p.aim, datan2(dy, dx))) > half) continue;
      w.events.push(Ev.Hit, e.x[j]!, e.y[j]!, -1, 0, 2);
      e.kill(j);
    }
  }
}

function thrust(
  w: World,
  p: SimPlayer,
  x: number,
  y: number,
  range: number,
  width: number,
  base: number,
  level: number,
  knock: number,
) {
  const e = w.e;
  const c = dcos(p.aim);
  const s = dsin(p.aim);
  p.swingT = 5;
  p.swingMax = 5;
  w.events.push(Ev.Swing, x, y, p.index, -range, p.aim);
  const n = w.spatial.query(x + c * range * 0.5, y + s * range * 0.5, range);
  for (let k = 0; k < n; k++) {
    const j = w.spatial.out[k]!;
    if (e.kind[j] !== Kind.Enemy) continue;
    const dx = e.x[j]! - x;
    const dy = e.y[j]! - y;
    const along = dx * c + dy * s;
    const perp = Math.abs(-dx * s + dy * c);
    if (along < -4 || along > range + e.r[j]! || perp > width / 2 + e.r[j]!) continue;
    const { dmg, crit } = rollDamage(w, p, base, level);
    damageEnemy(w, j, dmg, x, y, knock, p.index, crit);
  }
}

function useSkill(w: World, p: SimPlayer, slot: 0 | 1, target: number): void {
  const art = p.loadout.artifacts[slot];
  if (!art || p.skillCd[slot] > 0) return;
  const b = itemBase(art);
  if (b.kind !== 'artifact') return;
  const def = b.def;
  const e = w.e;
  const x = e.x[p.ent]!;
  const y = e.y[p.ent]! - 4;
  const power =
    (1 + (p.stats.skillPowerPct + (p.stats.damagePct + buffSum(p, 'damagePct')) / 2) / 100) *
    levelScale(art.level);
  const tx = target >= 0 ? e.x[target]! : x + dcos(p.aim) * 60;
  const ty = target >= 0 ? e.y[target]! : y + dsin(p.aim) * 60;
  for (const fx of def.effects) {
    switch (fx.type) {
      case 'projectile': {
        const proj = w.content.projectileIndex.get(fx.projectile) ?? 0;
        for (let k = 0; k < fx.count; k++) {
          const a =
            fx.aim === 'radial'
              ? (2 * PI * k) / fx.count
              : p.aim +
                (fx.count > 1
                  ? ((-fx.spread / 2 + (fx.spread * k) / (fx.count - 1)) * PI) / 180
                  : 0);
          spawnProjectile(w, proj, x, y, a, Team.Players, p.ent, fx.damage * power, p.stats.pierce);
        }
        break;
      }
      case 'area': {
        const ax = fx.at === 'self' ? x : tx;
        const ay = fx.at === 'self' ? y + 4 : ty;
        spawnArea(
          w,
          ax,
          ay,
          fx.radius,
          Math.max(1, secToTicks(fx.delay)),
          fx.damage * power,
          Team.Players,
          p.ent,
          fx.color,
          fx.knockback,
          fx.slow,
        );
        break;
      }
      case 'dash': {
        const ticks = 8;
        startDash(
          w,
          p,
          dcos(p.aim),
          dsin(p.aim),
          ticks,
          (fx.distance / ticks) * 30,
          fx.damage * power,
        );
        e.iframes[p.ent] = Math.max(e.iframes[p.ent]!, secToTicks(fx.iframes));
        break;
      }
      case 'buff':
        p.buffs.push({
          damagePct: fx.damagePct,
          attackSpeedPct: fx.attackSpeedPct,
          moveSpeedPct: fx.moveSpeedPct,
          ticks: secToTicks(fx.duration),
          color: fx.color,
        });
        break;
      case 'heal':
        healPlayer(w, p, Math.round((e.maxHp[p.ent]! * fx.pctMaxHp * power) / 100));
        break;
      case 'shield':
        p.shield = fx.amount * power;
        p.shieldT = secToTicks(fx.duration);
        break;
      case 'summon': {
        const ally = w.content.allyIndex.get(fx.ally) ?? 0;
        for (let k = 0; k < fx.count; k++)
          spawnAlly(w, ally, p.ent, secToTicks(fx.duration), (2 * PI * k) / fx.count);
        break;
      }
    }
  }
  const cd = secToTicks(def.cooldown * (1 - p.stats.cooldownPct / 100));
  p.skillCd[slot] = cd;
  p.skillCdMax[slot] = cd;
  w.events.push(Ev.Skill, x, y, p.index, slot, def.color);
}

const INTERACT_RANGE = 22;

function updateInteract(w: World, p: SimPlayer): void {
  const e = w.e;
  const x = e.x[p.ent]!;
  const y = e.y[p.ent]!;
  let best = -1;
  let bestD = INTERACT_RANGE * INTERACT_RANGE;
  for (let j = 0; j < e.hi; j++) {
    if (!e.alive[j]) continue;
    const k = e.kind[j];
    if (k === Kind.Pickup) {
      if (e.def[j] !== PickupKind.Item) continue;
      if (e.owner[j]! >= 0 && e.owner[j] !== p.index) continue;
    } else if (k === Kind.Prop) {
      const pk = e.def[j];
      if (pk === PropKind.Spikes) continue;
      if (pk === PropKind.Chest && e.state[j]) continue;
      if (pk === PropKind.Stairs && !w.stairsOpen) continue;
      if (pk === PropKind.Shop && w.shop[e.ref[j]!]?.sold !== false) continue;
    } else continue;
    const dx = e.x[j]! - x;
    const dy = e.y[j]! - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  p.interact = best;
}

/** Put an item into the right slot (empty slot → equip, otherwise the bag). */
export function takeItem(w: World, p: SimPlayer, item: ItemInstance): boolean {
  const b = itemBase(item);
  const l = p.loadout;
  if (b.slot === 'artifact') {
    const slot: 0 | 1 | -1 = l.artifacts[0] ? (l.artifacts[1] ? -1 : 1) : 0;
    if (slot !== -1) {
      l.artifacts[slot] = item;
      recomputeStats(w, p);
      return true;
    }
  } else if (!l[b.slot]) {
    l[b.slot] = item;
    recomputeStats(w, p);
    return true;
  }
  if (p.bag.length >= BAG_SIZE) return false;
  p.bag.push(item);
  return true;
}

/** Swap a bag item into its slot (from the inventory UI). Returns false if invalid. */
export function equipFromBag(
  w: World,
  p: SimPlayer,
  bagIndex: number,
  artifactSlot: 0 | 1 = 0,
): boolean {
  const item = p.bag[bagIndex];
  if (!item) return false;
  const b = itemBase(item);
  const l = p.loadout;
  let old: ItemInstance | null;
  if (b.slot === 'artifact') {
    old = l.artifacts[artifactSlot];
    l.artifacts[artifactSlot] = item;
    p.skillCd[artifactSlot] = Math.max(p.skillCd[artifactSlot], 30);
  } else {
    old = l[b.slot];
    l[b.slot] = item;
  }
  p.bag.splice(bagIndex, 1);
  if (old) p.bag.splice(bagIndex, 0, old);
  recomputeStats(w, p);
  return true;
}

function interact(w: World, p: SimPlayer, j: number): void {
  const e = w.e;
  if (e.kind[j] === Kind.Pickup) {
    const drop = w.drops[e.ref[j]!];
    if (drop?.item && takeItem(w, p, drop.item)) {
      w.events.push(Ev.Pickup, e.x[j]!, e.y[j]!, p.index, 2, drop.item.rarity);
      e.kill(j);
    } else {
      w.events.push(Ev.Pickup, e.x[j]!, e.y[j]!, p.index, -1);
    }
    return;
  }
  const kind = e.def[j];
  if (kind === PropKind.Chest) {
    e.state[j] = 1;
    for (const q of w.players) if (!q.dead) q.chests++;
    w.events.push(Ev.ChestOpen, e.x[j]!, e.y[j]!, j);
    const quality = e.ref[j]!;
    for (const q of w.players) {
      if (q.dead) continue;
      for (let k = 0; k < Math.max(1, quality); k++) {
        dropItem(w, q, e.x[j]!, e.y[j]! + 6, 0.8 + quality * 0.4);
      }
      const gold = Math.round((10 + w.depth * 8) * (1 + q.stats.goldFindPct / 100));
      spawnPickup(w, PickupKind.Gold, e.x[j]!, e.y[j]! + 4, {
        item: null,
        amount: gold,
        owner: q.index,
      });
    }
  } else if (kind === PropKind.Stairs) {
    w.outcome = 'exit';
    w.events.push(Ev.FloorExit, e.x[j]!, e.y[j]!, p.index);
  } else if (kind === PropKind.Portal) {
    w.outcome = 'victory';
    w.events.push(Ev.FloorExit, e.x[j]!, e.y[j]!, p.index, 1);
  } else if (kind === PropKind.Station) {
    w.events.push(Ev.Talk, e.x[j]!, e.y[j]!, e.ref[j]!, p.index);
  } else if (kind === PropKind.Shop) {
    const slot = w.shop[e.ref[j]!];
    if (!slot || slot.sold) return;
    if (p.gold < slot.price) {
      w.events.push(Ev.Pickup, e.x[j]!, e.y[j]!, p.index, -2);
      return;
    }
    if (slot.potion) {
      if (p.potions >= MAX_POTIONS) {
        w.events.push(Ev.Pickup, e.x[j]!, e.y[j]!, p.index, -3);
        return;
      }
      p.potions++;
    } else if (slot.item && !takeItem(w, p, slot.item)) {
      w.events.push(Ev.Pickup, e.x[j]!, e.y[j]!, p.index, -1);
      return;
    }
    p.gold -= slot.price;
    slot.sold = true;
    w.events.push(Ev.Coin, e.x[j]!, e.y[j]!, p.index, -slot.price);
  }
}
