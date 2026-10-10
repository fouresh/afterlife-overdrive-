import { Btn } from '@ao/shared';
import { expect, it } from 'vitest';
import { starterItem } from './items';
import { createFloorWorld } from './run';
import { emptyLoadout } from './stats';
import { step } from './step';

it('sim tick stays cheap with every room fighting (perf guard)', () => {
  const loadout = emptyLoadout();
  loadout.weapon = starterItem('bow.short');
  loadout.artifacts = [starterItem('art.fireball'), starterItem('art.spiritWisp')];
  const w = createFloorWorld({ seed: 12345, biome: 'crypt', floors: 3 }, 2, [{ loadout }]);
  w.e.hp[w.players[0]!.ent] = 1e9;
  // Activate every combat room at once for a stress test.
  for (let r = 0; r < w.rooms.length; r++) {
    const room = w.floor.rooms[r]!;
    if (!room.lockOnEnter) continue;
    w.e.x[w.players[0]!.ent] = (room.rect.x + 2) * 16;
    w.e.y[w.players[0]!.ent] = (room.rect.y + 2) * 16;
    step(w, [{ mx: 0, my: 0, aim: 0, buttons: 0 }]);
  }
  const t0 = performance.now();
  const N = 900;
  for (let t = 0; t < N; t++)
    step(w, [{ mx: 0, my: 0, aim: 0, buttons: Btn.Attack | Btn.Skill1 | Btn.Skill2 }]);
  const ms = (performance.now() - t0) / N;
  // Budget: the DO server ticks 30 Hz for up to 4 players; keep a wide margin for slow CI.
  expect(ms).toBeLessThan(3);
});
