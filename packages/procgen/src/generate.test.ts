import { describe, expect, it } from 'vitest';
import { generateFloor } from './generate';
import { validateFloor } from './validate';

describe('crypt generation', () => {
  it('is deterministic', () => {
    const a = generateFloor({ seed: 42, biome: 'crypt', depth: 0, floors: 3 });
    const b = generateFloor({ seed: 42, biome: 'crypt', depth: 0, floors: 3 });
    expect(Buffer.from(a.tiles).equals(Buffer.from(b.tiles))).toBe(true);
    expect(a.spawns).toEqual(b.spawns);
    expect(a.props).toEqual(b.props);
  });

  it('has the expected room structure', () => {
    const f = generateFloor({ seed: 7, biome: 'crypt', depth: 2, floors: 3 });
    const types = f.rooms.map((r) => r.type);
    expect(types).toContain('start');
    expect(types).toContain('boss');
    expect(f.rooms.length).toBeGreaterThanOrEqual(6);
  });

  it('1000 seeds × floor depths: no unreachable rooms, no softlocks', () => {
    const failures: string[] = [];
    let withLock = 0;
    let withShop = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const depth = seed % 3;
      try {
        const f = generateFloor({ seed: seed * 7919, biome: 'crypt', depth, floors: 3 });
        const issues = validateFloor(f);
        if (issues.length) failures.push(`seed ${seed}: ${issues.join('; ')}`);
        if (f.doors.some((d) => d.locked)) withLock++;
        if (f.rooms.some((r) => r.type === 'shop')) withShop++;
        if (depth === 2 && !f.rooms.some((r) => r.type === 'boss'))
          failures.push(`seed ${seed}: no boss`);
        if (depth < 2 && !f.props.some((p) => p.kind === 'stairs'))
          failures.push(`seed ${seed}: no stairs`);
      } catch (e) {
        failures.push(`seed ${seed}: ${(e as Error).message}`);
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
    // Most floors should have the key/lock loop and a shop.
    expect(withLock).toBeGreaterThan(600);
    expect(withShop).toBeGreaterThan(400);
  });
});
