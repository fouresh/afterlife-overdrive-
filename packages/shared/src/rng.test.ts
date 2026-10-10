import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed, hashString, seedToCode } from './rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('produces a stable reference sequence (guards against accidental algorithm changes)', () => {
    const r = new Rng(42);
    const seq = Array.from({ length: 5 }, () => r.nextU32());
    expect(seq).toMatchInlineSnapshot(`
      [
        3513271605,
        627094225,
        2126955458,
        3903134608,
        1093800066,
      ]
    `);
  });

  it('next() stays in [0,1) and is roughly uniform', () => {
    const r = new Rng(7);
    const buckets = new Array<number>(10).fill(0);
    let min = 1;
    let max = 0;
    for (let i = 0; i < 100_000; i++) {
      const v = r.next();
      min = Math.min(min, v);
      max = Math.max(max, v);
      buckets[Math.floor(v * 10)]!++;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    for (const b of buckets) expect(b).toBeGreaterThan(9_000);
  });

  it('int() is inclusive on both ends', () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('state can be saved and restored', () => {
    const r = new Rng(99);
    r.next();
    const s = r.getState();
    const x = r.nextU32();
    r.setState(s);
    expect(r.nextU32()).toBe(x);
  });

  it('deriveSeed differs per label', () => {
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(1, 'b'));
    expect(deriveSeed(1, 'a', 2)).toBe(deriveSeed(1, 'a', 2));
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('seedToCode uses the unambiguous alphabet', () => {
    expect(seedToCode(123456)).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
