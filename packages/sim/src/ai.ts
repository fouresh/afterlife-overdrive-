import type { EnemyAttack, EnemyDef } from '@ao/content';
import { TF } from '@ao/procgen';
import { PI, TICK_DT, TILE, angleDiff, datan2, dcos, dsin, secToTicks } from '@ao/shared';
import { lineOfSight, moveBox, pointBlocked } from './collide';
import { damagePlayer } from './damage';
import { EF, Kind, Team } from './entities';
import { Ev } from './events';
import { ES, SPAWN_TICKS, spawnArea, spawnEnemy, spawnProjectile } from './spawn';
import { MAX_ATTACKS, type SimPlayer, type World } from './world';

const tmp = { x: 0, y: 0 };
const flowDir = { x: 0, y: 0 };

/** Attack list for the enemy's current phase (phase index is kept in `cooldown`). */
function attacksOf(def: EnemyDef, phase: number): EnemyAttack[] {
  return phase > 0 ? def.phases[phase - 1]!.attacks : def.attacks;
}

function nearestPlayer(w: World, x: number, y: number): SimPlayer | undefined {
  let best: SimPlayer | undefined;
  let bestD = Infinity;
  for (const p of w.players) {
    if (p.dead) continue;
    const dx = w.e.x[p.ent]! - x;
    const dy = w.e.y[p.ent]! - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function actTicks(atk: EnemyAttack): number {
  const a = atk.action;
  switch (a.type) {
    case 'melee':
      return 3;
    case 'projectile':
      return Math.max(1, Math.round((a.bursts - 1) * secToTicks(a.burstInterval)) + 1);
    case 'charge':
    case 'hop':
      return Math.max(1, secToTicks(a.duration));
    default:
      return 2;
  }
}

export function updateEnemies(w: World): void {
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Enemy) continue;
    if (e.flags[i]! & EF.Dying) {
      if (--e.life[i]! <= 0) e.kill(i);
      continue;
    }
    const def = w.content.enemies[e.def[i]!]!;
    const x = e.x[i]!;
    const y = e.y[i]!;

    // Phase changes (bosses).
    if (def.phases.length) {
      const frac = e.hp[i]! / e.maxHp[i]!;
      let phase = 0;
      for (let k = 0; k < def.phases.length; k++) if (frac <= def.phases[k]!.below) phase = k + 1;
      if (phase !== e.cooldown[i]) {
        e.cooldown[i] = phase;
        const list = attacksOf(def, phase);
        for (let k = 0; k < MAX_ATTACKS; k++) {
          const atk = list[k];
          w.atkCd[i * MAX_ATTACKS + k] = atk ? secToTicks(atk.cooldown * 0.4) : 0;
        }
        w.events.push(Ev.Telegraph, x, y, i, -1, 40);
      }
    }
    const phase = e.cooldown[i]!;
    const attacks = attacksOf(def, phase);
    const speedMul =
      (phase > 0 ? def.phases[phase - 1]!.speedMul : 1) * (e.slowT[i]! > 0 ? 0.5 : 1);
    for (let k = 0; k < MAX_ATTACKS; k++) {
      const c = i * MAX_ATTACKS + k;
      if (w.atkCd[c]! > 0) w.atkCd[c]!--;
    }

    const target = nearestPlayer(w, x, y);
    const tx = target ? e.x[target.ent]! : x;
    const ty = target ? e.y[target.ent]! : y;
    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let mvx = 0;
    let mvy = 0;
    /** mvx/mvy hold an absolute velocity (charges, hops) instead of a unit direction. */
    let absolute = false;
    const st = e.state[i]!;

    if (st === ES.Spawning) {
      if (e.stateT[i]! >= SPAWN_TICKS) {
        e.state[i] = ES.Move;
        e.stateT[i] = 0;
        e.flags[i] = e.flags[i]! & ~EF.Invulnerable;
      }
    } else if (st === ES.Move) {
      if (target) {
        const toward = dist > 0 ? datan2(dy, dx) : 0;
        e.face[i] = toward;
        // Choose an attack.
        for (let k = 0; k < attacks.length && k < MAX_ATTACKS; k++) {
          const atk = attacks[k]!;
          if (w.atkCd[i * MAX_ATTACKS + k]! > 0) continue;
          const reach = dist - e.r[target.ent]! - e.r[i]!;
          if (reach > atk.maxRange || reach < atk.minRange) continue;
          if (atk.los && !lineOfSight(w.map, x, y, tx, ty)) continue;
          e.state[i] = ES.Windup;
          e.stateT[i] = 0;
          e.ref[i] = k;
          e.aux0[i] = tx;
          e.aux1[i] = ty;
          w.events.push(Ev.Telegraph, x, y, i, k, 0);
          break;
        }
        if (e.state[i] === ES.Move) {
          const v = moveIntent(w, i, def, target.ent, dx, dy, dist);
          mvx = v.x;
          mvy = v.y;
        }
      } else if (def.move === 'wander') {
        const v = wander(w, i);
        mvx = v.x * 0.5;
        mvy = v.y * 0.5;
      }
    } else if (st === ES.Windup) {
      // A boss phase change swaps the attack list: the remembered slot may no longer exist.
      const atk = attacks[e.ref[i]!];
      if (!atk) {
        e.state[i] = ES.Move;
        e.stateT[i] = 0;
      } else {
        if (target && atk.action.type !== 'charge' && atk.action.type !== 'hop') {
          e.aux0[i] = tx;
          e.aux1[i] = ty;
          e.face[i] = datan2(dy, dx);
        }
        if (e.stateT[i]! >= secToTicks(atk.windup)) {
          e.state[i] = ES.Act;
          e.stateT[i] = 0;
          e.timer[i] = 0;
          e.dmg[i] = w.stampSeq++;
          w.atkCd[i * MAX_ATTACKS + e.ref[i]!] = secToTicks(atk.cooldown);
          startAction(w, i, atk);
        }
      }
    } else if (st === ES.Act) {
      const atk = attacks[e.ref[i]!];
      if (!atk) {
        e.state[i] = ES.Move;
      } else {
        const v = runAction(w, i, atk, def);
        mvx = v.x;
        mvy = v.y;
        absolute = true;
        if (e.stateT[i]! >= actTicks(atk)) {
          endAction(w, i, atk);
          e.state[i] = ES.Recover;
          e.stateT[i] = 0;
        }
      }
    } else if (st === ES.Recover) {
      const atk = attacks[e.ref[i]!];
      if (!atk || e.stateT[i]! >= secToTicks(atk.recover)) {
        e.state[i] = ES.Move;
        e.stateT[i] = 0;
      }
    }

    // Integrate movement (direct velocities for charges/hops, smoothed for walking).
    const acting = st === ES.Act;
    if (absolute) {
      e.vx[i] = mvx;
      e.vy[i] = mvy;
    } else {
      const sp = def.speed * speedMul;
      e.vx[i] = e.vx[i]! + (mvx * sp - e.vx[i]!) * 0.25;
      e.vy[i] = e.vy[i]! + (mvy * sp - e.vy[i]!) * 0.25;
    }
    separate(w, i);
    const mask =
      e.flags[i]! & EF.Phasing ? 0 : e.flags[i]! & EF.Flying ? TF.BlockShot : TF.BlockWalk;
    // Current position, not the one from the top of the loop: `blink` teleports in startAction().
    const hit = moveBox(
      w.map,
      e.x[i]!,
      e.y[i]!,
      e.r[i]!,
      (e.vx[i]! + e.kx[i]!) * TICK_DT,
      (e.vy[i]! + e.ky[i]!) * TICK_DT,
      mask,
      tmp,
    );
    e.x[i] = tmp.x;
    e.y[i] = tmp.y;
    if (hit && e.state[i] === ES.Move) e.aux2[i] = -e.aux2[i]! || 1; // flip strafe direction
    if (e.flags[i]! & EF.Phasing) keepInRoom(w, i);

    // Contact damage.
    const contact =
      acting && attacks[e.ref[i]!]?.action.type === 'charge'
        ? (attacks[e.ref[i]!]!.action as { damage: number }).damage
        : def.contactDamage;
    if (contact > 0 && e.state[i] !== ES.Spawning) {
      for (const p of w.players) {
        if (p.dead) continue;
        const pdx = e.x[p.ent]! - e.x[i]!;
        const pdy = e.y[p.ent]! - e.y[i]!;
        const rr = e.r[p.ent]! + e.r[i]! - 1;
        if (pdx * pdx + pdy * pdy <= rr * rr)
          damagePlayer(w, p, contact * w.enemyDmgMul, e.x[i]!, e.y[i]!, 140, i);
      }
    }
  }
}

const intent = { x: 0, y: 0 };

function moveIntent(
  w: World,
  i: number,
  def: EnemyDef,
  targetEnt: number,
  dx: number,
  dy: number,
  dist: number,
) {
  const e = w.e;
  const x = e.x[i]!;
  const y = e.y[i]!;
  intent.x = 0;
  intent.y = 0;
  const los =
    def.move === 'still' ? false : lineOfSight(w.map, x, y, e.x[targetEnt]!, e.y[targetEnt]!);
  const approach = () => {
    if (los || e.flags[i]! & EF.Phasing) {
      intent.x = dx / (dist || 1);
      intent.y = dy / (dist || 1);
    } else {
      w.flow.direction(x, y, flowDir);
      intent.x = flowDir.x;
      intent.y = flowDir.y;
    }
  };
  switch (def.move) {
    case 'chase':
      if (dist > e.r[i]! + e.r[targetEnt]! + 2) approach();
      break;
    case 'keepDistance': {
      const pref = def.preferredRange;
      if (!los || dist > pref * 1.3) approach();
      else if (dist < pref * 0.7) {
        intent.x = -dx / (dist || 1);
        intent.y = -dy / (dist || 1);
      } else {
        if (e.aux2[i] === 0 || (w.tick + i * 7) % 75 === 0) e.aux2[i] = w.rng.chance(0.5) ? 1 : -1;
        const s = e.aux2[i]!;
        intent.x = (-dy / (dist || 1)) * s * 0.7;
        intent.y = (dx / (dist || 1)) * s * 0.7;
      }
      break;
    }
    case 'erratic': {
      approach();
      const wob = dsin((w.tick + i * 13) * 0.18) * 1.1;
      const c = dcos(wob);
      const s = dsin(wob);
      const ix = intent.x * c - intent.y * s;
      const iy = intent.x * s + intent.y * c;
      intent.x = ix;
      intent.y = iy;
      break;
    }
    case 'wander':
      return wander(w, i);
    default:
      break;
  }
  return intent;
}

function wander(w: World, i: number) {
  const e = w.e;
  if (e.timer[i]! <= 0) {
    e.timer[i] = w.rng.int(30, 80);
    e.aux2[i] = w.rng.range(-PI, PI);
  }
  e.timer[i]!--;
  intent.x = dcos(e.aux2[i]!);
  intent.y = dsin(e.aux2[i]!);
  return intent;
}

function separate(w: World, i: number): void {
  const e = w.e;
  const n = w.spatial.query(e.x[i]!, e.y[i]!, e.r[i]! + 12);
  for (let k = 0; k < n; k++) {
    const j = w.spatial.out[k]!;
    if (j === i || e.kind[j] !== Kind.Enemy || e.flags[j]! & EF.Dying) continue;
    const dx = e.x[i]! - e.x[j]!;
    const dy = e.y[i]! - e.y[j]!;
    const rr = e.r[i]! + e.r[j]!;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) continue;
    const d = Math.sqrt(d2);
    const push = ((rr - d) / rr) * (e.flags[i]! & EF.Boss ? 10 : 45);
    e.vx[i] = e.vx[i]! + (dx / d) * push;
    e.vy[i] = e.vy[i]! + (dy / d) * push;
  }
}

function keepInRoom(w: World, i: number): void {
  const e = w.e;
  const room = w.floor.rooms[e.room[i]!];
  if (!room) return;
  const r = room.rect;
  e.x[i] = Math.min(Math.max(e.x[i]!, r.x * TILE + 4), (r.x + r.w) * TILE - 4);
  e.y[i] = Math.min(Math.max(e.y[i]!, r.y * TILE + 4), (r.y + r.h) * TILE - 4);
}

function startAction(w: World, i: number, atk: EnemyAttack): void {
  const e = w.e;
  const a = atk.action;
  const x = e.x[i]!;
  const y = e.y[i]!;
  if (a.type === 'summon') {
    let count = 0;
    for (let j = 0; j < e.hi; j++) {
      if (e.alive[j] && e.kind[j] === Kind.Enemy && e.owner[j] === i && !(e.flags[j]! & EF.Dying))
        count++;
    }
    const def = w.content.enemyIndex.get(a.enemy) ?? 0;
    for (let k = 0; k < a.count && count < a.max; k++, count++) {
      const ang = w.rng.range(-PI, PI);
      let sx = x + dcos(ang) * 28;
      let sy = y + dsin(ang) * 28;
      if (pointBlocked(w.map, sx, sy, TF.BlockWalk)) {
        sx = x;
        sy = y;
      }
      const s = spawnEnemy(w, def, sx, sy, e.room[i]!, EF.Summoned);
      if (s >= 0) e.owner[s] = i;
    }
  } else if (a.type === 'area') {
    for (let k = 0; k < a.count; k++) {
      const ax = e.aux0[i]! + (k === 0 ? 0 : w.rng.range(-a.scatter, a.scatter));
      const ay = e.aux1[i]! + (k === 0 ? 0 : w.rng.range(-a.scatter, a.scatter));
      spawnArea(
        w,
        ax,
        ay,
        a.radius,
        secToTicks(a.delay),
        a.damage * w.enemyDmgMul,
        Team.Enemies,
        i,
        0xcf4440,
        120,
      );
    }
  } else if (a.type === 'blink') {
    const away = datan2(y - e.aux1[i]!, x - e.aux0[i]!);
    for (let k = 0; k < 8; k++) {
      const ang = away + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.7;
      const nx = x + dcos(ang) * a.distance;
      const ny = y + dsin(ang) * a.distance;
      const room = w.floor.rooms[e.room[i]!];
      const inside =
        !room ||
        (nx > room.rect.x * TILE + 6 &&
          ny > room.rect.y * TILE + 6 &&
          nx < (room.rect.x + room.rect.w) * TILE - 6 &&
          ny < (room.rect.y + room.rect.h) * TILE - 6);
      if (inside && !pointBlocked(w.map, nx, ny, TF.BlockWalk)) {
        w.events.push(Ev.Dash, x, y, -1 - i, 2);
        e.x[i] = nx;
        e.y[i] = ny;
        e.px[i] = nx;
        e.py[i] = ny;
        break;
      }
    }
  } else if (a.type === 'melee') {
    w.events.push(Ev.Swing, x, y, -1 - i, a.range, e.face[i]!);
    const half = (a.arc * PI) / 360;
    for (const p of w.players) {
      if (p.dead) continue;
      const pdx = e.x[p.ent]! - x;
      const pdy = e.y[p.ent]! - y;
      const rr = a.range + e.r[i]! + e.r[p.ent]!;
      if (pdx * pdx + pdy * pdy > rr * rr) continue;
      if (Math.abs(angleDiff(e.face[i]!, datan2(pdy, pdx))) > half) continue;
      damagePlayer(w, p, a.damage * w.enemyDmgMul, x, y, a.knockback, i);
    }
  }
}

function runAction(w: World, i: number, atk: EnemyAttack, def: EnemyDef): { x: number; y: number } {
  const e = w.e;
  const a = atk.action;
  const t = e.stateT[i]!;
  intent.x = 0;
  intent.y = 0;
  if (a.type === 'projectile') {
    const interval = Math.max(1, secToTicks(a.burstInterval));
    if (t % interval === 0 && e.timer[i]! < a.bursts) {
      e.timer[i]!++;
      const proj = w.content.projectileIndex.get(a.projectile) ?? 0;
      const x = e.x[i]!;
      const y = e.y[i]! - 2;
      const base = datan2(e.aux1[i]! - y, e.aux0[i]! - x);
      for (let k = 0; k < a.count; k++) {
        let ang: number;
        if (a.aim === 'radial') ang = (2 * PI * k) / a.count + e.aux2[i]!;
        else if (a.aim === 'spiral') ang = (2 * PI * k) / a.count + e.aux2[i]! + e.timer[i]! * 0.32;
        else
          ang =
            base +
            (a.count > 1 ? ((-a.spread / 2 + (a.spread * k) / (a.count - 1)) * PI) / 180 : 0);
        spawnProjectile(w, proj, x, y, ang, Team.Enemies, i, a.damage * w.enemyDmgMul);
      }
      w.events.push(Ev.Shoot, x, y, -1 - i, proj, base);
    }
  } else if (a.type === 'charge' || a.type === 'hop') {
    const dx = e.aux0[i]! - e.x[i]!;
    const dy = e.aux1[i]! - e.y[i]!;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (a.type === 'charge') {
      intent.x = (dx / d) * a.speed;
      intent.y = (dy / d) * a.speed;
      if (t === 0) {
        // Lock the direction for the whole charge (overshoot is intended).
        e.aux0[i] = e.x[i]! + (dx / d) * 1000;
        e.aux1[i] = e.y[i]! + (dy / d) * 1000;
      }
    } else {
      const total = Math.max(1, secToTicks(a.duration));
      const dist = Math.min(a.distance, d);
      const sp = (dist / total) * 30;
      intent.x = (dx / d) * sp;
      intent.y = (dy / d) * sp;
    }
  }
  void def;
  return intent;
}

function endAction(w: World, i: number, atk: EnemyAttack): void {
  const e = w.e;
  const a = atk.action;
  if (a.type === 'hop') {
    w.events.push(Ev.Explosion, e.x[i]!, e.y[i]!, i, 0x4c9e47, a.radius);
    for (const p of w.players) {
      if (p.dead) continue;
      const dx = e.x[p.ent]! - e.x[i]!;
      const dy = e.y[p.ent]! - e.y[i]!;
      const rr = a.radius + e.r[p.ent]!;
      if (dx * dx + dy * dy <= rr * rr)
        damagePlayer(w, p, a.damage * w.enemyDmgMul, e.x[i]!, e.y[i]!, 150, i);
    }
  } else if (a.type === 'projectile' && a.aim !== 'target') {
    e.aux2[i] = e.aux2[i]! + 0.4;
  }
}
