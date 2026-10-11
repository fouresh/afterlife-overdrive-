import { Btn, TILE, type PlayerInput } from '@ao/shared';
import { describe, expect, it } from 'vitest';
import { EF, Kind } from './entities';
import { FlowField } from './flow';
import { starterItem } from './items';
import { createFloorWorld } from './run';
import { emptyLoadout } from './stats';
import { step } from './step';
import type { World } from './world';

let botFlow: FlowField | undefined;

/** A simple bot: path (BFS) to the nearest enemy or uncleared room, attack, dash sometimes. */
function botInput(w: World, t: number): PlayerInput {
  const e = w.e;
  const p = w.players[0]!;
  const px = e.x[p.ent]!;
  const py = e.y[p.ent]!;
  const flow = (botFlow ??= new FlowField(w.map));
  let best = Infinity;
  const sources: number[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (!e.alive[i] || e.kind[i] !== Kind.Enemy || e.flags[i]! & EF.Dying) continue;
    best = Math.min(best, Math.hypot(e.x[i]! - px, e.y[i]! - py));
    sources.push(Math.floor(e.y[i]! / TILE) * w.map.w + Math.floor(e.x[i]! / TILE));
  }
  if (!sources.length) {
    const r = w.floor.rooms.find((room, i) => room.lockOnEnter && w.rooms[i]!.state === 0);
    if (r) {
      for (let y = r.rect.y + 1; y < r.rect.y + r.rect.h - 1; y++)
        for (let x = r.rect.x + 1; x < r.rect.x + r.rect.w - 1; x++)
          if (w.map.tiles[y * w.map.w + x] === 1) sources.push(y * w.map.w + x);
    }
  }
  if (t % 10 === 0) flow.update(sources);
  const dir = { x: 0, y: 0 };
  if (best > 16) flow.direction(px, py, dir);
  return {
    mx: Math.round(dir.x * 127),
    my: Math.round(dir.y * 127),
    aim: 0,
    buttons: Btn.Attack | (t % 50 === 0 ? Btn.Dash : 0) | (t % 90 === 0 ? Btn.Skill1 : 0),
  };
}

describe('sim gameplay', () => {
  it('a sword bot clears rooms, enemies die and drop loot (deterministic)', () => {
    const run = () => {
      botFlow = undefined;
      const loadout = emptyLoadout();
      loadout.weapon = starterItem('sword.rusty');
      loadout.artifacts[0] = starterItem('art.frostNova');
      const w = createFloorWorld({ seed: 99, biome: 'crypt', floors: 3 }, 0, [
        { loadout, potions: 3 },
      ]);
      // Cheat for the test: make the bot sturdy so it survives long enough.
      w.e.hp[w.players[0]!.ent] = 5000;
      w.e.maxHp[w.players[0]!.ent] = 5000;
      let deaths = 0;
      for (let t = 0; t < 30 * 90 && w.outcome === 'playing'; t++) {
        step(w, [botInput(w, t)]);
        for (let k = 0; k < w.events.n; k++) if (w.events.type[k] === 2) deaths++;
      }
      return { w, deaths };
    };
    const a = run();
    const cleared = a.w.rooms.filter((r) => r.state === 2).length;
    expect(a.deaths).toBeGreaterThan(5);
    expect(cleared).toBeGreaterThan(2);
    expect(a.w.players[0]!.gold).toBeGreaterThan(0);
    const b = run();
    expect(b.deaths).toBe(a.deaths);
    expect(b.w.e.x[b.w.players[0]!.ent]).toBe(a.w.e.x[a.w.players[0]!.ent]);
  });

  it('bots clear whole floors on several seeds (no softlocks in practice)', () => {
    const results: string[] = [];
    for (const seed of [5, 17, 23, 42, 77, 123]) {
      botFlow = undefined;
      const loadout = emptyLoadout();
      loadout.weapon = starterItem(['sword.rusty', 'bow.short', 'staff.apprentice'][seed % 3]!);
      const depth = seed % 2;
      const w = createFloorWorld({ seed, biome: 'crypt', floors: 3 }, depth, [{ loadout }]);
      w.e.hp[w.players[0]!.ent] = 1e6;
      w.e.maxHp[w.players[0]!.ent] = 1e6;
      let t = 0;
      for (; t < 30 * 60 * 6 && !w.stairsOpen; t++) step(w, [botInput(w, t)]);
      const left = w.floor.rooms.filter((r, i) => r.lockOnEnter && w.rooms[i]!.state !== 2).length;
      if (!w.stairsOpen)
        results.push(`seed ${seed}: stairs closed after ${t} ticks, ${left} rooms left`);
    }
    expect(results).toEqual([]);
  });

  it('boss floor: the bot kills the boss and the exit portal appears', () => {
    botFlow = undefined;
    const loadout = emptyLoadout();
    loadout.weapon = starterItem('sword.knight');
    const w = createFloorWorld({ seed: 31337, biome: 'crypt', floors: 3 }, 2, [{ loadout }]);
    w.e.hp[w.players[0]!.ent] = 1e6;
    w.e.maxHp[w.players[0]!.ent] = 1e6;
    const portal = () => {
      for (let i = 0; i < w.e.hi; i++)
        if (w.e.alive[i] && w.e.kind[i] === Kind.Prop && w.e.def[i] === 4) return true;
      return false;
    };
    let t = 0;
    for (; t < 30 * 60 * 8 && !portal(); t++) step(w, [botInput(w, t)]);
    expect(w.floor.rooms.some((r) => r.type === 'boss')).toBe(true);
    expect(portal()).toBe(true);
  });

  it('forest: bots clear floor 1 and kill the Pack Leader on floor 2', () => {
    for (const depth of [0, 1]) {
      botFlow = undefined;
      const loadout = emptyLoadout();
      loadout.weapon = starterItem('sword.knight');
      const w = createFloorWorld({ seed: 777 + depth, biome: 'forest', floors: 2 }, depth, [
        { loadout, quests: ['rescue:trader'] },
      ]);
      w.e.hp[w.players[0]!.ent] = 1e6;
      w.e.maxHp[w.players[0]!.ent] = 1e6;
      const done = () =>
        depth === 0
          ? w.stairsOpen
          : (() => {
              for (let i = 0; i < w.e.hi; i++)
                if (w.e.alive[i] && w.e.kind[i] === Kind.Prop && w.e.def[i] === 4) return true;
              return false;
            })();
      let t = 0;
      for (; t < 30 * 60 * 8 && !done(); t++) step(w, [botInput(w, t)]);
      expect(done()).toBe(true);
      if (depth === 1) expect(w.players[0]!.story).toContain('boss:alphaWolf');
    }
  });

  it('random input soak: no NaN, no crash, entity count bounded', () => {
    for (const seed of [1, 2, 3]) {
      botFlow = undefined;
      const loadout = emptyLoadout();
      loadout.weapon = starterItem(['sword.rusty', 'bow.short', 'staff.apprentice'][seed % 3]!);
      loadout.artifacts = [starterItem('art.bladeFan'), starterItem('art.spiritWisp')];
      const w = createFloorWorld({ seed, biome: 'crypt', floors: 3 }, seed % 3, [{ loadout }]);
      w.e.hp[w.players[0]!.ent] = 1e6;
      let s = seed;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
      for (let t = 0; t < 3000; t++) {
        const inp =
          t % 400 < 300
            ? botInput(w, t)
            : {
                mx: Math.round(rnd() * 127),
                my: Math.round(rnd() * 127),
                aim: 0,
                buttons: Btn.Attack | Btn.Skill1 | Btn.Skill2,
              };
        step(w, [inp]);
      }
      for (let i = 0; i < w.e.hi; i++) {
        if (!w.e.alive[i]) continue;
        expect(Number.isFinite(w.e.x[i]!)).toBe(true);
        expect(Number.isFinite(w.e.y[i]!)).toBe(true);
      }
      expect(w.e.countAlive()).toBeLessThan(700);
    }
  });
});
