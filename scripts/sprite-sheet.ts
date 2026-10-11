/**
 * Renders every content sprite into one PNG for visual review (no browser needed):
 *   pnpm sprites [out.png]
 * Future sessions: open the PNG with the Read tool to look at the pixel art.
 */
import { writeFileSync } from 'node:fs';
import {
  C,
  CHAR_FRAME_COUNT,
  DEFAULT_APPEARANCE,
  HAIR_STYLES,
  allSprites,
  blitImage,
  composeCharacter,
  createImage,
  hexToRgb,
  rasterize,
} from '@ao/content';
import { encodePng, upscale } from '../apps/client/build/png';

const out = process.argv[2] ?? 'sprite-sheet.png';
// Frames are HD (ART_RES texels per world px): ×2 keeps the sheet readable at a glance.
const SCALE = 2;
const W = 1024;
const items: { w: number; h: number; img: ReturnType<typeof createImage> }[] = [];

const push = (img: ReturnType<typeof createImage>) => items.push({ w: img.w, h: img.h, img });
for (const def of allSprites()) {
  for (let f = 0; f < def.frames.length; f++) push(rasterize(def, f));
}
HAIR_STYLES.forEach((hairStyle, i) => {
  const frames = composeCharacter({
    ...DEFAULT_APPEARANCE,
    hairStyle,
    gender: i % 2 ? 'f' : 'm',
    hairColor: i * 2,
    clothColor: i,
    skin: i % 6,
  });
  for (let f = 0; f < CHAR_FRAME_COUNT; f++) push(frames[f]!);
});
const armored = composeCharacter(DEFAULT_APPEARANCE, {
  helmet: { shape: 'helm', material: 'iron' },
  chest: { shape: 'plate', material: 'steel' },
  boots: { material: 'iron' },
});
const mage = composeCharacter(
  { ...DEFAULT_APPEARANCE, gender: 'f', hairStyle: 'long' },
  { helmet: { shape: 'hood', material: 'arcane' }, chest: { shape: 'robe', material: 'arcane' } },
);
for (const f of [...armored, ...mage]) push(f);

// shelf pack
let x = 2;
let y = 2;
let rowH = 0;
const placed: { x: number; y: number; img: ReturnType<typeof createImage> }[] = [];
for (const it of items) {
  if (x + it.w + 2 > W) {
    x = 2;
    y += rowH + 2;
    rowH = 0;
  }
  placed.push({ x, y, img: it.img });
  x += it.w + 2;
  rowH = Math.max(rowH, it.h);
}
const H = y + rowH + 2;
const sheet = createImage(W, H);
const [br, bg, bb] = hexToRgb(C.black);
for (let i = 0; i < sheet.data.length; i += 4) {
  sheet.data[i] = br;
  sheet.data[i + 1] = bg;
  sheet.data[i + 2] = bb;
  sheet.data[i + 3] = 255;
}
for (const p of placed) blitImage(sheet, p.img, p.x, p.y);
writeFileSync(out, encodePng(W * SCALE, H * SCALE, upscale(W, H, sheet.data, SCALE)));
console.log(`wrote ${out} (${items.length} frames)`);
