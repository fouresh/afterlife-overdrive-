import { emptyInput } from '@ao/shared';
import { getContent } from '@ao/content';
import { describe, expect, it } from 'vitest';
import { ES, Ev, createFloorWorld, emptyLoadout, spawnEnemy, starterItem, step } from './index';

function arena() {
  const loadout = emptyLoadout();
  loadout.weapon = starterItem('sword.rusty');
  const w = createFloorWorld({ seed: 99, biome: 'crypt', floors: 3 }, 0, [{ loadout }]);
  const p = w.players[0]!;
  w.e.hp[p.ent] = w.e.maxHp[p.ent] = 1e6;
  return { w, p };
}

describe('enemy ai', () => {
  it('a cultist blink really moves the cultist (the teleport is not undone by movement)', () => {
    const { w, p } = arena();
    const e = w.e;
    const def = getContent().enemyIndex.get('cultist')!;
    // Close enough for the blink attack (maxRange 34).
    const i = spawnEnemy(w, def, e.x[p.ent]! + 20, e.y[p.ent]!, -1);
    const input = emptyInput();
    let moved = -1;
    for (let t = 0; t < 300 && moved < 0; t++) {
      const bx = e.x[i]!;
      const by = e.y[i]!;
      step(w, [input]);
      for (let k = 0; k < w.events.n; k++) {
        if (w.events.type[k] === Ev.Dash && w.events.a[k] === -1 - i) {
          moved = Math.hypot(e.x[i]! - bx, e.y[i]! - by);
        }
      }
    }
    expect(moved).toBeGreaterThan(30);
  });

  it('survives a boss phase change that swaps the attack list mid-windup', () => {
    const { w, p } = arena();
    const e = w.e;
    const def = getContent().enemyIndex.get('boneKnight')!;
    const i = spawnEnemy(w, def, e.x[p.ent]! + 20, e.y[p.ent]!, -1);
    // Skip the spawn animation, then pretend it was winding up an attack that no longer exists.
    for (let t = 0; t < 30; t++) step(w, [emptyInput()]);
    e.state[i] = ES.Windup;
    e.stateT[i] = 0;
    e.ref[i] = 7;
    expect(() => step(w, [emptyInput()])).not.toThrow();
    expect(e.state[i]).toBe(ES.Move);
  });
});
