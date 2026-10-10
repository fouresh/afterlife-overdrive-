import { dcos, dsin, secToTicks } from '@ao/shared';
import { EF, Kind, PickupKind, Team, type PropKind } from './entities';
import { Ev } from './events';
import { MAX_ATTACKS, type Drop, type World } from './world';

/** Enemy AI states. */
export const ES = {
  Spawning: 0,
  Move: 1,
  Windup: 2,
  Act: 3,
  Recover: 4,
  Dying: 5,
} as const;

export const SPAWN_TICKS = 18;

export function spawnEnemy(
  w: World,
  def: number,
  x: number,
  y: number,
  room: number,
  extraFlags = 0,
): number {
  const d = w.content.enemies[def];
  if (!d) return -1;
  const e = w.e;
  const i = e.spawn(Kind.Enemy, x, y);
  if (i < 0) return -1;
  e.def[i] = def;
  e.team[i] = Team.Enemies;
  e.r[i] = d.radius;
  const hp = Math.round(d.hp * w.enemyHpMul);
  e.hp[i] = hp;
  e.maxHp[i] = hp;
  let flags = EF.Body | EF.Invulnerable | extraFlags;
  if (d.flying) flags |= EF.Flying;
  if (d.phasing) flags |= EF.Phasing;
  if (d.rank === 'boss' || d.rank === 'miniboss') flags |= EF.Boss;
  e.flags[i] = flags;
  e.state[i] = ES.Spawning;
  e.stateT[i] = 0;
  e.room[i] = room;
  e.face[i] = w.rng.range(-3.14, 3.14);
  e.owner[i] = -1;
  e.aux2[i] = 0;
  for (let k = 0; k < MAX_ATTACKS; k++) {
    const atk = d.attacks[k];
    w.atkCd[i * MAX_ATTACKS + k] = atk ? secToTicks(atk.cooldown * w.rng.range(0.3, 0.9)) : 0;
  }
  if (room >= 0 && w.rooms[room]) w.rooms[room]!.alive++;
  if (d.rank === 'boss') w.bossEnt = i;
  w.events.push(Ev.Spawn, x, y, i, def);
  return i;
}

export function spawnProjectile(
  w: World,
  proj: number,
  x: number,
  y: number,
  angle: number,
  team: number,
  owner: number,
  dmg: number,
  extraPierce = 0,
): number {
  const p = w.content.projectiles[proj];
  if (!p) return -1;
  const e = w.e;
  const i = e.spawn(Kind.Projectile, x, y);
  if (i < 0) return -1;
  const c = cosA(angle);
  const s = sinA(angle);
  e.def[i] = proj;
  e.team[i] = team;
  e.owner[i] = owner;
  e.vx[i] = c * p.speed;
  e.vy[i] = s * p.speed;
  e.face[i] = angle;
  e.r[i] = p.radius;
  e.dmg[i] = dmg;
  e.pierce[i] = p.pierce + extraPierce;
  e.life[i] = Math.max(1, Math.round((p.range / p.speed) * 30));
  e.aux2[i] = -1; // last entity hit
  e.flags[i] = EF.Flying;
  return i;
}

export function spawnArea(
  w: World,
  x: number,
  y: number,
  radius: number,
  delayTicks: number,
  dmg: number,
  team: number,
  owner: number,
  color: number,
  knock = 0,
  slowSec = 0,
): number {
  const e = w.e;
  const i = e.spawn(Kind.Area, x, y);
  if (i < 0) return -1;
  e.team[i] = team;
  e.owner[i] = owner;
  e.r[i] = radius;
  e.dmg[i] = dmg;
  e.life[i] = Math.max(1, delayTicks);
  e.timer[i] = Math.max(1, delayTicks);
  e.aux0[i] = knock;
  e.aux1[i] = slowSec;
  e.ref[i] = color;
  w.events.push(Ev.Telegraph, x, y, i, color, radius);
  return i;
}

export function spawnPickup(w: World, kind: number, x: number, y: number, drop: Drop): number {
  const e = w.e;
  const i = e.spawn(Kind.Pickup, x, y);
  if (i < 0) return -1;
  e.def[i] = kind;
  e.r[i] = kind === PickupKind.Item ? 6 : 4;
  e.owner[i] = drop.owner;
  e.ref[i] = w.drops.length;
  w.drops.push(drop);
  // Little "pop" so piles spread out.
  const a = w.rng.range(-3.14, 3.14);
  const sp = kind === PickupKind.Item ? 40 : w.rng.range(30, 80);
  e.kx[i] = cosA(a) * sp;
  e.ky[i] = sinA(a) * sp;
  e.stateT[i] = 0;
  return i;
}

export function spawnProp(
  w: World,
  kind: (typeof PropKind)[keyof typeof PropKind],
  tx: number,
  ty: number,
  ref = -1,
  room = -1,
): number {
  const e = w.e;
  const i = e.spawn(Kind.Prop, tx * 16 + 8, ty * 16 + 8);
  if (i < 0) return -1;
  e.def[i] = kind;
  e.ref[i] = ref;
  e.room[i] = room;
  e.r[i] = 7;
  return i;
}

export function spawnAlly(
  w: World,
  ally: number,
  ownerEnt: number,
  lifeTicks: number,
  phase: number,
): number {
  const e = w.e;
  const i = e.spawn(Kind.Ally, e.x[ownerEnt]!, e.y[ownerEnt]!);
  if (i < 0) return -1;
  e.def[i] = ally;
  e.team[i] = Team.Players;
  e.owner[i] = ownerEnt;
  e.life[i] = lifeTicks;
  e.aux0[i] = phase;
  e.r[i] = 3;
  e.flags[i] = EF.Flying;
  return i;
}

export const cosA = dcos;
export const sinA = dsin;
