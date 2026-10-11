/**
 * Render a generated floor to PNG (4 px per tile) for visual review without a browser:
 *   pnpm floor-map <seed> [depth] [out.png] [biome]
 * Colors: floor grey, wall dark, door orange, locked door gold, pit black, spawns red,
 * chest yellow, stairs cyan, shop green, start white; room type tint on the floor.
 */
import { writeFileSync } from 'node:fs';
import { Tile, generateFloor } from '@ao/procgen';
import { encodePng, upscale } from '../apps/client/build/png';

const seed = Number(process.argv[2] ?? 1);
const depth = Number(process.argv[3] ?? 0);
const out = process.argv[4] ?? `floor-${seed}-${depth}.png`;
const biome = process.argv[5] ?? 'crypt';
const f = generateFloor({ seed, biome, depth, floors: biome === 'forest' ? 2 : 3 });
const img = new Uint8Array(f.w * f.h * 4);
const put = (x: number, y: number, c: [number, number, number]) =>
  img.set([...c, 255], (y * f.w + x) * 4);
const tint: Record<string, [number, number, number]> = {
  start: [90, 110, 90],
  combat: [80, 80, 96],
  key: [96, 90, 60],
  treasure: [110, 96, 40],
  shop: [50, 100, 60],
  miniboss: [110, 60, 60],
  boss: [130, 40, 60],
};
for (let y = 0; y < f.h; y++) {
  for (let x = 0; x < f.w; x++) {
    const t = f.tiles[y * f.w + x]!;
    const room = f.roomOf[y * f.w + x]!;
    let c: [number, number, number] = [20, 16, 30];
    if (t === Tile.Floor) c = room ? (tint[f.rooms[room - 1]!.type] ?? [80, 80, 96]) : [60, 58, 72];
    if (t === Tile.Door) c = [220, 130, 60];
    if (t === Tile.LockedDoor) c = [255, 210, 60];
    if (t === Tile.Pit) c = [0, 0, 0];
    put(x, y, c);
  }
}
for (const p of f.props) {
  const c: Record<string, [number, number, number]> = {
    chest: [255, 240, 0],
    stairs: [0, 255, 255],
    shop: [0, 255, 100],
    spikes: [160, 160, 170],
    pillar: [30, 30, 40],
    torch: [255, 150, 40],
  };
  if (c[p.kind]) put(p.x, p.y, c[p.kind]!);
}
for (const s of f.spawns) put(s.x, s.y, s.wave === 0 ? [255, 40, 40] : [180, 30, 120]);
put(f.start.x, f.start.y, [255, 255, 255]);
writeFileSync(out, encodePng(f.w * 4, f.h * 4, upscale(f.w, f.h, img, 4)));
console.log(
  `${out}: ${f.w}x${f.h}, rooms: ${f.rooms.map((r) => `${r.type}(${r.template})`).join(', ')}`,
);
