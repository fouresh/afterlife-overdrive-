import type { PlayerInput } from '@ao/shared';
import { copyInput, TILE } from '@ao/shared';
import { updateEnemies } from './ai';
import { EF, Kind } from './entities';
import { updatePlayer } from './player';
import { updateRooms } from './rooms';
import {
  updateAllies,
  updateAreas,
  updateLocks,
  updatePickups,
  updateProjectiles,
  updateProps,
  updateStatuses,
} from './systems';
import type { World } from './world';

const flowSources: number[] = [];

/**
 * Advance the world by exactly one fixed tick. `inputs[i]` is the input of player i for this tick.
 * Pure function of (world state, inputs): the same sequence gives the same result everywhere.
 */
export function step(w: World, inputs: readonly PlayerInput[]): void {
  w.events.clear();
  if (w.outcome !== 'playing') return;
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i]) continue;
    e.px[i] = e.x[i]!;
    e.py[i] = e.y[i]!;
    if (e.iframes[i]! > 0) e.iframes[i]!--;
    if (e.hitFlash[i]! > 0) e.hitFlash[i]!--;
    if (e.slowT[i]! > 0) e.slowT[i]!--;
    if (e.kind[i] !== Kind.Pickup) {
      e.kx[i] = e.kx[i]! * 0.78;
      e.ky[i] = e.ky[i]! * 0.78;
      if (Math.abs(e.kx[i]!) < 1) e.kx[i] = 0;
      if (Math.abs(e.ky[i]!) < 1) e.ky[i] = 0;
    }
    e.stateT[i]!++;
  }
  // Spatial hash of bodies.
  w.spatial.clear();
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i]) continue;
    const k = e.kind[i];
    if ((k === Kind.Enemy || k === Kind.Player) && !(e.flags[i]! & EF.Dying))
      w.spatial.insert(e, i);
  }
  for (const p of w.players) {
    const inp = inputs[p.index];
    if (inp) copyInput(p.input, inp);
    updatePlayer(w, p);
  }
  if (w.tick % 6 === 0) {
    flowSources.length = 0;
    for (const p of w.players) {
      if (p.dead) continue;
      flowSources.push(Math.floor(e.y[p.ent]! / TILE) * w.map.w + Math.floor(e.x[p.ent]! / TILE));
    }
    w.flow.update(flowSources);
  }
  updateAllies(w);
  updateEnemies(w);
  updateProjectiles(w);
  updateAreas(w);
  updateStatuses(w);
  updatePickups(w);
  updateProps(w);
  updateLocks(w);
  updateRooms(w);
  if (w.players.length > 0 && w.players.every((p) => p.dead && p.deathT > 50)) w.outcome = 'dead';
  w.tick++;
  w.ticksPlayed++;
}
