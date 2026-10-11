import { ART_RES, TILESETS, pickWeighted, type TilesetDef } from '@ao/content';
import { Tile, type DungeonFloor } from '@ao/procgen';
import { TILE } from '@ao/shared';
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import type { Atlas } from './atlas';

const CHUNK = 16; // tiles per chunk side → 256×256 world px (512×512 texels at ART_RES 2)

function isWallLike(t: number): boolean {
  return t === Tile.Wall || t === Tile.Void;
}

/**
 * Bakes the static part of a floor (tiles, wall faces, shadows, rims, floor decor) into
 * 256×256 chunk textures. Only chunks near the camera are visible each frame.
 */
export class TilemapView {
  readonly container = new Container();
  private chunks: { sprite: Sprite; source: CanvasSource; cx: number; cy: number }[] = [];
  readonly tileset: TilesetDef;

  constructor(
    private atlas: Atlas,
    private floor: DungeonFloor,
  ) {
    this.tileset = TILESETS[floor.biome] ?? TILESETS.crypt!;
    this.bake();
  }

  private bake(): void {
    const f = this.floor;
    // Pillars and hub stations stand on solid tiles but are drawn as sprites over a floor.
    const pillarTiles = new Set(
      f.props
        .filter((p) => p.kind === 'pillar' || p.kind === 'station')
        .map((p) => p.y * f.w + p.x),
    );
    const decorByTile = new Map<number, string[]>();
    for (const p of f.props) {
      const id = this.tileset.decor[p.kind];
      if (!id) continue;
      const k = p.y * f.w + p.x;
      const list = decorByTile.get(k) ?? [];
      list.push(id);
      decorByTile.set(k, list);
    }
    const ts = this.tileset;
    const tileAt = (x: number, y: number) =>
      x < 0 || y < 0 || x >= f.w || y >= f.h ? Tile.Void : f.tiles[y * f.w + x]!;
    const solidAt = (x: number, y: number) =>
      isWallLike(tileAt(x, y)) && !pillarTiles.has(y * f.w + x);

    const shade = shadeMap(f, solidAt, ts.background);

    const cw = Math.ceil(f.w / CHUNK);
    const ch = Math.ceil(f.h / CHUNK);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const canvas = document.createElement('canvas');
        canvas.width = CHUNK * TILE * ART_RES;
        canvas.height = CHUNK * TILE * ART_RES;
        const c = canvas.getContext('2d')!;
        c.imageSmoothingEnabled = false;
        // Draw in world pixels; texels land 1:1 on the chunk canvas.
        c.scale(ART_RES, ART_RES);
        const hair = 1 / ART_RES; // one texel
        let any = false;
        for (let ty = 0; ty < CHUNK; ty++) {
          for (let tx = 0; tx < CHUNK; tx++) {
            const x = cx * CHUNK + tx;
            const y = cy * CHUNK + ty;
            if (x >= f.w || y >= f.h) continue;
            const i = y * f.w + x;
            const t = f.tiles[i]!;
            const v = f.variant[i]!;
            const dx = tx * TILE;
            const dy = ty * TILE;
            const wall = solidAt(x, y);
            if (!wall) {
              any = true;
              if (t === Tile.Pit) {
                c.fillStyle = ts.pit;
                c.fillRect(dx, dy, TILE, TILE);
                // Depth: a lit lip on top, the far wall falling into darkness below it,
                // thin edges on the sides.
                if (!isPitLike(tileAt(x, y - 1))) {
                  c.fillStyle = ts.pitEdge;
                  c.fillRect(dx, dy, TILE, hair * 2);
                  c.globalAlpha = 0.45;
                  c.fillRect(dx, dy + hair * 2, TILE, hair * 3);
                  c.globalAlpha = 0.2;
                  c.fillRect(dx, dy + hair * 5, TILE, hair * 4);
                  c.globalAlpha = 1;
                }
                c.globalAlpha = 0.5;
                c.fillStyle = ts.pitEdge;
                if (!isPitLike(tileAt(x - 1, y))) c.fillRect(dx, dy, hair, TILE);
                if (!isPitLike(tileAt(x + 1, y))) c.fillRect(dx + TILE - hair, dy, hair, TILE);
                c.globalAlpha = 1;
                // A few glints (water in the forest, dust in the crypt).
                c.fillStyle = ts.pitEdge;
                c.globalAlpha = 0.35;
                c.fillRect(dx + (v % 11) + 2, dy + ((v >> 4) % 10) + 4, 3, 1);
                c.fillRect(dx + ((v >> 2) % 9) + 3, dy + ((v >> 5) % 6) + 8, 2, 1);
                c.globalAlpha = 1;
                continue;
              }
              this.atlas.drawTo(c, ts.floor, pickWeighted(ts.floorWeights, v), dx, dy);
              // Shadow cast by the wall face above.
              if (solidAt(x, y - 1)) {
                c.fillStyle = 'rgba(8,5,14,0.45)';
                c.fillRect(dx, dy, TILE, 5);
                c.fillStyle = 'rgba(8,5,14,0.25)';
                c.fillRect(dx, dy + 5, TILE, 3);
              }
              if (solidAt(x - 1, y)) {
                c.fillStyle = 'rgba(8,5,14,0.25)';
                c.fillRect(dx, dy, 3, TILE);
              }
              for (const id of decorByTile.get(i) ?? []) this.atlas.drawTo(c, id, v, dx, dy);
            } else {
              const below = tileAt(x, y + 1);
              const faceVisible = !isWallLike(below) || pillarTiles.has((y + 1) * f.w + x);
              if (faceVisible && t !== Tile.Void) {
                any = true;
                this.atlas.drawTo(c, ts.wallFace, pickWeighted(ts.wallFaceWeights, v), dx, dy);
              } else {
                this.atlas.drawTo(
                  c,
                  ts.wallTop,
                  ts.wallTopWeights ? pickWeighted(ts.wallTopWeights, v) : 0,
                  dx,
                  dy,
                );
                // Rim where the wall top meets walkable space (one texel, plus a soft inner one).
                // Leafy walls get scalloped clumps instead (see overhang), not a ruler line.
                if (!ts.overhang) {
                  c.fillStyle = ts.rim;
                  if (!solidAt(x - 1, y)) c.fillRect(dx, dy, hair, TILE);
                  if (!solidAt(x + 1, y)) c.fillRect(dx + TILE - hair, dy, hair, TILE);
                  if (!solidAt(x, y - 1)) c.fillRect(dx, dy, TILE, hair);
                  c.globalAlpha = 0.35;
                  if (!solidAt(x - 1, y)) c.fillRect(dx + hair, dy, hair, TILE);
                  if (!solidAt(x + 1, y)) c.fillRect(dx + TILE - 2 * hair, dy, hair, TILE);
                  if (!solidAt(x, y - 1)) c.fillRect(dx, dy + hair, TILE, hair);
                  c.globalAlpha = 1;
                }
                any = true;
              }
            }
          }
        }
        if (!any) continue;
        if (ts.overhang) {
          // Includes a one-tile margin: clumps of a wall in the next chunk spill into this one.
          for (let ty = -1; ty <= CHUNK; ty++)
            for (let tx = -1; tx <= CHUNK; tx++) {
              const x = cx * CHUNK + tx;
              const y = cy * CHUNK + ty;
              if (!solidAt(x, y) || !solidAt(x, y + 1)) continue; // canopy tops only
              const frame = ts.wallTopWeights
                ? pickWeighted(ts.wallTopWeights, f.variant[y * f.w + x] ?? 0)
                : 0;
              const dx = tx * TILE;
              const dy = ty * TILE;
              const seed = y * f.w + x;
              if (!solidAt(x - 1, y)) this.overhang(c, ts, frame, dx, dy, -1, 0, seed);
              if (!solidAt(x + 1, y)) this.overhang(c, ts, frame, dx, dy, 1, 0, seed + 1);
              if (!solidAt(x, y - 1)) this.overhang(c, ts, frame, dx, dy, 0, -1, seed + 2);
            }
        }
        // One texel of the shade map per tile, stretched with smoothing: soft gradients.
        c.imageSmoothingEnabled = true;
        c.drawImage(shade, -cx * CHUNK * TILE, -cy * CHUNK * TILE, f.w * TILE, f.h * TILE);
        c.imageSmoothingEnabled = false;
        const source = new CanvasSource({
          resource: canvas,
          scaleMode: 'nearest',
          resolution: ART_RES,
        });
        const sprite = new Sprite(new Texture({ source }));
        sprite.x = cx * CHUNK * TILE;
        sprite.y = cy * CHUNK * TILE;
        this.container.addChild(sprite);
        this.chunks.push({ sprite, source, cx, cy });
      }
    }
  }

  /**
   * Scalloped clumps of the wall top spilling from the wall tile at (dx, dy) into its walkable
   * neighbour in direction (ox, oy): soft shadow, dark outline, then the wall texture itself
   * (drawn as if the wall continued, so the clumps match the canopy pattern).
   */
  private overhang(
    c: CanvasRenderingContext2D,
    ts: TilesetDef,
    frame: number,
    dx: number,
    dy: number,
    ox: number,
    oy: number,
    seed: number,
  ): void {
    const nx = dx + ox * TILE;
    const ny = dy + oy * TILE;
    // Edge line between the two tiles, and the direction along it.
    const ex = ox > 0 ? dx + TILE : dx;
    const ey = oy < 0 ? dy : dy;
    const along = ox !== 0;
    const bumps: [number, number, number][] = [];
    for (let k = 0; k < 3; k++) {
      const t = 2.5 + k * 5.5 + (hash01(k, seed, 3) - 0.5) * 2;
      const r = 2.6 + hash01(k, seed, 4) * 1.8;
      const out = 0.4 + hash01(k, seed, 5) * 1.1;
      bumps.push(along ? [ex + ox * out, dy + t, r] : [dx + t, ey + oy * out, r]);
    }
    const hair = 1 / ART_RES;
    const disc = (grow: number, sx: number, sy: number) => {
      c.beginPath();
      for (const [bx, by, r] of bumps) {
        c.moveTo(bx + sx + r + grow, by + sy);
        c.arc(bx + sx, by + sy, r + grow, 0, Math.PI * 2);
      }
    };
    c.save();
    c.beginPath();
    c.rect(nx, ny, TILE, TILE);
    c.clip();
    // Shadow falls away from the wall and a little down (light comes from above).
    disc(0.8, ox * 1.2, 1.4);
    c.fillStyle = 'rgba(4,10,6,0.38)';
    c.fill();
    disc(hair, 0, 0);
    c.fillStyle = ts.overhang!;
    c.fill();
    disc(0, 0, 0);
    c.clip();
    this.atlas.drawTo(c, ts.wallTop, frame, nx, ny);
    c.restore();
  }

  /** Hide chunks outside the camera rectangle (world px). */
  cull(left: number, top: number, w: number, h: number): void {
    const size = CHUNK * TILE;
    for (const ch of this.chunks) {
      const x = ch.cx * size;
      const y = ch.cy * size;
      ch.sprite.visible = x < left + w && x + size > left && y < top + h && y + size > top;
    }
  }

  destroy(): void {
    for (const ch of this.chunks) {
      ch.sprite.destroy();
      ch.source.destroy();
    }
    this.chunks = [];
    this.container.destroy();
  }
}

function isPitLike(t: number): boolean {
  return t === Tile.Pit;
}

/** Cheap integer hash → [0, 1) (cosmetic, deterministic per floor). */
function hash01(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise with cells of `cell` tiles. */
function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(gx, gy, seed);
  const b = hash01(gx + 1, gy, seed);
  const c = hash01(gx, gy + 1, seed);
  const d = hash01(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Darkness of a wall tile by its distance (in tiles) to walkable ground. */
const WALL_DEPTH_SHADE = [0, 0, 0.42, 0.68, 0.84];

/**
 * Per-tile shade map (1 px per tile, drawn stretched and smoothed over the baked chunks):
 * - walls sink into darkness away from walkable ground, so paths read at a glance;
 * - the floor gets large soft patches of shade, breaking the 16 px tile repetition.
 */
function shadeMap(
  f: DungeonFloor,
  solidAt: (x: number, y: number) => boolean,
  background: string,
): HTMLCanvasElement {
  const { w, h } = f;
  // Chebyshev distance from walkable tiles (BFS, capped).
  const max = WALL_DEPTH_SHADE.length - 1;
  const depth = new Uint8Array(w * h).fill(max);
  const queue: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!solidAt(x, y)) {
        depth[y * w + x] = 0;
        queue.push(y * w + x);
      }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const d = depth[i]!;
    if (d + 1 >= max) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (depth[n]! > d + 1) {
          depth[n] = d + 1;
          queue.push(n);
        }
      }
  }
  const bg = parseInt(background.slice(1), 16);
  const br = bg >> 16;
  const bgG = (bg >> 8) & 255;
  const bb = bg & 255;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const img = c.createImageData(w, h);
  const px = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      let a: number;
      if (depth[i]! > 0) {
        a = WALL_DEPTH_SHADE[depth[i]!]!;
      } else {
        // Two octaves: broad pools of shade plus smaller clumps.
        const n = valueNoise(x, y, 6, f.seed) * 0.7 + valueNoise(x, y, 2.5, f.seed + 7) * 0.3;
        a = Math.max(0, n - 0.46) * 0.3;
      }
      px[o] = br;
      px[o + 1] = bgG;
      px[o + 2] = bb;
      px[o + 3] = Math.round(a * 255);
    }
  }
  c.putImageData(img, 0, 0);
  return canvas;
}
