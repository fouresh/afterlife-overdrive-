import { TILESETS, pickWeighted, type TilesetDef } from '@ao/content';
import { Tile, type DungeonFloor } from '@ao/procgen';
import { TILE } from '@ao/shared';
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import type { Atlas } from './atlas';

const CHUNK = 16; // tiles per chunk side → 256×256 px textures

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

    const cw = Math.ceil(f.w / CHUNK);
    const ch = Math.ceil(f.h / CHUNK);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const canvas = document.createElement('canvas');
        canvas.width = CHUNK * TILE;
        canvas.height = CHUNK * TILE;
        const c = canvas.getContext('2d')!;
        c.imageSmoothingEnabled = false;
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
                if (!isPitLike(tileAt(x, y - 1))) {
                  c.fillStyle = ts.pitEdge;
                  c.fillRect(dx, dy, TILE, 2);
                }
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
                // Rim where the wall top meets walkable space.
                c.fillStyle = ts.rim;
                if (!solidAt(x - 1, y)) c.fillRect(dx, dy, 1, TILE);
                if (!solidAt(x + 1, y)) c.fillRect(dx + TILE - 1, dy, 1, TILE);
                if (!solidAt(x, y - 1)) c.fillRect(dx, dy, TILE, 1);
                any = true;
              }
            }
          }
        }
        if (!any) continue;
        const source = new CanvasSource({ resource: canvas, scaleMode: 'nearest' });
        const sprite = new Sprite(new Texture({ source }));
        sprite.x = cx * CHUNK * TILE;
        sprite.y = cy * CHUNK * TILE;
        this.container.addChild(sprite);
        this.chunks.push({ sprite, source, cx, cy });
      }
    }
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
