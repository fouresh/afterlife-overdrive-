import { encodePng, upscale } from './png';

/**
 * App icon drawn as 32×32 pixel art (a skull with glowing "overdrive" eyes), generated at build
 * time into PNGs — no binary assets in the repo.
 */
const PAL: Record<string, [number, number, number, number]> = {
  '.': [43, 24, 70, 255],
  ',': [27, 19, 37, 255],
  k: [13, 10, 18, 255],
  w: [236, 228, 200, 255],
  W: [246, 242, 233, 255],
  g: [189, 180, 151, 255],
  c: [54, 196, 180, 255],
  C: [170, 246, 236, 255],
  v: [90, 44, 128, 255],
};

const ART = `
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,..........,,,,,,,,,,,,,
,,,,,,,......vvvvvv......,,,,,,,
,,,,,,....vvv......vvv....,,,,,,
,,,,,...vv..kkkkkkkk..vv...,,,,,
,,,,...v..kkwwwwwwwwkk..v...,,,,
,,,,..v..kwwWWWWWWWWwwk..v..,,,,
,,,..v..kwWWWWWWWWWWWWwk..v..,,,
,,,..v.kwWWWWWWWWWWWWWWwk.v..,,,
,,,.v..kwWWWWWWWWWWWWWWwk..v.,,,
,,,.v.kwWWWWWWWWWWWWWWWWwk.v.,,,
,,,.v.kwWWkkkkWWWWkkkkWWwk.v.,,,
,,,.v.kwWkkcCkkWWkkcCkkWwk.v.,,,
,,,.v.kwWkcCCckWWkcCCckWwk.v.,,,
,,,.v.kwWkkcckkWWkkcckkWwk.v.,,,
,,,.v.kwWWkkkkWWWWkkkkWWwk.v.,,,
,,,.v.kgwWWWWWWkkWWWWWWwgk.v.,,,
,,,..v.kgwWWWWkkkkWWWWwgk.v..,,,
,,,..v..kgwwWWWWWWWWwwgk..v..,,,
,,,,..v..kggwWWWWWWwggk..v..,,,,
,,,,...v..kkgwkwkwkgkk..v...,,,,
,,,,,...v...kwkwkwkwk..v...,,,,,
,,,,,,...vv..kgkgkgk..vv..,,,,,,
,,,,,,,....vv.kkkkk.vv...,,,,,,,
,,,,,,,,......vvvvv.....,,,,,,,,
,,,,,,,,,,..............,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
`;

function art(): Uint8Array {
  const rows = ART.split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  const out = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const c = PAL[rows[y]?.[x] ?? ','] ?? PAL[',']!;
      out.set(c, (y * 32 + x) * 4);
    }
  }
  return out;
}

/** Pad an image to a square canvas of `size` filled with the background color. */
function pad(img: Uint8Array, w: number, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const bg = PAL[',']!;
  for (let i = 0; i < size * size; i++) out.set(bg, i * 4);
  const off = Math.floor((size - w) / 2);
  for (let y = 0; y < w; y++) {
    out.set(img.subarray(y * w * 4, (y + 1) * w * 4), ((y + off) * size + off) * 4);
  }
  return out;
}

export function generateIcons(): Record<string, Buffer> {
  const base = art();
  const out: Record<string, Buffer> = {};
  out['icons/icon-32.png'] = encodePng(32, 32, base);
  out['icons/icon-192.png'] = encodePng(192, 192, upscale(32, 32, base, 6));
  out['icons/icon-512.png'] = encodePng(512, 512, upscale(32, 32, base, 16));
  // Maskable: keep the art inside the 80% safe zone.
  out['icons/icon-maskable-512.png'] = encodePng(
    512,
    512,
    pad(upscale(32, 32, base, 12), 384, 512),
  );
  out['icons/apple-touch-icon.png'] = encodePng(180, 180, pad(upscale(32, 32, base, 5), 160, 180));
  return out;
}
