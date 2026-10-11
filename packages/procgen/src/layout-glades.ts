import { datan2, dsin, type Rng } from '@ao/shared';
import { bfs } from './grid';
import { bspLayout, type Layout } from './layout-bsp';
import { Tile } from './tiles';

/**
 * Forest layout ("glades and paths"). Same room graph as the BSP crypt — so roles, doors,
 * keys and validation all work unchanged — but every rectangular room becomes an irregular
 * clearing among trees, and corridors become uneven trails.
 *
 * 1. BSP rooms + corridors (bspLayout).
 * 2. Each room is carved into a blob: an ellipse whose radius wobbles with the angle.
 * 3. Doorway lanes (2 tiles) are cut from each door to the clearing.
 * 4. Floor not reachable from the doors becomes trees again (no sealed pockets).
 * 5. Trails are widened here and there, never touching a clearing's tree ring, so clearings
 *    are still entered only through their doorways (combat rooms close them).
 */
export function gladesLayout(rng: Rng, roomTarget: number): Layout | null {
  const l = bspLayout(rng, roomTarget);
  if (!l) return null;
  const { w, h, tiles } = l;

  l.rooms.forEach((room, ri) => {
    const r = room.rect;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const rx = r.w / 2;
    const ry = r.h / 2;
    const p1 = rng.range(0, 6.28);
    const p2 = rng.range(0, 6.28);
    const a1 = rng.range(0.08, 0.18);
    const a2 = rng.range(0.05, 0.12);
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        const t = datan2(dy, dx);
        const lim = 1.05 + a1 * dsin(2 * t + p1) + a2 * dsin(3 * t + p2);
        if (d > lim) tiles[y * w + x] = Tile.Wall;
      }
    }
    // Doorway lanes into the clearing.
    for (const door of l.doors) {
      if (door.room !== ri) continue;
      for (const cell of door.cells) {
        let x = cell % w;
        let y = (cell - x) / w;
        const sx = x < r.x ? 1 : x >= r.x + r.w ? -1 : 0;
        const sy = sx !== 0 ? 0 : y < r.y ? 1 : -1;
        for (let k = 0; k < Math.max(r.w, r.h); k++) {
          x += sx;
          y += sy;
          if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) break;
          const i = y * w + x;
          if (
            tiles[i] === Tile.Floor &&
            Math.abs(x + 0.5 - cx) < rx * 0.6 &&
            Math.abs(y + 0.5 - cy) < ry * 0.6
          )
            break;
          tiles[i] = Tile.Floor;
        }
      }
    }
    // Pockets not reachable from the doorways go back to forest.
    const doorCells = l.doors.filter((d) => d.room === ri).flatMap((d) => d.cells);
    const inside = (i: number) => {
      const x = i % w;
      const y = (i - x) / w;
      return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    };
    const dist = bfs(w, h, doorCells, (i) => tiles[i] === Tile.Floor && inside(i));
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * w + x;
        if (tiles[i] === Tile.Floor && dist[i] === -1) tiles[i] = Tile.Wall;
      }
  });

  // Uneven trails: widen corridor floor next to itself, away from clearings and the map edge.
  const nearRoom = new Uint8Array(w * h);
  for (const room of l.rooms) {
    const r = room.rect;
    for (let y = r.y - 2; y < r.y + r.h + 2; y++)
      for (let x = r.x - 2; x < r.x + r.w + 2; x++)
        if (x >= 0 && y >= 0 && x < w && y < h) nearRoom[y * w + x] = 1;
  }
  const corridor: number[] = [];
  for (let i = 0; i < w * h; i++) if (tiles[i] === Tile.Floor && !nearRoom[i]) corridor.push(i);
  for (const i of corridor) {
    if (!rng.chance(0.22)) continue;
    const x = i % w;
    const y = (i - x) / w;
    const [dx, dy] = rng.pick([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const);
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 2 || ny < 2 || nx >= w - 2 || ny >= h - 2) continue;
    const n = ny * w + nx;
    if (!nearRoom[n] && tiles[n] === Tile.Wall) tiles[n] = Tile.Floor;
  }
  return l;
}
