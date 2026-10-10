/**
 * Growable little-endian binary writer/reader used by the network protocol and save blobs.
 * The writer reuses its buffer between messages (call reset()) to avoid allocations.
 */
export class BinWriter {
  private buf: ArrayBuffer;
  private view: DataView;
  private bytes: Uint8Array;
  pos = 0;

  constructor(initialSize = 1024) {
    this.buf = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buf);
    this.bytes = new Uint8Array(this.buf);
  }

  reset(): this {
    this.pos = 0;
    return this;
  }

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.pos + n) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(this.bytes.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next);
    this.bytes = new Uint8Array(next);
  }

  u8(v: number): this {
    this.ensure(1);
    this.view.setUint8(this.pos, v);
    this.pos += 1;
    return this;
  }
  i8(v: number): this {
    this.ensure(1);
    this.view.setInt8(this.pos, v);
    this.pos += 1;
    return this;
  }
  u16(v: number): this {
    this.ensure(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
    return this;
  }
  i16(v: number): this {
    this.ensure(2);
    this.view.setInt16(this.pos, v, true);
    this.pos += 2;
    return this;
  }
  u32(v: number): this {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
    return this;
  }
  i32(v: number): this {
    this.ensure(4);
    this.view.setInt32(this.pos, v | 0, true);
    this.pos += 4;
    return this;
  }
  f32(v: number): this {
    this.ensure(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
    return this;
  }
  f64(v: number): this {
    this.ensure(8);
    this.view.setFloat64(this.pos, v, true);
    this.pos += 8;
    return this;
  }
  /** Unsigned LEB128 varint (up to 2^32-1). */
  varu(v: number): this {
    let x = v >>> 0;
    while (x >= 0x80) {
      this.u8((x & 0x7f) | 0x80);
      x >>>= 7;
    }
    return this.u8(x);
  }
  /** Zig-zag signed varint. */
  vari(v: number): this {
    return this.varu(((v << 1) ^ (v >> 31)) >>> 0);
  }
  str(s: string): this {
    const enc = encodeUtf8(s);
    this.varu(enc.length);
    this.ensure(enc.length);
    this.bytes.set(enc, this.pos);
    this.pos += enc.length;
    return this;
  }
  raw(data: Uint8Array): this {
    this.ensure(data.length);
    this.bytes.set(data, this.pos);
    this.pos += data.length;
    return this;
  }
  /** View of written bytes (shares memory; copy if you keep it). */
  view8(): Uint8Array {
    return this.bytes.subarray(0, this.pos);
  }
  toBytes(): Uint8Array {
    return this.bytes.slice(0, this.pos);
  }
}

export class BinReader {
  private view: DataView;
  pos = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.byteLength - this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.byteLength) throw new RangeError('BinReader: out of data');
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  i8(): number {
    this.need(1);
    return this.view.getInt8(this.pos++);
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }
  varu(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.u8();
      result += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new RangeError('BinReader: varint too long');
    }
    return result >>> 0;
  }
  vari(): number {
    const v = this.varu();
    return (v >>> 1) ^ -(v & 1);
  }
  str(): string {
    const n = this.varu();
    this.need(n);
    const s = decodeUtf8(this.bytes.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
  raw(n: number): Uint8Array {
    this.need(n);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}

// TextEncoder/TextDecoder exist in browsers, Node and workerd, but are not in the ES2022 lib typings
// that deterministic packages compile against, so declare the minimal surface here.
interface Utf8Encoder {
  encode(s: string): Uint8Array;
}
interface Utf8Decoder {
  decode(b: Uint8Array): string;
}
declare const TextEncoder: { new (): Utf8Encoder };
declare const TextDecoder: { new (): Utf8Decoder };

let encoder: Utf8Encoder | undefined;
let decoder: Utf8Decoder | undefined;

export function encodeUtf8(s: string): Uint8Array {
  encoder ??= new TextEncoder();
  return encoder.encode(s);
}

export function decodeUtf8(b: Uint8Array): string {
  decoder ??= new TextDecoder();
  return decoder.decode(b);
}
