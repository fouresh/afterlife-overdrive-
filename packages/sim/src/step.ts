import type { PlayerInput } from '@ao/shared';
import { copyInput } from '@ao/shared';
import { updatePlayer } from './player';
import type { World } from './world';

/**
 * Advance the world by exactly one fixed tick. `inputs[i]` is the input of player i for this tick.
 * Pure function of (world state, inputs): the same sequence gives the same result everywhere.
 */
export function step(w: World, inputs: readonly PlayerInput[]): void {
  w.events.clear();
  const e = w.e;
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i]) continue;
    e.px[i] = e.x[i]!;
    e.py[i] = e.y[i]!;
    if (e.iframes[i]! > 0) e.iframes[i]!--;
    if (e.hitFlash[i]! > 0) e.hitFlash[i]!--;
    if (e.slowT[i]! > 0) e.slowT[i]!--;
    e.kx[i] = e.kx[i]! * 0.8;
    e.ky[i] = e.ky[i]! * 0.8;
    e.stateT[i]!++;
  }
  for (const p of w.players) {
    const inp = inputs[p.index];
    if (inp) copyInput(p.input, inp);
    updatePlayer(w, p);
  }
  w.tick++;
}
