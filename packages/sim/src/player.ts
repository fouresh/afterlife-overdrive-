import { Btn, TICK_DT, byteToAngle, datan2, emptyInput } from '@ao/shared';
import { TF } from '@ao/procgen';
import { moveBox } from './collide';
import { EF, Kind, Team } from './entities';
import { Ev } from './events';
import {
  DASH_IFRAMES,
  DASH_RECHARGE_TICKS,
  DASH_SPEED,
  DASH_TICKS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  tileCenter,
  type SimPlayer,
  type World,
} from './world';

export function addPlayer(w: World): SimPlayer {
  const index = w.players.length;
  const x = tileCenter(w.floor.start.x) + index * 6;
  const y = tileCenter(w.floor.start.y);
  const ent = w.e.spawn(Kind.Player, x, y);
  w.e.team[ent] = Team.Players;
  w.e.r[ent] = PLAYER_RADIUS;
  w.e.hp[ent] = 100;
  w.e.maxHp[ent] = 100;
  w.e.flags[ent] = EF.Body;
  w.e.ref[ent] = index;
  const p: SimPlayer = {
    index,
    ent,
    input: emptyInput(),
    prevButtons: 0,
    speed: PLAYER_SPEED,
    dashCharges: 1,
    dashMaxCharges: 1,
    dashRecharge: 0,
    dashT: 0,
    dashDx: 0,
    dashDy: 0,
    moving: false,
  };
  w.players.push(p);
  return p;
}

const tmp = { x: 0, y: 0 };

export function updatePlayer(w: World, p: SimPlayer): void {
  const e = w.e;
  const i = p.ent;
  if (!e.alive[i]) return;
  const inp = p.input;
  const pressed = inp.buttons & ~p.prevButtons;
  p.prevButtons = inp.buttons;

  const len = Math.sqrt(inp.mx * inp.mx + inp.my * inp.my);
  const mag = len > 127 ? 1 : len / 127;
  const dirX = len > 0 ? inp.mx / len : 0;
  const dirY = len > 0 ? inp.my / len : 0;
  p.moving = mag > 0;

  // Facing: explicit aim (mouse) wins; otherwise follow movement.
  if (inp.buttons & Btn.ManualAim) e.face[i] = byteToAngle(inp.aim);
  else if (mag > 0) e.face[i] = datan2(dirY, dirX);

  // Dash charges
  if (p.dashCharges < p.dashMaxCharges) {
    if (++p.dashRecharge >= DASH_RECHARGE_TICKS) {
      p.dashRecharge = 0;
      p.dashCharges++;
    }
  }
  if (pressed & Btn.Dash && p.dashCharges > 0 && p.dashT === 0) {
    p.dashCharges--;
    p.dashT = DASH_TICKS;
    if (mag > 0) {
      p.dashDx = dirX;
      p.dashDy = dirY;
    } else {
      // Dash where we face.
      const f = e.face[i]!;
      const fx = Math.abs(f) <= 1.5707963267948966 ? 1 : -1;
      p.dashDx = fx;
      p.dashDy = 0;
    }
    e.iframes[i] = Math.max(e.iframes[i]!, DASH_IFRAMES);
    w.events.push(Ev.Dash, e.x[i]!, e.y[i]!, i);
  }

  let tvx: number;
  let tvy: number;
  if (p.dashT > 0) {
    p.dashT--;
    tvx = p.dashDx * DASH_SPEED;
    tvy = p.dashDy * DASH_SPEED;
    e.vx[i] = tvx;
    e.vy[i] = tvy;
  } else {
    const slow = e.slowT[i]! > 0 ? 0.55 : 1;
    tvx = dirX * mag * p.speed * slow;
    tvy = dirY * mag * p.speed * slow;
    e.vx[i] = e.vx[i]! + (tvx - e.vx[i]!) * 0.6;
    e.vy[i] = e.vy[i]! + (tvy - e.vy[i]!) * 0.6;
  }

  const dx = (e.vx[i]! + e.kx[i]!) * TICK_DT;
  const dy = (e.vy[i]! + e.ky[i]!) * TICK_DT;
  moveBox(w.map, e.x[i]!, e.y[i]!, e.r[i]!, dx, dy, TF.BlockWalk, tmp);
  e.x[i] = tmp.x;
  e.y[i] = tmp.y;
}
