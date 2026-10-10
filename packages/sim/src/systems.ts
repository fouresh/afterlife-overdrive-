import { TF, Tile } from '@ao/procgen';
import { PI, TICK_DT, TILE, datan2, dcos, dsin, secToTicks, wrapAngle } from '@ao/shared';
import { moveBox, pointBlocked } from './collide';
import { BURN_TICK, damageEnemy, damagePlayer } from './damage';
import { EF, Kind, PickupKind, PropKind, Team } from './entities';
import { Ev } from './events';
import { nearestEnemy } from './player';
import { spawnProjectile } from './spawn';
import { MAX_POTIONS, type World } from './world';

const tmp = { x: 0, y: 0 };

function explode(
  w: World,
  x: number,
  y: number,
  radius: number,
  dmg: number,
  team: number,
  owner: number,
  color: number,
  knock: number,
  slowSec: number,
) {
  const e = w.e;
  w.events.push(Ev.Explosion, x, y, owner, color, radius);
  if (team === Team.Players) {
    const pi = owner >= 0 && e.kind[owner] === Kind.Player ? e.ref[owner]! : -1;
    const n = w.spatial.query(x, y, radius + 12);
    for (let k = 0; k < n; k++) {
      const j = w.spatial.out[k]!;
      if (e.kind[j] !== Kind.Enemy) continue;
      const dx = e.x[j]! - x;
      const dy = e.y[j]! - y;
      const rr = radius + e.r[j]!;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (dmg > 0) damageEnemy(w, j, dmg, x, y, knock, pi);
      else if (knock > 0) {
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        e.kx[j] = e.kx[j]! + (dx / d) * knock;
        e.ky[j] = e.ky[j]! + (dy / d) * knock;
      }
      if (slowSec > 0) e.slowT[j] = Math.max(e.slowT[j]!, secToTicks(slowSec));
    }
  } else {
    for (const p of w.players) {
      if (p.dead) continue;
      const dx = e.x[p.ent]! - x;
      const dy = e.y[p.ent]! - y;
      const rr = radius + e.r[p.ent]!;
      if (dx * dx + dy * dy <= rr * rr)
        damagePlayer(
          w,
          p,
          dmg,
          x,
          y,
          knock,
          owner >= 0 && e.kind[owner] === Kind.Enemy ? owner : -1,
        );
    }
  }
}

export function updateProjectiles(w: World): void {
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Projectile) continue;
    const def = w.content.projectiles[e.def[i]!]!;
    const team = e.team[i]!;
    if (--e.life[i]! <= 0) {
      if (def.explode)
        explode(
          w,
          e.x[i]!,
          e.y[i]!,
          def.explode.radius,
          e.dmg[i]! * def.explode.damageMul,
          team,
          e.owner[i]!,
          def.glow ?? 0xffffff,
          80,
          0,
        );
      e.kill(i);
      continue;
    }
    // Homing: turn toward the nearest target.
    if (def.homing > 0) {
      let tx = 0;
      let ty = 0;
      let found = false;
      if (team === Team.Players) {
        const t = nearestEnemy(w, e.x[i]!, e.y[i]!, 110, false);
        if (t >= 0) {
          tx = e.x[t]!;
          ty = e.y[t]!;
          found = true;
        }
      } else {
        let best = 140 * 140;
        for (const p of w.players) {
          if (p.dead) continue;
          const dx = e.x[p.ent]! - e.x[i]!;
          const dy = e.y[p.ent]! - e.y[i]!;
          if (dx * dx + dy * dy < best) {
            best = dx * dx + dy * dy;
            tx = e.x[p.ent]!;
            ty = e.y[p.ent]!;
            found = true;
          }
        }
      }
      if (found) {
        const cur = datan2(e.vy[i]!, e.vx[i]!);
        const want = datan2(ty - e.y[i]!, tx - e.x[i]!);
        const maxTurn = (def.homing * PI) / 180 / 30;
        const diff = wrapAngle(want - cur);
        const na = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
        e.vx[i] = dcos(na) * def.speed;
        e.vy[i] = dsin(na) * def.speed;
      }
    }
    e.face[i] = datan2(e.vy[i]!, e.vx[i]!);
    const stepLen = def.speed * TICK_DT;
    const sub = Math.max(1, Math.ceil(stepLen / 5));
    let dead = false;
    for (let s = 0; s < sub && !dead; s++) {
      e.x[i] = e.x[i]! + (e.vx[i]! * TICK_DT) / sub;
      e.y[i] = e.y[i]! + (e.vy[i]! * TICK_DT) / sub;
      if (pointBlocked(w.map, e.x[i]!, e.y[i]!, TF.BlockShot)) {
        w.events.push(Ev.Hit, e.x[i]!, e.y[i]!, -1, 0, 3);
        if (def.explode)
          explode(
            w,
            e.x[i]!,
            e.y[i]!,
            def.explode.radius,
            e.dmg[i]! * def.explode.damageMul,
            team,
            e.owner[i]!,
            def.glow ?? 0xffffff,
            80,
            0,
          );
        e.kill(i);
        break;
      }
      if (team === Team.Players) {
        const owner = e.owner[i]!;
        const pi = owner >= 0 && e.kind[owner] === Kind.Player ? e.ref[owner]! : -1;
        const n = w.spatial.query(e.x[i]!, e.y[i]!, e.r[i]! + 14);
        for (let k = 0; k < n; k++) {
          const j = w.spatial.out[k]!;
          if (
            e.kind[j] !== Kind.Enemy ||
            e.flags[j]! & (EF.Dying | EF.Invulnerable) ||
            j === e.aux2[i]
          )
            continue;
          const dx = e.x[j]! - e.x[i]!;
          const dy = e.y[j]! - e.y[i]!;
          const rr = e.r[i]! + e.r[j]!;
          if (dx * dx + dy * dy > rr * rr) continue;
          if (def.explode) {
            explode(
              w,
              e.x[i]!,
              e.y[i]!,
              def.explode.radius,
              e.dmg[i]! * def.explode.damageMul,
              team,
              owner,
              def.glow ?? 0xffffff,
              100,
              0,
            );
          } else {
            damageEnemy(
              w,
              j,
              e.dmg[i]!,
              e.x[i]! - e.vx[i]! * 0.05,
              e.y[i]! - e.vy[i]! * 0.05,
              70,
              pi,
              e.aux1[i] === 1,
            );
          }
          if (def.slow > 0) e.slowT[j] = Math.max(e.slowT[j]!, secToTicks(def.slow));
          if (def.burn > 0) e.burnT[j] = Math.max(e.burnT[j]!, secToTicks(def.burn));
          e.aux2[i] = j;
          if (def.explode || e.pierce[i]! === 0) {
            e.kill(i);
            dead = true;
            break;
          }
          e.pierce[i]!--;
        }
      } else {
        for (const p of w.players) {
          if (p.dead) continue;
          const dx = e.x[p.ent]! - e.x[i]!;
          const dy = e.y[p.ent]! - (e.y[i]! + 2);
          const rr = e.r[i]! + e.r[p.ent]! - 1;
          if (dx * dx + dy * dy > rr * rr) continue;
          if (e.iframes[p.ent]! > 0 || p.dashT > 0) continue;
          damagePlayer(w, p, e.dmg[i]!, e.x[i]!, e.y[i]!, 60, e.owner[i]!);
          w.events.push(Ev.Hit, e.x[i]!, e.y[i]!, -1, 0, 4);
          e.kill(i);
          dead = true;
          break;
        }
      }
    }
  }
}

export function updateAreas(w: World): void {
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Area) continue;
    if (--e.timer[i]! <= 0) {
      explode(
        w,
        e.x[i]!,
        e.y[i]!,
        e.r[i]!,
        e.dmg[i]!,
        e.team[i]!,
        e.owner[i]!,
        e.ref[i]!,
        e.aux0[i]!,
        e.aux1[i]!,
      );
      e.kill(i);
    }
  }
}

export function updateAllies(w: World): void {
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Ally) continue;
    const owner = e.owner[i]!;
    if (--e.life[i]! <= 0 || !e.alive[owner] || e.flags[owner]! & EF.Dying) {
      w.events.push(Ev.Explosion, e.x[i]!, e.y[i]!, -1, 0xaaf6ec, 6);
      e.kill(i);
      continue;
    }
    const ally = w.content.allies[e.def[i]!]!;
    const ang = e.aux0[i]! + w.tick * 0.09;
    e.x[i] = e.x[owner]! + dcos(ang) * 16;
    e.y[i] = e.y[owner]! - 8 + dsin(ang) * 10;
    if (e.cooldown[i]! > 0) e.cooldown[i]!--;
    else {
      const t = nearestEnemy(w, e.x[i]!, e.y[i]!, ally.range);
      if (t >= 0) {
        const a = datan2(e.y[t]! - e.y[i]!, e.x[t]! - e.x[i]!);
        const proj = w.content.projectileIndex.get(ally.projectile) ?? 0;
        spawnProjectile(w, proj, e.x[i]!, e.y[i]!, a, Team.Players, owner, ally.damage);
        e.cooldown[i] = secToTicks(ally.cooldown);
      }
    }
  }
}

export function updatePickups(w: World): void {
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Pickup) continue;
    e.stateT[i]!++;
    const kind = e.def[i]!;
    // Pop movement with friction.
    if (e.kx[i] !== 0 || e.ky[i] !== 0) {
      moveBox(
        w.map,
        e.x[i]!,
        e.y[i]!,
        3,
        e.kx[i]! * TICK_DT,
        e.ky[i]! * TICK_DT,
        TF.BlockWalk,
        tmp,
      );
      e.x[i] = tmp.x;
      e.y[i] = tmp.y;
      e.kx[i] = Math.abs(e.kx[i]!) < 2 ? 0 : e.kx[i]! * 0.85;
      e.ky[i] = Math.abs(e.ky[i]!) < 2 ? 0 : e.ky[i]! * 0.85;
    }
    if (kind === PickupKind.Item || e.stateT[i]! < 10) continue;
    const drop = w.drops[e.ref[i]!]!;
    for (const p of w.players) {
      if (p.dead || (drop.owner >= 0 && drop.owner !== p.index)) continue;
      const dx = e.x[p.ent]! - e.x[i]!;
      const dy = e.y[p.ent]! - (e.y[i]! + 4);
      const d2 = dx * dx + dy * dy;
      if (kind === PickupKind.Gold && d2 < 56 * 56) {
        const d = Math.sqrt(d2) || 1;
        const sp = 170 * TICK_DT;
        e.x[i] = e.x[i]! + (dx / d) * Math.min(sp, d);
        e.y[i] = e.y[i]! + (dy / d) * Math.min(sp, d);
      }
      if (d2 > 10 * 10) continue;
      if (kind === PickupKind.Gold) {
        p.gold += drop.amount;
        w.events.push(Ev.Coin, e.x[i]!, e.y[i]!, p.index, drop.amount);
      } else if (kind === PickupKind.Potion) {
        if (p.potions >= MAX_POTIONS) continue;
        p.potions++;
        w.events.push(Ev.Pickup, e.x[i]!, e.y[i]!, p.index, 3);
      } else if (kind === PickupKind.Key) {
        w.keys++;
        w.events.push(Ev.KeyPickup, e.x[i]!, e.y[i]!, p.index);
      }
      e.kill(i);
      break;
    }
  }
}

/** Spike traps: down 48 ticks, warning 6, up 18 (hurts players and walking enemies once per cycle). */
export function updateProps(w: World): void {
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Prop || e.def[i] !== PropKind.Spikes) continue;
    const phase = (w.tick + e.ref[i]!) % 72;
    const up = phase >= 54;
    e.state[i] = up ? 2 : phase >= 48 ? 1 : 0;
    if (phase !== 54) continue;
    w.events.push(Ev.Trap, e.x[i]!, e.y[i]!, i);
    const tx = Math.floor(e.x[i]! / TILE);
    const ty = Math.floor(e.y[i]! / TILE);
    for (const p of w.players) {
      if (p.dead) continue;
      if (Math.floor(e.x[p.ent]! / TILE) === tx && Math.floor((e.y[p.ent]! + 2) / TILE) === ty) {
        damagePlayer(w, p, 12 + w.depth * 3, e.x[i]!, e.y[i]!, 60);
      }
    }
    const n = w.spatial.query(e.x[i]!, e.y[i]!, 12);
    for (let k = 0; k < n; k++) {
      const j = w.spatial.out[k]!;
      if (e.kind[j] !== Kind.Enemy || e.flags[j]! & EF.Flying) continue;
      if (Math.floor(e.x[j]! / TILE) === tx && Math.floor(e.y[j]! / TILE) === ty)
        damageEnemy(w, j, 15, e.x[i]!, e.y[i]!, 40, -1);
    }
  }
}

/** Burn damage over time. */
export function updateStatuses(w: World): void {
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Enemy) continue;
    if (e.burnT[i]! > 0) {
      e.burnT[i]!--;
      if (e.burnT[i]! % BURN_TICK === 0) damageEnemy(w, i, 3 + w.depth, e.x[i]!, e.y[i]!, 0, -1);
    }
  }
}

/** Use a key on a locked door the player is touching. */
export function updateLocks(w: World): void {
  if (w.keys <= 0) return;
  const e = w.e;
  const m = w.map;
  for (const p of w.players) {
    if (p.dead) continue;
    const x = e.x[p.ent]!;
    const y = e.y[p.ent]!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = Math.floor((x + dx * 9) / TILE);
        const ty = Math.floor((y + dy * 9) / TILE);
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
        if (m.tiles[ty * m.w + tx] !== Tile.LockedDoor) continue;
        const door = w.floor.doors.find((d) => d.x === tx && d.y === ty);
        if (!door) continue;
        for (const d of w.floor.doors) {
          if (d.room === door.room && d.locked) m.tiles[d.y * m.w + d.x] = Tile.Door;
        }
        w.keys--;
        w.events.push(Ev.Unlock, (tx + 0.5) * TILE, (ty + 0.5) * TILE, door.room);
        return;
      }
    }
  }
}
