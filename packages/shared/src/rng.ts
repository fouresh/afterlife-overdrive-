/**
 * Deterministic pseudo-random numbers. Only 32-bit integer ops (Math.imul, >>>), so results
 * are bit-identical in every JS engine (V8 in Chrome and workerd, JSC in Safari).
 *
 * Algorithm: sfc32 (small fast counter), seeded via splitmix32.
 */

/** 32-bit FNV-1a hash of a string. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** splitmix32 step: good for turning arbitrary integers into well-mixed seeds. */
export function mix32(x: number): number {
  x = (x + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Derive an independent seed from a parent seed and a list of labels/indices. */
export function deriveSeed(seed: number, ...parts: (string | number)[]): number {
  let h = mix32(seed >>> 0);
  for (const p of parts) {
    const v = typeof p === 'number' ? p >>> 0 : hashString(p);
    h = mix32(h ^ v);
  }
  return h;
}

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    const s = seed >>> 0;
    this.a = mix32(s);
    this.b = mix32(this.a ^ 0x6a09e667);
    this.c = mix32(this.b ^ 0xbb67ae85);
    this.d = 1;
    // Warm up: discard first outputs.
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  /** Uniform unsigned 32-bit integer. */
  nextU32(): number {
    const a = this.a;
    const b = this.b;
    const c = this.c;
    const d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    this.d = (d + 1) | 0;
    this.a = b ^ (b >>> 9);
    this.b = (c + (c << 3)) | 0;
    const cr = (c << 21) | (c >>> 11);
    this.c = (cr + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** Pick by weights. Returns the index. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return 0;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]!);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    return items[this.weightedIndex(items.map(weight))]!;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
    return arr;
  }

  /** Spawn an independent child generator (does not disturb future sequences much). */
  fork(label: string | number): Rng {
    return new Rng(deriveSeed(this.nextU32(), label));
  }

  getState(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d };
  }

  setState(s: RngState): void {
    this.a = s.a | 0;
    this.b = s.b | 0;
    this.c = s.c | 0;
    this.d = s.d | 0;
  }
}

/** Seed alphabet without ambiguous characters, used for human-readable seeds and room codes. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function seedToCode(seed: number, len = 6): string {
  let s = seed >>> 0;
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[s % CODE_ALPHABET.length];
    s = Math.floor(s / CODE_ALPHABET.length);
    if (s === 0) s = mix32(seed + i);
  }
  return out;
}
