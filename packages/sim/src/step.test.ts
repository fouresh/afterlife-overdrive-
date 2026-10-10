import { arenaFloor } from '@ao/procgen';
import { Btn, TILE, type PlayerInput } from '@ao/shared';
import { describe, expect, it } from 'vitest';
import { addPlayer, createWorld, step } from './index';

function run(inputs: (t: number) => PlayerInput, ticks: number) {
  const w = createWorld(arenaFloor(), 1234);
  const p = addPlayer(w);
  for (let t = 0; t < ticks; t++) step(w, [inputs(t)]);
  return { w, p };
}

describe('sim movement', () => {
  it('moves right with full stick', () => {
    const { w, p } = run(() => ({ mx: 127, my: 0, aim: 0, buttons: 0 }), 30);
    const start = (w.floor.start.x + 0.5) * TILE;
    expect(w.e.x[p.ent]! - start).toBeGreaterThan(60);
  });

  it('is stopped by walls', () => {
    const { w, p } = run(() => ({ mx: 0, my: -127, aim: 0, buttons: 0 }), 300);
    // Top wall row is y=1 (row 0 and 1 are walls) so the player cannot go above y = 2*TILE + r.
    expect(w.e.y[p.ent]!).toBeGreaterThanOrEqual(2 * TILE + w.e.r[p.ent]! - 1e-9);
  });

  it('dash moves faster than walking and has a cooldown', () => {
    const { w, p } = run((t) => ({ mx: 127, my: 0, aim: 0, buttons: t === 0 ? Btn.Dash : 0 }), 6);
    const walked = run(() => ({ mx: 127, my: 0, aim: 0, buttons: 0 }), 6);
    expect(w.e.x[p.ent]!).toBeGreaterThan(walked.w.e.x[walked.p.ent]! + 20);
    expect(p.dashCharges).toBe(0);
  });

  it('is deterministic', () => {
    const inputs = (t: number): PlayerInput => ({
      mx: Math.round(127 * Math.sin(t / 10)),
      my: Math.round(127 * Math.cos(t / 7)),
      aim: 0,
      buttons: t % 40 === 0 ? Btn.Dash : 0,
    });
    const a = run(inputs, 500);
    const b = run(inputs, 500);
    expect(a.w.e.x[a.p.ent]).toBe(b.w.e.x[b.p.ent]);
    expect(a.w.e.y[a.p.ent]).toBe(b.w.e.y[b.p.ent]);
  });
});
