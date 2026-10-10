import { deflateSync } from 'node:zlib';

/** Minimal PNG encoder (RGBA8, no filtering) for build-time generated images. */
export function encodePng(w: number, h: number, rgba: Uint8Array | Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const chunks = [
    chunk('IHDR', ihdr(w, h)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function ihdr(w: number, h: number): Buffer {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0);
  b.writeUInt32BE(h, 4);
  b[8] = 8; // bit depth
  b[9] = 6; // RGBA
  b[10] = 0;
  b[11] = 0;
  b[12] = 0;
  return b;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/** Nearest-neighbour upscale. */
export function upscale(
  w: number,
  h: number,
  rgba: Uint8Array | Uint8ClampedArray,
  s: number,
): Uint8Array {
  const out = new Uint8Array(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) {
    for (let x = 0; x < w * s; x++) {
      const si = (Math.floor(y / s) * w + Math.floor(x / s)) * 4;
      const di = (y * w * s + x) * 4;
      out[di] = rgba[si]!;
      out[di + 1] = rgba[si + 1]!;
      out[di + 2] = rgba[si + 2]!;
      out[di + 3] = rgba[si + 3]!;
    }
  }
  return out;
}
