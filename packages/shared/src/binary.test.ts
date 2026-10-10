import { describe, expect, it } from 'vitest';
import { BinReader, BinWriter } from './binary';

describe('binary', () => {
  it('round-trips all field types and grows the buffer', () => {
    const w = new BinWriter(4);
    w.u8(250).i8(-5).u16(65000).i16(-30000).u32(4_000_000_000).i32(-2_000_000_000);
    w.f32(1.5).f64(Math.PI).varu(300).varu(0).vari(-77).vari(1234567).str('Привет, мир');
    const r = new BinReader(w.toBytes());
    expect(r.u8()).toBe(250);
    expect(r.i8()).toBe(-5);
    expect(r.u16()).toBe(65000);
    expect(r.i16()).toBe(-30000);
    expect(r.u32()).toBe(4_000_000_000);
    expect(r.i32()).toBe(-2_000_000_000);
    expect(r.f32()).toBe(1.5);
    expect(r.f64()).toBe(Math.PI);
    expect(r.varu()).toBe(300);
    expect(r.varu()).toBe(0);
    expect(r.vari()).toBe(-77);
    expect(r.vari()).toBe(1234567);
    expect(r.str()).toBe('Привет, мир');
    expect(r.remaining).toBe(0);
  });

  it('throws on truncated data', () => {
    const r = new BinReader(new Uint8Array([1]));
    expect(() => r.u16()).toThrow(RangeError);
  });
});
